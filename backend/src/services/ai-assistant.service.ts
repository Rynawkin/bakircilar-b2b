/**
 * AI Assistant Service
 *
 * Sirket-ici (patron / yonetici / satisci) personel icin gomulu yapay zeka asistani.
 * Iki yetenek:
 *   1) chat()         -> dogal dilde soru-cevap (stok/fiyat/maliyet/marj/cari/siparis/vade)
 *   2) analyzeQuote() -> teklif olusturma ekraninda "AI ile analiz et" (opsiyonel kontrol)
 *
 * Mimari: ARAC-KULLANAN AJAN. Claude, asagidaki SALT-OKUMA araclara baglanir; araclar
 * mevcut, test edilmis servisleri cagirir. Model ham SQL yazmaz, Mikro'ya/DB'ye YAZMAZ.
 * Rol/sektor yetkisi arac seviyesinde uygulanir (SALES_REP yalniz kendi sektoru).
 *
 * Guvenlik:
 *  - Salt-okuma. Hicbir arac INSERT/UPDATE/DELETE yapmaz.
 *  - Aractan donen metin (urun adi vb.) VERIDIR, komut degil; model ona gore aksiyon almaz.
 *  - Denetim: kim ne sordu + hangi araclar cagrildi loglanir (PII iceren soru metni loglanmaz).
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { prisma } from '../utils/prisma';
import stockService from './stock.service';
import reportsService from './reports.service';
import customer360Service from './customer360.service';
import vadeService from './vade.service';
import supplierCostService from './supplier-cost.service';
import productComplementService from './product-complement.service';
import customerRecoveryService from './customer-recovery.service';

export interface AiUserContext {
  userId: string;
  role: string;
  assignedSectorCodes: string[];
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const ALL_SECTOR_ROLES = new Set(['HEAD_ADMIN', 'ADMIN', 'MANAGER']);

function canAccessAllSectors(role: string): boolean {
  return ALL_SECTOR_ROLES.has(role);
}

function scopeOf(user: AiUserContext) {
  return { role: user.role, assignedSectorCodes: user.assignedSectorCodes || [] };
}

// ===================== SECILEBILIR MODELLER =====================
// Kullanici sohbet/analizde model secebilir. Sadece bu listedeki id'ler kabul edilir.
export interface SelectableModel {
  id: string;
  label: string;
  tier: 'fast' | 'strong';
  note: string;
}

export const SELECTABLE_MODELS: SelectableModel[] = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6 — Hizli & Ekonomik',
    tier: 'fast',
    note: 'Gunluk sorular icin hizli ve dusuk maliyetli.',
  },
  {
    id: 'claude-opus-4-8',
    label: 'Opus 4.8 — En Guclu',
    tier: 'strong',
    note: 'Karmasik analiz/akil yurutme icin en yetenekli (daha yavas/pahali).',
  },
];

function resolveModel(requested: string | undefined, fallback: string): string {
  if (requested && SELECTABLE_MODELS.some((m) => m.id === requested)) return requested;
  return fallback;
}

// ===================== KALICI SIRKET BILGISI (knowledge) =====================
// backend/knowledge/*.md dosyalari sistem-promptuna gomulur (prompt-cache ile).
// "Egitmeye devam" = bu klasore .md dosyasi eklemek/duzenlemek. Sir/PII KOYMAYIN.
const KNOWLEDGE_DIR =
  process.env.AI_KNOWLEDGE_DIR || path.resolve(__dirname, '../../knowledge');
const KNOWLEDGE_CHAR_CAP = 60000;
let knowledgeCache: string | null = null;

function loadKnowledge(): string {
  if (knowledgeCache !== null) return knowledgeCache;
  try {
    if (!fs.existsSync(KNOWLEDGE_DIR)) {
      knowledgeCache = '';
      return '';
    }
    const files = fs
      .readdirSync(KNOWLEDGE_DIR)
      .filter((f) => f.toLowerCase().endsWith('.md') && f.toLowerCase() !== 'readme.md')
      .sort();
    const parts: string[] = [];
    let total = 0;
    for (const f of files) {
      if (total >= KNOWLEDGE_CHAR_CAP) break;
      try {
        const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf8').trim();
        if (!content) continue;
        const slice = content.slice(0, Math.max(0, KNOWLEDGE_CHAR_CAP - total));
        parts.push(slice);
        total += slice.length;
      } catch {
        /* tek dosya okunamazsa atla */
      }
    }
    knowledgeCache = parts.join('\n\n');
  } catch {
    knowledgeCache = '';
  }
  return knowledgeCache;
}

