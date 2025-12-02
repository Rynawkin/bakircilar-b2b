# 📊 MİKRO ERP RAPOR SEÇENEKLERİ

## 🏷️ STOK/ÜRÜN RAPORLARI

### 💰 Fiyat & Maliyet Analizi

1. **Zarar Edilen Ürünler Raporu**
   - Satış fiyatı < güncel maliyeti olan ürünler
   - Gösterim: Ürün adı, satış fiyatı, güncel maliyet, fark tutarı, fark yüzdesi
   - Sıralama: Zarar miktarına göre (büyükten küçüğe)

2. **Maliyet Güncellenmemiş Ürünler**
   - Güncel maliyet tarihi < son giriş tarihi olan ürünler
   - Gösterim: Ürün, güncel maliyet tarihi, son giriş tarihi, gün farkı
   - Sıralama: Gün farkına göre

3. **Anormal Fiyat Artışları**
   - Son giriş fiyatı > güncel maliyet × 1.5 (veya özel çarpan)
   - Gösterim: Ürün, eski maliyet, yeni maliyet, artış yüzdesi
   - Uyarı: Olağandışı fiyat artışları

4. **Marj Analizi**
   - Satış fiyatı ve güncel maliyet arasındaki kar marjı
   - Gösterim: Ürün, maliyet, satış fiyatı, kar tutarı, kar %
   - Filtreleme: Düşük marjlı ürünler (<10%, <20% vb.)

5. **Sıfır Maliyetli Ürünler**
   - Güncel maliyeti 0 veya NULL olan ürünler
   - Gösterim: Ürün, son giriş tarihi, son giriş fiyatı

### 📦 Stok Durumu

6. **Kritik Stok Seviyesi**
   - Stok < minimum stok seviyesi
   - Gösterim: Ürün, mevcut stok, min stok, fark, son satış tarihi
   - Filtreleme: Depoya göre

7. **Fazla Stok Uyarısı**
   - Stok > maksimum stok seviyesi
   - Gösterim: Ürün, mevcut stok, max stok, fazlalık, son 3 ay satış ortalaması

8. **Hareketsiz Stoklar**
   - Son X gün içinde hiç hareket görmemiş ürünler (30/60/90/180 gün)
   - Gösterim: Ürün, son hareket tarihi, stok miktarı, stok değeri
   - Sıralama: Stok değerine göre

9. **Depo Bazlı Stok Dağılımı**
   - Her deponun stok durumu
   - Gösterim: Ürün, Depo1, Depo2, Depo6, Depo7, Toplam
   - Filtreleme: Belirli depoda stoku olanlar/olmayanlar

10. **Negatif Stoklar**
    - Stok miktarı < 0 olan ürünler (sistem hatası)
    - Gösterim: Ürün, depo, miktar, son hareket
    - Acil müdahale gerekli

### 📊 Satış Analizi

11. **En Çok Satan Ürünler**
    - Son X ay içinde en çok satılan ürünler
    - Gösterim: Ürün, satış adedi, ciro, kar
    - Filtreleme: Tarih aralığı, müşteri, kategori

12. **En Az Satan Ürünler**
    - Son X ay içinde az satış yapılan ürünler
    - Gösterim: Ürün, satış adedi, stok miktarı
    - Öneri: Kampanya veya stok azaltma

13. **Düşüş Trendindeki Ürünler**
    - Satışları düşen ürünler (önceki dönem karşılaştırması)
    - Gösterim: Ürün, bu ay, geçen ay, değişim %

14. **Artış Trendindeki Ürünler**
    - Satışları artan ürünler
    - Gösterim: Ürün, bu ay, geçen ay, değişim %
    - Öneri: Stok artırma önerisi

### 🎯 Kategori Analizi

15. **Kategori Bazlı Performans**
    - Her kategorinin satış, kar, stok durumu
    - Gösterim: Kategori, ürün sayısı, toplam stok, satış, kar

16. **Pasif Ürünler**
    - Sistemde pasif olarak işaretlenmiş ancak stoku olan ürünler
    - Gösterim: Ürün, stok miktarı, stok değeri

---

## 👥 CARİ/MÜŞTER İ RAPORLARI

### 💳 Alacak/Borç Durumu

17. **Yüksek Riskli Cariler**
    - Ödeme süresi geçmiş yüksek alacaklı cariler
    - Gösterim: Cari, bakiye, vade geçmiş tutar, gün sayısı
    - Risk skoru hesaplama

