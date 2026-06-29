# Admin Panel Redesign — İlerleme & Tamamlanma Defteri

Amaç: 67 admin ekranını yeni tasarıma çevirirken **hiçbir şeyi atlamadığımızdan emin olmak.**
Her ekran "Yeni" varyantı bitince, [CLAUDE-DESIGN-BRIEF-ADMIN-PANEL.md](CLAUDE-DESIGN-BRIEF-ADMIN-PANEL.md)
içindeki o ekrana ait HER alan/buton/kolon/modal/durum tek tek doğrulanır (🔍).

**Durum kodları:** ⬜ başlamadı · 🔶 devam · ✅ yeni varyant yazıldı · 🔍 brief'e göre doğrulandı (atlama yok)
**Yöntem:** her ekran `theme==='new' ? <Yeni/> : <Klasik/>`. Klasik kod dondurulup korunur (fallback/güvenlik). Default şu an `old`.

> **Mutlaka korunacak mevcut özellikler** (yeni tasarıma da taşınacak):
> - Stok ailesi yönlendirme uyarısı (teklif/sipariş kalem altı) — commit bfa6718
> - Gömülü AI asistanı (yüzen panel) + "AI ile analiz et" (teklif) + model seçimi — 3 commit

---

## 0. Shell & Altyapı
| # | Parça | Durum |
|---|---|---|
| 0.1 | Görünüm geçişi (yeni/klasik toggle + ilk-giriş pop-up) | ✅ (commit fb27703) |
| 0.2 | Yeni üst çubuk (AdminNavigationNew) — logo/nav/Diğerleri/Ayarlar/bildirim/kullanıcı/Görünüm/mobil | ✅ |
| 0.3 | Footer (yeni) | ⬜ |

## 1. Teklif & Sipariş (en kritik)
| # | Ekran | Route | Durum |
|---|---|---|---|
| 1.1 | Teklif Oluştur/Düzenle (+ sipariş modu) ⭐⭐⭐ | /quotes/new | ⬜ |
| 1.2 | Teklif Listesi | /quotes | ✅ (hook+Classic+New) |
| 1.3 | Teklifi Siparişe Çevir | /quotes/convert/[id] | ⬜ |
| 1.4 | Teklif Kalemleri | /quotes/lines | ✅ (hook+Classic+New) |
| 1.5 | Siparişler | /orders | ✅ (hook+Classic+New) |
| 1.6 | Sipariş Takip | /order-tracking | ✅ (hook+Classic+New) |