function buildSystem(base: string): string {
  const k = loadKnowledge();
  if (!k) return base;
  return (
    base +
    '\n\n# SIRKET BILGISI (kalici referans)\n' +
    'Asagidakiler Bakircilar sirketi ve B2B/Mikro sistemi hakkinda KALICI bilgidir. ' +
    'Guncel sayilar (stok/fiyat/maliyet/cari/vade) icin DAIMA araclari kullan; bu metindeki bilgiler yapisaldir.\n\n' +
    k
  );
}

function clampLimit(value: any, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function sumStocks(warehouseStocks: any): number {
  if (!warehouseStocks || typeof warehouseStocks !== 'object') return 0;
  return Object.values(warehouseStocks).reduce(
    (acc: number, v: any) => acc + (Number(v) || 0),
    0
  );
}

// ===================== ARAC TANIMLARI (Claude tool-use) =====================

const TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: 'search_products',
    description:
      'Urun ara (Mikro kodu, urun adi, yabanci isim veya marka ile). Her urun icin guncel maliyet, son giris fiyati, KDV, ana saglayici ve toplam stok doner. Fiyat/maliyet/stok sorularinda once bunu kullan.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Aranacak metin (kod veya isim)' },
        limit: { type: 'number', description: 'Maksimum sonuc (varsayilan 10, max 25)' },
      },
      required: ['search'],
    },
  },
  {
    name: 'get_product_cost_detail',
    description:
      'Tek bir urunun (Mikro stok kodu ile) maliyet/tedarikci detayini getirir: guncel maliyet, en iyi tedarikci maliyeti, tedarikci sayisi, son giris ve kayitli tedarikci maliyet teklifleri.',
    input_schema: {
      type: 'object',
      properties: {
        productCode: { type: 'string', description: 'Mikro stok kodu (orn. B108423)' },
      },
      required: ['productCode'],
    },
  },
  {
    name: 'get_excess_stock',
    description:
      'Fazla stoklu urunleri listeler (yatan stok azaltma icin). Opsiyonel arama ve minimum fazla stok esigi ile filtrelenir. Her urun: fazla stok adedi, guncel maliyet, son giris fiyati, kategori.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Opsiyonel urun/kod araması' },
        minStock: { type: 'number', description: 'Minimum fazla stok adedi' },
        sort: { type: 'string', enum: ['excessStock', 'bestsellerValue'], description: 'Siralama' },
        limit: { type: 'number', description: 'Maksimum sonuc (varsayilan 20, max 30)' },
      },
      required: [],
    },
  },
  {
    name: 'search_customers',
    description:
      'Cari (musteri) ara (kod, unvan, sehir veya sektor ile). Sektor yetkisi otomatik uygulanir. Her cari: Mikro cari kodu, unvan, sektor kodu, guncel bakiye.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Aranacak metin' },
        limit: { type: 'number', description: 'Maksimum sonuc (varsayilan 10, max 25)' },
      },
      required: ['search'],
    },
  },
  {
    name: 'get_customer_360',
    description:
      'Bir carinin 360 ozeti: bakiye, siparis/teklif/sepet sayilari ve tutarlari, vade durumu ve risk sinifi, aktif anlasma sayisi, son aktivite. Cari B2B id veya Mikro cari kodu ile.',
    input_schema: {
      type: 'object',
      properties: {
        customerIdOrCode: { type: 'string', description: 'Cari B2B id veya Mikro cari kodu' },
      },
      required: ['customerIdOrCode'],
    },
  },
  {
    name: 'get_overdue_customers',
    description:
      'Vadesi gecmis bakiyesi olan cariler (tahsilat onceligi). Sektor yetkisi otomatik uygulanir. Vadesi gecen tutara gore sirali.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maksimum sonuc (varsayilan 20, max 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_top_products',
    description:
      'Belirli tarih araliginda en cok satan / en karli urunler. Ciro, maliyet, kar, kar marji, miktar, musteri sayisi. AGIR sorgu: tarih araligi ver.',
    input_schema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'YYYY-MM-DD (verilmezse son 12 ay)' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
        brand: { type: 'string' },
        category: { type: 'string' },
        sortBy: {
          type: 'string',
          enum: ['revenue', 'profit', 'profit_asc', 'margin', 'margin_asc', 'quantity'],
        },
        limit: { type: 'number', description: 'Varsayilan 20, max 30' },
      },
      required: [],
    },
  },
  {
    name: 'get_top_customers',
    description:
      'Belirli tarih araliginda en iyi / en karli musteriler. Ciro, kar, kar marji, siparis sayisi, ortalama siparis. AGIR sorgu: tarih araligi ver.',
    input_schema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'YYYY-MM-DD (verilmezse son 12 ay)' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
        sector: { type: 'string' },
        sortBy: { type: 'string', enum: ['revenue', 'profit', 'margin', 'orderCount'] },
        limit: { type: 'number', description: 'Varsayilan 20, max 30' },
      },
      required: [],
    },
  },
  {
    name: 'get_cost_anomalies',
    description:
      'Maliyet/fiyat risk ve firsat raporu: Mikro maliyeti en iyi tedarikciden yuksek, zarar riski, uzun suredir guncellenmeyen maliyet, tek tedarikci, yuksek fiyat farki vb. ozet + ornek satirlar.',
    input_schema: {
      type: 'object',
      properties: {
        staleDays: { type: 'number', description: 'Maliyet kac gundur guncellenmemis sayilsin' },
        search: { type: 'string' },
        limit: { type: 'number', description: 'Bolum basina ornek satir (varsayilan 5, max 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_lost_customers',
    description:
      'Kaybedilen / hareketi dusen riskli cariler (geri kazanim). Risk tipi, risk skoru, son satis, dusme orani, tahmini kayip, kayip kategori, onerilen aksiyon. Sektor yetkisi otomatik uygulanir.',
    input_schema: {
      type: 'object',
      properties: {
        recentMonths: { type: 'number', description: 'Son donem ay (varsayilan 3)' },
        sectorCode: { type: 'string' },
        minLostPotential: { type: 'number', description: 'Minimum tahmini kayip tutari' },
        limit: { type: 'number', description: 'Varsayilan 20, max 30' },
      },
      required: [],
    },
  },
  {
    name: 'get_cross_sell',
    description:
      'Bir urunle birlikte alinan tamamlayici/capraz urun onerileri (Mikro stok kodu ile). Otomatik (birlikte alim sikligi) ve manuel oneriler doner.',
    input_schema: {
      type: 'object',
      properties: {
        productCode: { type: 'string', description: 'Mikro stok kodu' },
      },
      required: ['productCode'],
    },
  },
  {
    name: 'get_margin_report',
    description:
      'Gunluk kar marji uyum raporu (019703): bekleyen siparis + fatura satirlarinin kar marji ozeti. KDV haric. Veri gece cron ile cachelenir; istenen gun hazir degilse uyari doner.',
    input_schema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'YYYY-MM-DD (verilmezse dun)' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
        status: { type: 'string', enum: ['HIGH', 'OK', 'LOW', 'NEGATIVE'] },
        limit: { type: 'number', description: 'Ornek satir (varsayilan 15, max 20)' },
      },
      required: [],
    },
  },
];