18. **Vade Aşımı Uyarısı**
    - 30/60/90 gün vadesi geçmiş cariler
    - Gösterim: Cari, tutar, vade tarihi, gecikme günü
    - Filtreleme: Tutar aralığı, bölge

19. **Kredili Satış Limiti Dolmuş Cariler**
    - Limit aşımı olan veya limite yakın cariler
    - Gösterim: Cari, bakiye, limit, doluluk %

20. **Nakit Müşteri Analizi**
    - Sadece nakit ödeme yapan cariler
    - Gösterim: Cari, toplam alışveriş, ortalama sipariş tutarı

### 📈 Satış Performansı

21. **En Çok Alışveriş Yapan Müşteriler**
    - Son X ayda en yüksek cirolu cariler
    - Gösterim: Cari, sipariş sayısı, toplam ciro, ortalama sipariş
    - VIP müşteri belirleme

22. **Kayıp Müşteriler**
    - Daha önce alışveriş yapan ancak son X ayda alışveriş yapmayan
    - Gösterim: Cari, son alışveriş tarihi, gün farkı, eski ciro
    - Geri kazanma kampanyası önerisi

23. **Yeni Müşteriler**
    - Son X ayda ilk kez alışveriş yapan cariler
    - Gösterim: Cari, ilk sipariş tarihi, toplam alışveriş

24. **Düşük Aktiviteli Müşteriler**
    - Ayda 1'den az sipariş veren cariler
    - Gösterim: Cari, yıllık sipariş sayısı, potansiyel

25. **Müşteri Segmentasyonu**
    - A/B/C analizi (Pareto analizi)
    - A: %80 ciro yapan %20 müşteri
    - B: %15 ciro
    - C: %5 ciro

### 🎯 Bölge Analizi

26. **İl Bazlı Satış Raporu**
    - İllere göre müşteri sayısı ve satış
    - Gösterim: İl, müşteri sayısı, toplam satış, ortalama sipariş

27. **İlçe Bazlı Dağılım**
    - Detaylı bölgesel analiz
    - Gösterim: İl, ilçe, müşteri, satış

28. **Bölgeler Arası Karşılaştırma**
    - Farklı bölgelerin performans karşılaştırması
    - Grafikler ve trendler

### 🏢 Sektör Analizi

29. **Sektör Bazlı Satışlar**
    - Hangi sektörlerden ne kadar satış yapıldı
    - Gösterim: Sektör, müşteri sayısı, toplam satış

30. **Tedarikçi Analizi**
    - Tedarikçilere yapılan ödemeler ve siparişler
    - Gösterim: Tedarikçi, sipariş sayısı, toplam tutar, ortalama vade

---

## 📋 SİPARİŞ RAPORLARI

### ⏰ Bekleyen Siparişler

31. **Vade Geçmiş Siparişler**
    - Teslimat tarihi geçmiş ancak tamamlanmamış siparişler
    - Gösterim: Sipariş no, müşteri, ürün, vade, gecikme günü
    - Aciliyet sıralaması

32. **Kısmi Teslim Edilmiş Siparişler**
    - Bir kısmı teslim edilmiş, bir kısmı bekleyen
    - Gösterim: Sipariş, sipariş miktarı, teslim edilen, kalan

33. **Stokta Olmayan Ürün Siparişleri**
    - Sipariş var ama stok yok
    - Gösterim: Ürün, sipariş miktarı, mevcut stok, eksik

34. **Uzun Süre Bekleyen Siparişler**
    - 30 günden fazla bekleyen siparişler
    - Gösterim: Sipariş, bekle me süresi, müşteri

### 📊 Sipariş Analizi

35. **Aylık Sipariş Trendi**
    - Ay ay sipariş sayısı ve tutarı
    - Grafik: Line chart
    - Karşılaştırma: Geçen yıl aynı dönem

36. **Ortalama Sipariş Değeri**
    - Müşteri bazlı ortalama sipariş tutarı
    - Gösterim: Müşteri, sipariş sayısı, ortalama tutar

37. **Sipariş İptal Oranı**
    - İptal edilen siparişler
    - Gösterim: İptal nedeni, müşteri, tutar, tarih

38. **Ürün Bazlı Sipariş Analizi**
    - Hangi ürünlerden ne kadar sipariş alındı
    - Gösterim: Ürün, sipariş adedi, toplam tutar

---

## 📉 FİNANSAL RAPORLAR

### 💰 Karlılık Analizi

39. **Ürün Karlılık Raporu**
    - Her ürünün kar/zarar durumu
    - Gösterim: Ürün, satış tutarı, maliyet, kar, kar %

