# AI Asistan — Kalıcı Şirket Bilgisi (knowledge)

Bu klasördeki `.md` dosyaları, gömülü AI asistanının **sistem-promptuna** otomatik
eklenir (prompt-cache ile, maliyet düşük). Yani asistanı "eğitmenin" yolu burada
markdown dosyası **eklemek / düzenlemektir** — kod değişikliği gerekmez.

## Nasıl çalışır
- `ai-assistant.service.ts` açılışta bu klasördeki tüm `.md` dosyalarını **dosya adına
  göre sıralı** okuyup birleştirir ve sistem-promptuna ekler (toplam ~60.000 karakter
  üst sınırı).
- Konum override: `AI_KNOWLEDGE_DIR` ortam değişkeni (varsayılan: `backend/knowledge`).
- Değişiklik canlıya alındığında (deploy + restart) yeni bilgi geçerli olur.

## Kurallar (ÖNEMLİ)
- **SIR YAZMAYIN:** şifre, bağlantı dizesi, API anahtarı, IP, SSH, `.env`, sunucu adı.
- **PII YAZMAYIN:** müşteri ad/telefon/adres/vergi no.
- **Anlık sayı yazmayın:** stok/fiyat/maliyet/cari/vade gibi güncel sayılar asistana
  **araçlardan** (canlı sistemden) gelir. Buraya yalnızca **kalıcı/yapısal** bilgi yazın
  (iş modeli, terminoloji, depo kodları, fiyat listesi mantığı, akışlar).

## Dosyalar
- `00-sirket-profili.md` — şirket & operasyon profili (brieflerden damıtıldı).
- Yeni konu eklemek için: `10-...md`, `20-...md` gibi numaralı dosyalar ekleyin
  (numara sırası okuma sırasını belirler).