// ===================== ARAC YURUTUCU (salt-okuma) =====================

async function executeTool(
  name: string,
  input: any,
  user: AiUserContext
): Promise<any> {
  const scope = scopeOf(user);

  switch (name) {
    case 'search_products': {
      const limit = clampLimit(input.limit, 10, 25);
      const result: any = await supplierCostService.searchProducts({
        search: String(input.search || ''),
        limit,
      });
      const products = (result?.products || []).map((p: any) => ({
        mikroCode: p.mikroCode,
        name: p.name,
        unit: p.unit,
        vatRate: p.vatRate,
        currentCost: p.currentCost,
        lastEntryPrice: p.lastEntryPrice,
        mainSupplier: p.mainSupplier?.name || p.mainSupplier?.code || null,
        totalStock: sumStocks(p.warehouseStocks),
      }));
      return { count: products.length, products };
    }

    case 'get_product_cost_detail': {
      const detail: any = await supplierCostService.getProductDetail(
        String(input.productCode || '')
      );
      return {
        product: {
          code: detail?.product?.mikroCode,
          name: detail?.product?.name,
          unit: detail?.product?.unit,
          vatRate: detail?.product?.vatRate,
          mainSupplier: detail?.product?.mainSupplier?.name || null,
        },
        metrics: detail?.metrics || null,
        costs: (detail?.costs || []).slice(0, 10).map((c: any) => ({
          supplierName: c.supplierName,
          supplierCode: c.supplierCode,
          costT: c.costT,
          costP: c.costP,
          currency: c.currency,
          validUntil: c.validUntil,
          status: c.status,
        })),
      };
    }

    case 'get_excess_stock': {
      const limit = clampLimit(input.limit, 20, 30);
      const products: any[] = await stockService.getExcessStockProducts({
        search: input.search ? String(input.search) : undefined,
        minStock: Number.isFinite(Number(input.minStock)) ? Number(input.minStock) : undefined,
        sort: input.sort === 'bestsellerValue' ? 'bestsellerValue' : 'excessStock',
        limit,
      });
      return {
        count: products.length,
        products: products.map((p: any) => ({
          mikroCode: p.mikroCode,
          name: p.name,
          excessStock: p.excessStock,
          currentCost: p.currentCost,
          lastEntryPrice: p.lastEntryPrice,
          category: p.category?.name || null,
        })),
      };
    }

    case 'search_customers': {
      const limit = clampLimit(input.limit, 10, 25);
      const result: any = await customer360Service.searchCustomers({
        search: String(input.search || ''),
        limit,
        scope,
      });
      return { count: (result?.customers || []).length, customers: result?.customers || [] };
    }

    case 'get_customer_360': {
      const data: any = await customer360Service.getCustomer360({
        customerIdOrCode: String(input.customerIdOrCode || ''),
        scope,
      });
      return {
        customer: {
          code: data?.customer?.mikroCariCode,
          name: data?.customer?.displayName || data?.customer?.name,
          sectorCode: data?.customer?.sectorCode,
          groupCode: data?.customer?.groupCode,
          city: data?.customer?.city,
        },
        summary: data?.summary || null,
        vade: data?.vade
          ? {
              balance: data.vade.balance || null,
              classification: data.vade.classification || null,
            }
          : null,
      };
    }

    case 'get_overdue_customers': {
      const limit = clampLimit(input.limit, 20, 50);
      const userWhere: any = {};
      if (!canAccessAllSectors(user.role)) {
        const codes = user.assignedSectorCodes || [];
        if (codes.length === 0) return { count: 0, customers: [] };
        userWhere.sectorCode = { in: codes };
      }
      const rows = await prisma.vadeBalance.findMany({
        where: {
          pastDueBalance: { gt: 0 },
          ...(Object.keys(userWhere).length > 0 ? { user: userWhere } : {}),
        },
        include: {
          user: {
            select: {
              mikroCariCode: true,
              displayName: true,
              mikroName: true,
              name: true,
              sectorCode: true,
            },
          },
        },
        orderBy: { pastDueBalance: 'desc' },
        take: limit,
      });
      return {
        count: rows.length,
        customers: rows.map((r) => ({
          customerCode: r.user?.mikroCariCode,
          customerName: r.user?.displayName || r.user?.mikroName || r.user?.name,
          sectorCode: r.user?.sectorCode,
          pastDueBalance: r.pastDueBalance,
          totalBalance: r.totalBalance,
          valor: r.valor,
          pastDueDate: r.pastDueDate,
        })),
      };
    }

    case 'get_top_products': {
      const limit = clampLimit(input.limit, 20, 30);
      const result: any = await reportsService.getTopProducts({
        startDate: input.startDate,
        endDate: input.endDate,
        brand: input.brand,
        category: input.category,
        sortBy: input.sortBy,
        limit,
        page: 1,
      });
      return { summary: result?.summary || null, products: result?.products || [] };
    }

    case 'get_top_customers': {
      const limit = clampLimit(input.limit, 20, 30);
      const result: any = await reportsService.getTopCustomers({
        startDate: input.startDate,
        endDate: input.endDate,
        sector: input.sector,
        sortBy: input.sortBy,
        limit,
        page: 1,
      });
      return { summary: result?.summary || null, customers: result?.customers || [] };
    }

    case 'get_cost_anomalies': {
      const sampleLimit = clampLimit(input.limit, 5, 10);
      const result: any = await supplierCostService.getReports({
        staleDays: Number.isFinite(Number(input.staleDays)) ? Number(input.staleDays) : undefined,
        search: input.search ? String(input.search) : undefined,
        limit: 200,
      });
      const sections = result?.sections || {};
      const shaped: Record<string, any> = {};
      for (const key of Object.keys(sections)) {
        const arr = Array.isArray(sections[key]) ? sections[key] : [];
        shaped[key] = {
          count: arr.length,
          sample: arr.slice(0, sampleLimit).map((row: any) => ({
            productCode: row.productCode,
            productName: row.productName,
            currentCost: row.currentCost,
            bestCost: row.bestCost,
            bestSupplier: row.bestSupplier?.name || row.bestSupplier || null,
            diffPercent: row.diffPercent,
            spreadPercent: row.spreadPercent,
            reason: row.reason,
          })),
        };
      }
      return { summary: result?.summary || null, sections: shaped };
    }

    case 'get_lost_customers': {
      const limit = clampLimit(input.limit, 20, 30);
      const result: any = await customerRecoveryService.getReport(
        {
          recentMonths: Number.isFinite(Number(input.recentMonths))
            ? Number(input.recentMonths)
            : undefined,
          sectorCode: input.sectorCode,
          minLostPotential: Number.isFinite(Number(input.minLostPotential))
            ? Number(input.minLostPotential)
            : undefined,
          limit,
          page: 1,
        },
        {
          userId: user.userId,
          role: user.role,
          assignedSectorCodes: user.assignedSectorCodes,
        }
      );
      return {
        summary: result?.summary || null,
        customers: (result?.rows || []).map((r: any) => ({
          customerCode: r.customerCode,
          customerName: r.customerName,
          sectorCode: r.sectorCode,
          riskType: r.riskType,
          riskScore: r.riskScore,
          lastSaleDate: r.lastSaleDate,
          daysSinceLastSale: r.daysSinceLastSale,
          dropPercent: r.dropPercent,
          lostPotential: r.lostPotential,
          topLostCategory: r.topLostCategory,
          recommendedAction: r.recommendedAction,
        })),
      };
    }

    case 'get_cross_sell': {
      const product = await prisma.product.findFirst({
        where: { mikroCode: String(input.productCode || '') },
        select: { id: true, name: true, mikroCode: true },
      });
      if (!product) return { error: 'Urun bulunamadi: ' + input.productCode };
      const data: any = await productComplementService.getAdminComplements(product.id);
      const shape = (arr: any[]) =>
        (arr || []).slice(0, 10).map((c: any) => ({
          productCode: c.productCode,
          productName: c.productName,
          pairCount: c.pairCount,
        }));
      return {
        product: { code: product.mikroCode, name: product.name },
        auto: shape(data?.auto || []),
        manual: shape(data?.manual || []),
      };
    }

    case 'get_margin_report': {
      const limit = clampLimit(input.limit, 15, 20);
      try {
        const result: any = await reportsService.getMarginComplianceReport({
          startDate: input.startDate,
          endDate: input.endDate,
          status: input.status,
          limit,
          page: 1,
        });
        return {
          summary: result?.summary || null,
          sampleRows: (result?.data || []).slice(0, limit),
        };
      } catch (err: any) {
        const code = err?.code || err?.statusCode || err?.status;
        if (code === 409 || /not.?ready|hazir/i.test(err?.message || '')) {
          return {
            notReady: true,
            message:
              'Bu tarih icin kar marji raporu henuz hazirlanmadi (gece cron ile uretilir). Farkli bir gun deneyin.',
          };
        }
        return { error: err?.message || 'Kar marji raporu alinamadi' };
      }
    }

    default:
      return { error: 'Bilinmeyen arac: ' + name };
  }
}

