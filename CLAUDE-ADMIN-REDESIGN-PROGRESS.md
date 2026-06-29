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
| 1.6 | Sipariş Takip | /order-tracking | ⬜ |

## 2. Dashboard & Operasyon
| # | Ekran | Route | Durum |
|---|---|---|---|
| 2.1 | Dashboard | /dashboard | ✅ (hook'a ayrıldı; Klasik birebir korundu, Yeni tasarım) |
| 2.2 | Operasyon Komuta Merkezi | /operations | ⬜ |

## 3. Saha & Sıcak & Depo
| # | Ekran | Route | Durum |
|---|---|---|---|
| 3.1 | Saha Satış | /field-sales | ⬜ |
| 3.2 | Sıcak Satış | /hot-sales | ⬜ |
| 3.3 | Depo Kiosk | /warehouse | ⬜ |
| 3.4 | Perakende Satış | /warehouse/retail | ⬜ |
| 3.5 | Resim Hata Talepleri | /warehouse/image-issues | ⬜ |
| 3.6 | Ürün Ölçüleri | /product-dimensions | ⬜ |

## 4. Müşteri / Cari
| # | Ekran | Route | Durum |
|---|---|---|---|
| 4.1 | Müşteriler (+ CariSelect/Edit/BulkUsers modalları) | /customers | ✅ (hook+Classic+New) |
| 4.2 | Cari 360 | /customer-360 | ⬜ |
| 4.3 | Müşteri Portföyüm | /portfolio | ⬜ |
| 4.4 | Anlaşmalı Fiyatlar | /customer-agreements | ⬜ |
| 4.5 | Cari Arama (F10) | /search/customers | ⬜ |

## 5. Vade
| # | Ekran | Route | Durum |
|---|---|---|---|
| 5.1 | Vade Takip (liste) | /vade | ⬜ |
| 5.2 | Vade Müşteri Detay | /vade/customers/[id] | ⬜ |
| 5.3 | Vade Atamaları | /vade/assignments | ⬜ |
| 5.4 | Hatırlatma Takvimi | /vade/calendar | ⬜ |
| 5.5 | Not Raporu | /vade/notes | ⬜ |
| 5.6 | Vade Excel Import | /vade/import | ⬜ |

## 6. Ürün / Fatura / Stok
| # | Ekran | Route | Durum |
|---|---|---|---|
| 6.1 | Ürün Yönetimi (+ ProductDetail modal) | /admin-products | ⬜ |
| 6.2 | Faturalar (E-Fatura) | /einvoices | ⬜ |
| 6.3 | Yeni Stok Açma | /stock-create | ⬜ |
| 6.4 | Stok Arama (F10) | /search/stocks | ⬜ |

## 7. Maliyet / Fiyat / Tedarik
| # | Ekran | Route | Durum |
|---|---|---|---|
| 7.1 | Tedarik Maliyetleri (Teyit/İhale dahil) | /supplier-costs | ⬜ |
| 7.2 | Tedarikçi İskonto Ayarları | /supplier-price-list-settings | ⬜ |
| 7.3 | Tedarikçi Fiyat Karşılaştırma | /reports/supplier-price-lists | ⬜ |
| 7.4 | Maliyet Güncelleme Uyarıları | /reports/cost-update-alerts | ⬜ |
| 7.5 | Tüm Ürünler Maliyet/Fiyat Güncelleme | /reports/cost-update-all-products | ⬜ |
| 7.6 | Fiyat Geçmişi | /reports/price-history | ⬜ |

## 8. Talep / Kampanya / Banner / Override
| # | Ekran | Route | Durum |
|---|---|---|---|
| 8.1 | Talepler | /requests | ⬜ |
| 8.2 | Kampanyalar | /campaigns | ⬜ |
| 8.3 | Bannerlar | /banners | ⬜ |
| 8.4 | Ürün Override (Vitrin Kontrolleri) | /product-overrides | ⬜ |

## 9. Raporlar (genel + özel)
| # | Ekran | Route | Durum |
|---|---|---|---|
| 9.1 | Rapor Merkezi (indeks) | /reports | ⬜ |
| 9.2 | En Çok Satan Ürünler | /reports/top-products | ⬜ |
| 9.3 | En İyi Müşteriler | /reports/top-customers | ⬜ |
| 9.4 | Kâr Marjı Analizi (019703) | /reports/margin-compliance | ⬜ |
| 9.5 | Kâr Marjı Analizi (kopya) | /reports/profit-analysis | ⬜ |
| 9.6 | Ürün Müşteri Detayı | /reports/product-customers/[productCode] | ⬜ |
| 9.7 | Tamamlayıcı Ürün Eksikleri | /reports/complement-missing | ⬜ |
| 9.8 | Cari Geri Kazanım | /reports/customer-recovery | ⬜ |
| 9.9 | Bana Atanan Geri Kazanım | /reports/customer-recovery/actions | ⬜ |
| 9.10 | Müşteri Sepetleri | /reports/customer-carts | ⬜ |
| 9.11 | Müşteri Aktivite Takibi | /reports/customer-activity | ⬜ |
| 9.12 | Personel Aktivite Takibi | /reports/staff-activity | ⬜ |
| 9.13 | Saha Ziyaretleri | /reports/field-sales-visits | ⬜ |
| 9.14 | Kategori Alım Kaybı | /reports/category-churn | ⬜ |
| 9.15 | Kategori Fırsat Önerileri | /reports/category-opportunity | ⬜ |

## 10. Üçarer & Aile
| # | Ekran | Route | Durum |
|---|---|---|---|
| 10.1 | Üçarer Depo ve MinMax | /reports/ucarer-depo | ⬜ |
| 10.2 | MinMax Hesaplanmayacaklar | /reports/ucarer-minmax-exclusions | ⬜ |
| 10.3 | Stok Aile Yönetimi | /reports/product-families | ⬜ |
| 10.4 | Fiyat Aile Yönetimi | /reports/price-families | ⬜ |
| 10.5 | Fiyat Ailesi Maliyet Kontrolü | /reports/price-family-costs | ⬜ |

## 11. Ayarlar
| # | Ekran | Route | Durum |
|---|---|---|---|
| 11.1 | Kategoriler (fiyatlandırma) | /categories | ⬜ |
| 11.2 | Dışlama Kuralları | /exclusions | ⬜ |
| 11.3 | Personel | /staff | ⬜ |
| 11.4 | Rol İzinleri | /role-permissions | ⬜ |
| 11.5 | Sistem Ayarları | /settings | ⬜ |

---

### Son aşama — TAM DOĞRULAMA (kullanıcının istediği "hiçbir şey atlanmadı")
Tüm ekranlar ✅ olunca: her ekran brief'e göre tek tek 🔍 doğrulanır (her alan/buton/kolon/modal/durum var mı),
mevcut özel özellikler (stok-ailesi, AI) yerinde mi kontrol edilir; sonra `DEFAULT_ADMIN_THEME='new'` yapılıp
ilk-giriş pop-up'ı devreye alınır.