## 2. Dashboard & Operasyon
| # | Ekran | Route | Durum |
|---|---|---|---|
| 2.1 | Dashboard | /dashboard | ✅ (hook'a ayrıldı; Klasik birebir korundu, Yeni tasarım) |
| 2.2 | Operasyon Komuta Merkezi | /operations | ✅ (hook+Classic+New) |

## 3. Saha & Sıcak & Depo
| # | Ekran | Route | Durum |
|---|---|---|---|
| 3.1 | Saha Satış | /field-sales | ⬜ |
| 3.2 | Sıcak Satış | /hot-sales | ⬜ |
| 3.3 | Depo Kiosk | /warehouse | ⬜ |
| 3.4 | Perakende Satış | /warehouse/retail | ✅ (hook+Classic+New) |
| 3.5 | Resim Hata Talepleri | /warehouse/image-issues | ✅ (hook+Classic+New) |
| 3.6 | Ürün Ölçüleri | /product-dimensions | ✅ (hook+Classic+New) |

## 4. Müşteri / Cari
| # | Ekran | Route | Durum |
|---|---|---|---|
| 4.1 | Müşteriler (+ CariSelect/Edit/BulkUsers modalları) | /customers | ✅ (hook+Classic+New) |
| 4.2 | Cari 360 | /customer-360 | ✅ (hook+Classic+New) |
| 4.3 | Müşteri Portföyüm | /portfolio | ✅ (hook+Classic+New) |
| 4.4 | Anlaşmalı Fiyatlar | /customer-agreements | ✅ (hook+Classic+New) |
| 4.5 | Cari Arama (F10) | /search/customers | ✅ (hook+Classic+New) |

## 5. Vade
| # | Ekran | Route | Durum |
|---|---|---|---|
| 5.1 | Vade Takip (liste) | /vade | ✅ (hook+Classic+New) |
| 5.2 | Vade Müşteri Detay | /vade/customers/[id] | ✅ (hook+Classic+New) |
| 5.3 | Vade Atamaları | /vade/assignments | ✅ (hook+Classic+New) |
| 5.4 | Hatırlatma Takvimi | /vade/calendar | ✅ (hook+Classic+New) |
| 5.5 | Not Raporu | /vade/notes | ✅ (hook+Classic+New) |
| 5.6 | Vade Excel Import | /vade/import | ✅ (hook+Classic+New) |

## 6. Ürün / Fatura / Stok
| # | Ekran | Route | Durum |
|---|---|---|---|
| 6.1 | Ürün Yönetimi (+ ProductDetail modal) | /admin-products | ✅ (hook+Classic+New) |
| 6.2 | Faturalar (E-Fatura) | /einvoices | ✅ (hook+Classic+New) |
| 6.3 | Yeni Stok Açma | /stock-create | ✅ (hook+Classic+New) |
| 6.4 | Stok Arama (F10) | /search/stocks | ✅ (hook+Classic+New) |

## 7. Maliyet / Fiyat / Tedarik
| # | Ekran | Route | Durum |
|---|---|---|---|
| 7.1 | Tedarik Maliyetleri (Teyit/İhale dahil) | /supplier-costs | ⬜ |
| 7.2 | Tedarikçi İskonto Ayarları | /supplier-price-list-settings | ✅ (hook+Classic+New) |
| 7.3 | Tedarikçi Fiyat Karşılaştırma | /reports/supplier-price-lists | ✅ (hook+Classic+New) |
| 7.4 | Maliyet Güncelleme Uyarıları | /reports/cost-update-alerts | ✅ (hook+Classic+New) |
| 7.5 | Tüm Ürünler Maliyet/Fiyat Güncelleme | /reports/cost-update-all-products | ✅ (hook+Classic+New) |
| 7.6 | Fiyat Geçmişi | /reports/price-history | ✅ (hook+Classic+New) |

## 8. Talep / Kampanya / Banner / Override
| # | Ekran | Route | Durum |
|---|---|---|---|
| 8.1 | Talepler | /requests | ✅ (hook+Classic+New) |
| 8.2 | Kampanyalar | /campaigns | ✅ (hook+Classic+New) |
| 8.3 | Bannerlar | /banners | ✅ (hook+Classic+New) |
| 8.4 | Ürün Override (Vitrin Kontrolleri) | /product-overrides | ✅ (hook+Classic+New) |

## 9. Raporlar (genel + özel)
| # | Ekran | Route | Durum |
|---|---|---|---|
| 9.1 | Rapor Merkezi (indeks) | /reports | ✅ (hook+Classic+New) |
| 9.2 | En Çok Satan Ürünler | /reports/top-products | ✅ (hook+Classic+New) |
| 9.3 | En İyi Müşteriler | /reports/top-customers | ✅ (hook+Classic+New) |
| 9.4 | Kâr Marjı Analizi (019703) | /reports/margin-compliance | ✅ (hook+Classic+New) |
| 9.5 | Kâr Marjı Analizi (kopya) | /reports/profit-analysis | ✅ (hook+Classic+New) |
| 9.6 | Ürün Müşteri Detayı | /reports/product-customers/[productCode] | ✅ (hook+Classic+New) |
| 9.7 | Tamamlayıcı Ürün Eksikleri | /reports/complement-missing | ✅ (hook+Classic+New) |
| 9.8 | Cari Geri Kazanım | /reports/customer-recovery | ✅ (hook+Classic+New) |
| 9.9 | Bana Atanan Geri Kazanım | /reports/customer-recovery/actions | ✅ (hook+Classic+New) |
| 9.10 | Müşteri Sepetleri | /reports/customer-carts | ✅ (hook+Classic+New) |
| 9.11 | Müşteri Aktivite Takibi | /reports/customer-activity | ✅ (hook+Classic+New) |
| 9.12 | Personel Aktivite Takibi | /reports/staff-activity | ✅ (hook+Classic+New) |
| 9.13 | Saha Ziyaretleri | /reports/field-sales-visits | ✅ (hook+Classic+New) |
| 9.14 | Kategori Alım Kaybı | /reports/category-churn | ✅ (hook+Classic+New) |
| 9.15 | Kategori Fırsat Önerileri | /reports/category-opportunity | ✅ (hook+Classic+New) |

## 10. Üçarer & Aile
| # | Ekran | Route | Durum |
|---|---|---|---|
| 10.1 | Üçarer Depo ve MinMax | /reports/ucarer-depo | ⬜ |
| 10.2 | MinMax Hesaplanmayacaklar | /reports/ucarer-minmax-exclusions | ✅ (hook+Classic+New) |
| 10.3 | Stok Aile Yönetimi | /reports/product-families | ✅ (hook+Classic+New) |
| 10.4 | Fiyat Aile Yönetimi | /reports/price-families | ✅ (hook+Classic+New) |
| 10.5 | Fiyat Ailesi Maliyet Kontrolü | /reports/price-family-costs | ✅ (hook+Classic+New) |

## 11. Ayarlar
| # | Ekran | Route | Durum |
|---|---|---|---|
| 11.1 | Kategoriler (fiyatlandırma) | /categories | ✅ (hook+Classic+New) |
| 11.2 | Dışlama Kuralları | /exclusions | ✅ (hook+Classic+New) |
| 11.3 | Personel | /staff | ✅ (hook+Classic+New) |
| 11.4 | Rol İzinleri | /role-permissions | ✅ (hook+Classic+New) |
| 11.5 | Sistem Ayarları | /settings | ✅ (hook+Classic+New) |

---

### Son aşama — TAM DOĞRULAMA (kullanıcının istediği "hiçbir şey atlanmadı")
Tüm ekranlar ✅ olunca: her ekran brief'e göre tek tek 🔍 doğrulanır (her alan/buton/kolon/modal/durum var mı),
mevcut özel özellikler (stok-ailesi, AI) yerinde mi kontrol edilir; sonra `DEFAULT_ADMIN_THEME='new'` yapılıp
ilk-giriş pop-up'ı devreye alınır.