// ===================== SISTEM PROMPTLARI =====================

const CHAT_SYSTEM = `Sen Bakircilar B2B sisteminin sirket-ici yapay zeka asistanisin. Kullanicilarin patron, yonetici ve satis personelidir. Onlara KENDI canli is verileri uzerinden Turkce yardim edersin.

GOREVIN: Stok, fazla stok, fiyat, maliyet, kar marji, cari/musteri, siparis, vade/tahsilat, tedarikci maliyetleri ve capraz satis gibi konularda dogal dil sorularini cevaplamak.

KURALLAR:
- Sayisal/somut her cevap MUTLAKA araclardan gelen gercek veriye dayanmali. Veriyi UYDURMA. Bir bilgiyi arac saglamiyorsa "bu veriye su an erisemiyorum" de.
- Salt-okumasin. Mikro'ya veya veritabanina YAZAMAZSIN. Kullanici "fiyati guncelle / siparis ver / teklif kaydet" derse: bunu SEN yapamazsin; ilgili ekranda nasil yapacagini soyle ve istenirse taslak/oneri hazirla.
- Yetki: Araclar cagiran kullanicinin rol/sektor yetkisiyle otomatik filtreler. Satis personeli yalniz kendi sektorunu gorur; bunu zorlamaya calisma.
- Para birimi TL. Tarihleri ve tutarlari net yaz. Gerektiginde kisa markdown tablo kullan.
- Kisa ve is-odakli ol. Cevabin sonunda mumkunse somut bir aksiyon onerisi ver (ornek: "Bu 5 fazla stoklu urunu gecmiste alan carilere teklif gonderilebilir").
- AGIR raporlarda (top urun/musteri, kar marji) tarih araligini netlestir; kullanici vermezse makul varsayilani kullan ve bunu belirt.
- Gizli bilgi (sifre, baglanti dizesi, API anahtari) asla isteme/yazma.`;