40. **Müşteri Karlılık Raporu**
    - Hangi müşterilerden ne kadar kar elde edildi
    - Gösterim: Müşteri, satış, maliyet, kar

41. **Kategori Karlılık Raporu**
    - Hangi kategoriler karlı/zararlı
    - Gösterim: Kategori, satış, maliyet, kar %

42. **Dönemsel Kar/Zarar**
    - Aylık/yıllık kar/zarar analizi
    - Grafik: Bar chart
    - Trend analizi

### 💵 Nakit Akışı

43. **Tahsilat Tahmini**
    - Önümüzdeki günlerde gelecek tahsilatlar
    - Gösterim: Tarih, müşteri, tutar
    - Nakit akış planlaması

44. **Ödeme Takvimi**
    - Tedarikçilere yapılacak ödemeler
    - Gösterim: Tarih, tedarikçi, tutar

---

## 🔍 ÖZEL ANALİZ RAPORLARI

45. **ABC Analizi (Pareto)**
    - Ürün/Müşteri bazlı önem sıralaması
    - A sınıfı: %80 değeri oluşturan
    - B sınıfı: %15 değeri oluşturan
    - C sınıfı: %5 değeri oluşturan

46. **Sezonsal Analiz**
    - Aylara göre satış trendleri
    - Hangi ürünler hangi aylarda satılıyor
    - Gelecek sezon için stok planlaması

47. **Ürün Kombinasyon Analizi**
    - Hangi ürünler birlikte satılıyor
    - Market basket analysis
    - Çapraz satış fırsatları

48. **Müşteri Yaşam Döngüsü (Customer Lifetime Value)**
    - Müşterinin toplam değeri
    - Gösterim: Müşteri, toplam satış, ortalama sipariş, sıklık

49. **Stok Devir Hızı**
    - Ürünlerin yılda kaç kez satıldığı
    - Gösterim: Ürün, ortalama stok, yıllık satış, devir hızı
    - Optimal stok seviyesi önerisi

50. **Fiyat Elastikiyeti Analizi**
    - Fiyat değişimlerinin satışa etkisi
    - Gösterim: Ürün, eski fiyat, yeni fiyat, satış değişimi

---

## 🎨 RAPOR ÖZELLİKLERİ

### Genel Özellikler:
- ✅ Excel export
- ✅ PDF export
- ✅ Grafikler (Chart.js ile)
- ✅ Filtreleme (tarih, müşteri, ürün, kategori vb.)
- ✅ Sıralama (tüm kolonlarda)
- ✅ Arama
- ✅ Toplam/Ortalama hesaplama
- ✅ Renkli uyarılar (kırmızı=kritik, sarı=uyarı, yeşil=normal)
- ✅ Dinamik dashboard
- ✅ Favori raporlar
- ✅ Otomatik mail gönderimi (günlük/haftalık)
- ✅ Drill-down (detaya inme)

### Filtreler:
- 📅 Tarih aralığı (bu ay, geçen ay, bu yıl, özel)
- 🏷️ Kategori
- 📦 Ürün
- 👤 Müşteri
- 🏢 Sektör
- 🌍 Bölge (il, ilçe)
- 🏭 Depo
- 💰 Tutar aralığı

---

## 🚀 ÖNCELİKLİ RAPORLAR (ÖNERİ)

İlk etapta en çok ihtiyaç duyulanlar:

### Kritik Önem (İlk 10):
1. ✅ Zarar Edilen Ürünler Raporu
2. ✅ Maliyet Güncellenmemiş Ürünler
3. ✅ Kritik Stok Seviyesi
4. ✅ Hareketsiz Stoklar
5. ✅ Vade Aşımı Uyarısı (Cariler)
6. ✅ En Çok Satan Ürünler
7. ✅ Vade Geçmiş Siparişler
8. ✅ Kayıp Müşteriler
9. ✅ Ürün Karlılık Raporu
10. ✅ Stok Devir Hızı

### Orta Önem (11-20):
11. Marj Analizi
12. Fazla Stok Uyarısı
13. En Çok Alışveriş Yapan Müşteriler
14. Kısmi Teslim Edilmiş Siparişler
15. Müşteri Segmentasyonu (ABC)
16. Kategori Bazlı Performans
17. İl Bazlı Satış Raporu
18. Aylık Sipariş Trendi
19. Düşüş Trendindeki Ürünler
20. Tahsilat Tahmini

Hangi raporları istersiniz? Numaralarını söyleyin, hepsini veya seçtiklerinizi implement edelim!
