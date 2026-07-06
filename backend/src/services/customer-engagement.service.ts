/**
 * Cari aktivite / temas raporu servisi.
 *
 * Her satis temsilcisi KENDI sektorlerindeki carileri, admin/yonetici TUMUNU gorur
 * (customer-recovery ile ayni sektor-kodu scope mantigi). Rapor: cari B2B'de kayitli mi,
 * son giris + giris sikligi (gun), B2B siparis sayi/tutar/ortalama, durum rozeti, son
 * hatirlatma + temas gecmisi + sonraki takip. Hatirlatma/not tek "temas gecmisi"nde.
 *
 * GUVENLIK: satis temsilcisi sadece kendi sektorundeki cari icin temas ekleyip/gorebilir
 * (assertScope). Cari evreni Mikro getCariDetails'ten gelir (kayitsiz cariler de gorunur).
 */

import { prisma } from '../utils/prisma';
import mikroService from './mikroFactory.service';

type Ctx = { userId?: string; role?: string; assignedSectorCodes?: string[] };

const normalizeCode = (v: unknown) => String(v ?? '').trim().toLocaleUpperCase('tr-TR');
const DAY_MS = 86400000;
const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export type EngagementStatus = 'KAYITSIZ' | 'HIC_GIRMEMIS' | 'AKTIF' | 'YAVASLIYOR' | 'KAYIP_RISKI';

type CariRow = Awaited<ReturnType<typeof mikroService.getCariDetails>>[number];

// getCariDetails binlerce cari doner; kisa TTL cache hem rapor hem scope-check paylasir.
let _cariCache: { at: number; data: CariRow[] } | null = null;
async function loadCaris(): Promise<CariRow[]> {
  const now = Date.now();
  if (_cariCache && now - _cariCache.at < 60000) return _cariCache.data;
  const data = await mikroService.getCariDetails();
  _cariCache = { at: now, data };
  return data;
}

function endOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

function computeStatus(
  registered: boolean,
  lastLoginAt: Date | null,
  daysSince: number | null,
  freq: number | null
): EngagementStatus {
  if (!registered) return 'KAYITSIZ';
  if (!lastLoginAt) return 'HIC_GIRMEMIS';
  const d = daysSince ?? 0;
  // Ritim bilinmiyorsa beklenen ~7 gun. Bilinen ritmi kullan ama TABAN 3 gun (gunde
  // birkac kez girenler bir haftasonu bosluğunda "kayip riski" cikmasin).
  const base = freq && freq > 0 ? Math.max(freq, 3) : 7;
  if (d <= base * 1.5) return 'AKTIF';
  if (d <= base * 3) return 'YAVASLIYOR';
  return 'KAYIP_RISKI';
}

export interface EngagementRow {
  customerCode: string;
  customerName: string;
  sectorCode: string | null;
  city: string | null;
  phone: string | null;
  balance: number;
  registered: boolean;
  userId: string | null;
  lastLoginAt: Date | null;
  firstLoginAt: Date | null;
  loginCount: number;
  loginFrequencyDays: number | null;
  daysSinceLastLogin: number | null;
  orderCount: number;
  orderTotal: number;
  orderAvg: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  status: EngagementStatus;
  lastContactAt: Date | null;
  lastContactByName: string | null;
  contactCount: number;
  hasNotes: boolean;
  nextFollowUpDate: Date | null;
  assignedSalesRepName: string | null;
}

function sortRows(rows: EngagementRow[], sort?: string): EngagementRow[] {
  const urgency: Record<EngagementStatus, number> = {
    KAYIP_RISKI: 0, HIC_GIRMEMIS: 1, KAYITSIZ: 2, YAVASLIYOR: 3, AKTIF: 4,
  };
  const arr = [...rows];
  switch (sort) {
    case 'orderTotalDesc': arr.sort((a, b) => b.orderTotal - a.orderTotal); break;
    case 'lastLoginAsc': arr.sort((a, b) => (a.lastLoginAt?.getTime() ?? 0) - (b.lastLoginAt?.getTime() ?? 0)); break;
    case 'lastLoginDesc': arr.sort((a, b) => (b.lastLoginAt?.getTime() ?? 0) - (a.lastLoginAt?.getTime() ?? 0)); break;
    case 'lastContactAsc': arr.sort((a, b) => (a.lastContactAt?.getTime() ?? 0) - (b.lastContactAt?.getTime() ?? 0)); break;
    case 'nameAsc': arr.sort((a, b) => a.customerName.localeCompare(b.customerName, 'tr')); break;
    default: // 'urgency' (varsayilan): en cok ilgi bekleyen ustte
      arr.sort((a, b) => {
        const u = urgency[a.status] - urgency[b.status];
        if (u !== 0) return u;
        return (b.daysSinceLastLogin ?? 99999) - (a.daysSinceLastLogin ?? 99999);
      });
  }
  return arr;
}