const ANALYZE_SYSTEM = `Sen bir B2B satis-teklif denetim asistanisin. Bir satis personelinin hazirladigi teklifi, musterinin ORIJINAL talebine ve sirketin verisine gore analiz edip teklifin basari/kazanma olasiligini ve eksiklerini degerlendirirsin. Amaç: teklif KAYDEDILMEDEN once hatalari/firsatlari yakalamak.

DEGERLENDIRME ACILARI (her teklif kalemi ve genel):
1) EKSIK SPESIFIKASYON: Musteri talebi belirsizse (orn. "Z havlu" / "Z pecete" ama kac yaprakli belirtilmemis) ve teklifte rekabetci olmayan bir varyant secilmisse uyar. Klasik ornek: musteri yaprak sayisi vermemis, satisci 200 yapraklik Z koymus -> rakip ayni talebe 100 yaprakligi sunar, fiyat dusuk gorunur, kazanma olasiligi DUSER. En rekabetci/uygun varyanti oner.
2) FIYAT REKABETCILIGI: Teklif birim fiyati, bu musterinin gecmis alis fiyatina / son satislara gore yuksek mi?
3) MARJ KONTROLU: Kalem maliyetin altinda mi, ya da marj cok dusuk/bloke (maliyetin %5 alti) mu?
4) MUSTERI GECMIS UYUMU: Bu musteri bu urunu daha once hangi spec/fiyatla aliyordu? Tutarli mi?
5) CAPRAZ/TAMAMLAYICI: Bu urunlerle birlikte genelde alinan ama teklifte olmayan kalem var mi?
6) BIRIM/KOLI/KATSAYI HATASI: Miktar ve birim mantikli mi (200 adet mi 200 koli mi)?
7) STOK/TEDARIK GERCEKCILIGI: Teklif edilen miktar stok/tedarik acisindan gercekci mi?
8) EKSIK KALEM: Musteri talebinde gecip teklife eklenmemis urun var mi?

ARAC KULLANIMI: Gerektiginde araclari kullanarak dogrula (get_product_cost_detail ile maliyet, get_customer_360 ile musteri gecmisi, search_products ile alternatif varyant/rakip spec, get_cross_sell ile tamamlayici). Veriyi uydurma.

CIKTI: SADECE asagidaki JSON'u dondur (markdown veya ek aciklama YOK), gecerli JSON olmali:
{
  "overall": { "verdict": "iyi" | "dikkat" | "riskli", "winProbability": "yuksek" | "orta" | "dusuk", "summary": "1-2 cumle Turkce ozet" },
  "findings": [
    {
      "severity": "info" | "warning" | "critical",
      "category": "eksik_spesifikasyon" | "fiyat_rekabetciligi" | "marj" | "musteri_gecmisi" | "capraz_satis" | "birim_hatasi" | "stok_gercekciligi" | "eksik_kalem" | "diger",
      "title": "kisa baslik (Turkce)",
      "detail": "aciklama (Turkce, somut sayilarla)",
      "suggestion": "somut oneri (Turkce)",
      "lineRef": "ilgili urun kodu/adi veya null"
    }
  ]
}
Bulgu yoksa "findings" bos dizi olsun ve verdict "iyi" olsun. Musteri talebi verilmemisse, talebi olmadan yapilabilen kontrolleri (marj, fiyat, capraz, birim) yine de yap ve eksik spesifikasyon icin "musteri talebi metni eklenirse daha iyi analiz edilir" notu dusun.`;

// ===================== ANTHROPIC ISTEMCI =====================

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!config.ai.enabled) {
    const e: any = new Error('AI yapilandirilmadi: ANTHROPIC_API_KEY tanimli degil.');
    e.statusCode = 503;
    throw e;
  }
  if (!client) {
    client = new Anthropic({ apiKey: config.ai.apiKey });
  }
  return client;
}

// Sistem promptunu + araclari prompt-cache ile gonder (maliyet tasarrufu).
function cachedSystem(text: string): any {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}
function cachedTools(): any {
  const tools = TOOL_DEFS.map((t) => ({ ...t })) as any[];
  if (tools.length > 0) {
    tools[tools.length - 1] = {
      ...tools[tools.length - 1],
      cache_control: { type: 'ephemeral' },
    };
  }
  return tools;
}

function extractText(message: Anthropic.Message): string {
  return (message.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();
}

/**
 * Ajan dongusu: model -> (gerekirse) arac cagrilari -> sonuc -> model -> ... -> nihai cevap.
 */
async function runAgentLoop(params: {
  user: AiUserContext;
  system: string;
  model: string;
  maxTokens: number;
  messages: Anthropic.MessageParam[];
  thinking?: boolean;
}): Promise<{ finalText: string; toolsUsed: string[]; steps: number }> {
  const anthropic = getClient();
  const messages = [...params.messages];
  const toolsUsed: string[] = [];
  let steps = 0;

  // ilk cagri + arac dongusu
  // (maxSteps: kac kez arac cagri turu yapilabilecegi)
  // her turda en az bir model cagrisi; +1 nihai cevap turu.
  for (let i = 0; i <= config.ai.maxSteps; i++) {
    const createParams: any = {
      model: params.model,
      max_tokens: params.maxTokens,
      system: cachedSystem(params.system),
      tools: cachedTools(),
      messages,
    };
    // Adaptif dusunme (Opus/Sonnet 4.6+): derin akil yurutme gerektiren analizde acilir.
    if (params.thinking) createParams.thinking = { type: 'adaptive' };
    const response = await anthropic.messages.create(createParams);
    steps++;

    if (response.stop_reason !== 'tool_use') {
      return { finalText: extractText(response), toolsUsed, steps };
    }

    // assistant'in arac-cagri mesajini ekle
    messages.push({ role: 'assistant', content: response.content as any });

    // her tool_use blogunu yurut, tool_result olarak dondur
    const toolResults: any[] = [];
    for (const block of response.content as any[]) {
      if (block.type !== 'tool_use') continue;
      toolsUsed.push(block.name);
      let resultJson: any;
      try {
        resultJson = await executeTool(block.name, block.input || {}, params.user);
      } catch (err: any) {
        resultJson = { error: err?.message || 'Arac calistirilamadi' };
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(resultJson).slice(0, 24000),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  // Adim limiti asildi: son bir kez araçsiz cevap iste
  const finalParams: any = {
    model: params.model,
    max_tokens: params.maxTokens,
    system: cachedSystem(params.system),
    messages,
  };
  if (params.thinking) finalParams.thinking = { type: 'adaptive' };
  const finalResp = await getClient().messages.create(finalParams);
  return { finalText: extractText(finalResp), toolsUsed, steps: steps + 1 };
}

function audit(user: AiUserContext, action: string, toolsUsed: string[]) {
  // KVKK: soru/cevap metni (PII icerebilir) loglanmaz; yalniz kim+ne tur+hangi araclar.
  console.info(
    `[AI] user=${user.userId} role=${user.role} action=${action} tools=[${toolsUsed.join(',')}]`
  );
}

// ===================== PUBLIC API =====================

class AiAssistantService {
  get enabled(): boolean {
    return config.ai.enabled;
  }

  /** Secilebilir modeller + varsayilanlar (UI icin). */
  get modelInfo() {
    return {
      models: SELECTABLE_MODELS,
      defaultChat: config.ai.model,
      defaultAnalysis: config.ai.analysisModel,
    };
  }

  /**
   * Dogal dil soru-cevap. messages = tum konusma gecmisi (sira: user/assistant...).
   */
  async chat(params: {
    user: AiUserContext;
    messages: AiChatMessage[];
    model?: string;
  }): Promise<{ reply: string; toolsUsed: string[]; model: string }> {
    const cleaned = (params.messages || [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content })) as Anthropic.MessageParam[];

    if (cleaned.length === 0) {
      return { reply: 'Lutfen bir soru yazin.', toolsUsed: [], model: config.ai.model };
    }

    const model = resolveModel(params.model, config.ai.model);
    const { finalText, toolsUsed } = await runAgentLoop({
      user: params.user,
      system: buildSystem(CHAT_SYSTEM),
      model,
      maxTokens: config.ai.maxTokens,
      messages: cleaned,
    });
    audit(params.user, 'chat', toolsUsed);
    return { reply: finalText || 'Cevap uretilemedi.', toolsUsed, model };
  }

  /**
   * Teklif analizi ("AI ile analiz et"). Teklif anlik goruntusu + opsiyonel musteri talebi.
   */
  async analyzeQuote(params: {
    user: AiUserContext;
    quote: any; // { customer, items, totals, profit, mode }
    requestText?: string;
    requestImageBase64?: string;
    requestImageMediaType?: string;
    model?: string;
  }): Promise<{ analysis: any; raw: string; toolsUsed: string[]; model: string }> {
    const quoteContext = JSON.stringify(params.quote || {}).slice(0, 20000);

    const userBlocks: any[] = [];
    if (params.requestImageBase64) {
      userBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: params.requestImageMediaType || 'image/jpeg',
          data: params.requestImageBase64,
        },
      });
    }
    userBlocks.push({
      type: 'text',
      text:
        'MUSTERI TALEBI (varsa):\n' +
        (params.requestText?.trim() || '(metin verilmedi)') +
        '\n\nTEKLIF (JSON):\n' +
        quoteContext +
        '\n\nYukaridaki teklifi analiz et ve SADECE istenen JSON formatini dondur.',
    });

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userBlocks }];

    const model = resolveModel(params.model, config.ai.analysisModel);
    const { finalText, toolsUsed } = await runAgentLoop({
      user: params.user,
      system: buildSystem(ANALYZE_SYSTEM),
      model,
      maxTokens: config.ai.analysisMaxTokens,
      messages,
      // Teklif analizi derin akil yurutme ister; adaptif dusunmeyi ac.
      thinking: true,
    });

    audit(params.user, 'analyze_quote', toolsUsed);

    // JSON cikar (modelin ek metin eklemesine karsi dayanikli)
    const parsed = this.safeParseJson(finalText);
    return {
      analysis:
        parsed || {
          overall: {
            verdict: 'dikkat',
            winProbability: 'orta',
            summary: 'Analiz ozeti uretildi ancak yapilandirilamadi. Ham cikti asagida.',
          },
          findings: [],
        },
      raw: finalText,
      toolsUsed,
      model,
    };
  }

  private safeParseJson(text: string): any | null {
    if (!text) return null;
    // dogrudan dene
    try {
      return JSON.parse(text);
    } catch {
      // fenced veya gomulu JSON ara
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = fence ? fence[1] : null;
      if (candidate) {
        try {
          return JSON.parse(candidate.trim());
        } catch {
          /* devam */
        }
      }
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(text.slice(start, end + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}

export default new AiAssistantService();