function computeKpis(rows: EngagementRow[], now: Date) {
  const total = rows.length;
  const registered = rows.filter((r) => r.registered).length;
  const unregistered = total - registered;
  const neverLoggedIn = rows.filter((r) => r.registered && !r.lastLoginAt).length;
  const active30 = rows.filter((r) => r.daysSinceLastLogin != null && r.daysSinceLastLogin <= 30).length;
  const atRisk = rows.filter((r) => r.status === 'KAYIP_RISKI').length;
  const eod = endOfToday(now);
  const followUpDue = rows.filter((r) => r.nextFollowUpDate && r.nextFollowUpDate <= eod).length;
  const neverContacted = rows.filter(
    (r) => (r.status === 'KAYITSIZ' || r.status === 'HIC_GIRMEMIS' || r.status === 'KAYIP_RISKI') && !r.lastContactAt
  ).length;
  return {
    total, registered, registeredPct: total ? Math.round((registered / total) * 100) : 0,
    unregistered, neverLoggedIn, active30, atRisk, followUpDue, neverContacted,
  };
}

function computeRepBreakdown(rows: EngagementRow[]) {
  const map = new Map<string, { rep: string; total: number; registered: number; unregistered: number; neverLoggedIn: number; atRisk: number }>();
  for (const r of rows) {
    const key = r.assignedSalesRepName || '(atanmamış)';
    const cur = map.get(key) || { rep: key, total: 0, registered: 0, unregistered: 0, neverLoggedIn: 0, atRisk: 0 };
    cur.total += 1;
    if (r.registered) cur.registered += 1; else cur.unregistered += 1;
    if (r.registered && !r.lastLoginAt) cur.neverLoggedIn += 1;
    if (r.status === 'KAYIP_RISKI') cur.atRisk += 1;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

class CustomerEngagementService {
  private isRep(ctx: Ctx) {
    return ctx.role === 'SALES_REP';
  }
  private assignedSet(ctx: Ctx): Set<string> {
    return new Set((this.isRep(ctx) ? ctx.assignedSectorCodes || [] : []).map(normalizeCode).filter(Boolean));
  }

  /** Satis temsilcisi sadece kendi sektorundeki cari icin islem yapabilir. */
  private async assertScope(ctx: Ctx, customerCode: string): Promise<void> {
    if (!this.isRep(ctx)) return; // admin/yonetici: serbest
    const assigned = this.assignedSet(ctx);
    if (assigned.size === 0) throw new Error('Bu islem icin yetkiniz yok');
    const caris = await loadCaris();
    const cari = caris.find((c) => normalizeCode(c.code) === normalizeCode(customerCode));
    if (!cari || !cari.sectorCode || !assigned.has(normalizeCode(cari.sectorCode))) {
      throw new Error('Bu cari sizin sorumluluğunuzda değil');
    }
  }

  async getReport(ctx: Ctx, opts: {
    search?: string; status?: string; sort?: string; page?: number; limit?: number; onlyFollowUpDue?: boolean;
  } = {}) {
    const now = new Date();
    const isRep = this.isRep(ctx);
    const assigned = this.assignedSet(ctx);
    if (isRep && assigned.size === 0) {
      return { rows: [], total: 0, page: 1, limit: 100, kpis: computeKpis([], now), repBreakdown: [] };
    }

    const allCaris = await loadCaris();
    const scopedCaris = isRep
      ? allCaris.filter((c) => c.sectorCode && assigned.has(normalizeCode(c.sectorCode)))
      : allCaris;

    const codes = scopedCaris.map((c) => String(c.code).trim()).filter(Boolean);

    // B2B kullanicilar (ana + alt). Rep icin koda gore filtre; admin icin tum musteriler.
    const users = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER' as any,
        ...(isRep
          ? { OR: [{ mikroCariCode: { in: codes } }, { parentCustomer: { mikroCariCode: { in: codes } } }] }
          : {}),
      },
      select: {
        id: true, mikroCariCode: true, parentCustomerId: true,
        lastLoginAt: true, firstLoginAt: true, loginCount: true,
        displayName: true, mikroName: true, name: true,
        parentCustomer: { select: { mikroCariCode: true } },
      },
    });

    const userCariCode = new Map<string, string>(); // userId -> normalize(cari kodu)
    const mainByCode = new Map<string, typeof users[number]>(); // normCode -> ana kullanici (kayit + userId)
    const loginByCode = new Map<string, { last: Date | null; first: Date | null; count: number }>(); // household giris roll-up
    for (const u of users) {
      const code = normalizeCode(u.mikroCariCode || u.parentCustomer?.mikroCariCode || '');
      if (!code) continue;
      userCariCode.set(u.id, code);
      if (u.mikroCariCode) mainByCode.set(code, u);
      // Giris metrikleri household bazinda: alt kullanicilarin girisleri de sayilir.
      const lg = loginByCode.get(code) || { last: null, first: null, count: 0 };
      if (u.lastLoginAt && (!lg.last || u.lastLoginAt > lg.last)) lg.last = u.lastLoginAt;
      if (u.firstLoginAt && (!lg.first || u.firstLoginAt < lg.first)) lg.first = u.firstLoginAt;
      lg.count += u.loginCount || 0;
      loginByCode.set(code, lg);
    }

    // Siparisler (household roll-up): userId'ye gore grupla, cari koduna indir.
    const userIds = users.map((u) => u.id);
    const orderGroups = userIds.length
      ? await prisma.order.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds }, status: { in: ['APPROVED', 'PENDING'] as any } },
          _count: { _all: true }, _sum: { totalAmount: true }, _min: { createdAt: true }, _max: { createdAt: true },
        })
      : [];
    const orderByCode = new Map<string, { count: number; total: number; first: Date | null; last: Date | null }>();
    for (const g of orderGroups) {
      const code = userCariCode.get(g.userId);
      if (!code) continue;
      const cur = orderByCode.get(code) || { count: 0, total: 0, first: null, last: null };
      cur.count += g._count._all;
      cur.total += Number(g._sum.totalAmount || 0);
      const mn = g._min.createdAt, mx = g._max.createdAt;
      if (mn && (!cur.first || mn < cur.first)) cur.first = mn;
      if (mx && (!cur.last || mx > cur.last)) cur.last = mx;
      orderByCode.set(code, cur);
    }

    // Temas gecmisi ozeti (son + sayi + not var mi + sonraki takip). Tablo kucuk, hepsini cek.
    const contactLogs = await prisma.customerContactLog.findMany({
      orderBy: { contactedAt: 'desc' },
      select: { customerCode: true, contactedAt: true, contactedByName: true, note: true, followUpDate: true },
    });
    const contactByCode = new Map<string, { last: Date | null; lastBy: string | null; count: number; hasNotes: boolean; nextFollowUp: Date | null }>();
    for (const log of contactLogs) {
      const code = normalizeCode(log.customerCode);
      const cur = contactByCode.get(code) || { last: null, lastBy: null, count: 0, hasNotes: false, nextFollowUp: null };
      if (!cur.last) {
        // desc -> ilk gorulen = EN SON temas. Sonraki takip = en son temasin planladigi tarih
        // (varsa; gecmis/bugun de olabilir -> "bugun aranacaklar"da gorunsun). Yeni temas eskiyi gecersizler.
        cur.last = log.contactedAt;
        cur.lastBy = log.contactedByName;
        cur.nextFollowUp = log.followUpDate || null;
      }
      cur.count += 1;
      if (log.note && log.note.trim()) cur.hasNotes = true;
      contactByCode.set(code, cur);
    }

    // Sektor -> satis temsilcisi adi (satir + admin kirilimi icin).
    const reps = await prisma.user.findMany({
      where: { role: { in: ['SALES_REP', 'MANAGER'] as any } },
      select: { id: true, name: true, assignedSectorCodes: true },
    });
    const repBySector = new Map<string, string>();
    for (const r of reps) {
      for (const s of r.assignedSectorCodes || []) {
        const c = normalizeCode(s);
        if (c && !repBySector.has(c)) repBySector.set(c, r.name);
      }
    }

    const rows: EngagementRow[] = scopedCaris.map((c) => {
      const code = normalizeCode(c.code);
      const mainUser = mainByCode.get(code) || null;
      const registered = Boolean(mainUser);
      const login = loginByCode.get(code) || { last: null, first: null, count: 0 };
      const lastLoginAt = login.last;
      const firstLoginAt = login.first;
      const loginCount = login.count;
      const freq = firstLoginAt && lastLoginAt && loginCount > 1
        ? Math.max(0, (lastLoginAt.getTime() - firstLoginAt.getTime()) / DAY_MS) / (loginCount - 1)
        : null;
      const daysSince = lastLoginAt ? Math.floor((now.getTime() - lastLoginAt.getTime()) / DAY_MS) : null;
      const ord = orderByCode.get(code) || { count: 0, total: 0, first: null, last: null };
      const con = contactByCode.get(code) || { last: null, lastBy: null, count: 0, hasNotes: false, nextFollowUp: null };
      const name = mainUser?.displayName || mainUser?.mikroName || c.name || c.code;
      return {
        customerCode: c.code,
        customerName: name,
        sectorCode: c.sectorCode || null,
        city: c.city || null,
        phone: c.phone || null,
        balance: Number(c.balance || 0),
        registered,
        userId: mainUser?.id || null,
        lastLoginAt, firstLoginAt, loginCount,
        loginFrequencyDays: freq != null ? Math.round(freq * 10) / 10 : null,
        daysSinceLastLogin: daysSince,
        orderCount: ord.count,
        orderTotal: round2(ord.total),
        orderAvg: ord.count > 0 ? round2(ord.total / ord.count) : 0,
        firstOrderAt: ord.first, lastOrderAt: ord.last,
        status: computeStatus(registered, lastLoginAt, daysSince, freq),
        lastContactAt: con.last, lastContactByName: con.lastBy, contactCount: con.count, hasNotes: con.hasNotes,
        nextFollowUpDate: con.nextFollowUp,
        assignedSalesRepName: c.sectorCode ? repBySector.get(normalizeCode(c.sectorCode)) || null : null,
      };
    });

    const kpis = computeKpis(rows, now);
    const repBreakdown = !isRep ? computeRepBreakdown(rows) : [];

    // Filtre + arama + sonraki-takip.
    let filtered = rows;
    if (opts.status && opts.status !== 'all') filtered = filtered.filter((r) => r.status === opts.status);
    if (opts.onlyFollowUpDue) {
      const eod = endOfToday(now);
      filtered = filtered.filter((r) => r.nextFollowUpDate && r.nextFollowUpDate <= eod);
    }
    if (opts.search && opts.search.trim()) {
      const q = opts.search.trim().toLocaleLowerCase('tr-TR');
      filtered = filtered.filter(
        (r) => r.customerCode.toLocaleLowerCase('tr-TR').includes(q) || r.customerName.toLocaleLowerCase('tr-TR').includes(q)
      );
    }
    filtered = sortRows(filtered, opts.sort);

    const total = filtered.length;
    const limit = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 500) : 100;
    const page = opts.page && opts.page > 0 ? Math.floor(opts.page) : 1;
    const paged = filtered.slice((page - 1) * limit, (page - 1) * limit + limit);

    return { rows: paged, total, page, limit, kpis, repBreakdown };
  }

  async addContact(ctx: Ctx, customerCode: string, input: {
    customerName?: string; note?: string; channel?: string; outcome?: string; followUpDate?: string | null;
  }) {
    const code = String(customerCode || '').trim();
    if (!code) throw new Error('Cari kodu gerekli');
    await this.assertScope(ctx, code);

    let contactedByName: string | null = null;
    if (ctx.userId) {
      const u = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true, displayName: true, email: true } });
      contactedByName = u?.displayName || u?.name || u?.email || null;
    }

    return prisma.customerContactLog.create({
      data: {
        customerCode: code,
        customerName: input.customerName ? String(input.customerName).slice(0, 200) : null,
        contactedByUserId: ctx.userId || null,
        contactedByName,
        channel: input.channel ? String(input.channel).slice(0, 40) : null,
        note: input.note && String(input.note).trim() ? String(input.note).trim().slice(0, 2000) : null,
        outcome: input.outcome ? String(input.outcome).slice(0, 60) : null,
        followUpDate: input.followUpDate ? new Date(input.followUpDate) : null,
      },
    });
  }

  async getContacts(ctx: Ctx, customerCode: string) {
    const code = String(customerCode || '').trim();
    if (!code) throw new Error('Cari kodu gerekli');
    await this.assertScope(ctx, code);
    return prisma.customerContactLog.findMany({
      where: { customerCode: code },
      orderBy: { contactedAt: 'desc' },
    });
  }
}

export default new CustomerEngagementService();
