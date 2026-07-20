import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Database,
  FileText,
  LockKeyhole,
  Mail,
  Scale,
  ShieldCheck,
  Users,
} from 'lucide-react';

const sections = [
  {
    id: 'veriler',
    title: 'Hangi veriler işlenir?',
    icon: Database,
    content: (
      <ul className="space-y-2">
        <li><strong>Hesap ve iletişim:</strong> ad-soyad/unvan, kullanıcı ve iletişim bilgileri, müşteri/cari kodu ve hesap yetkileri.</li>
        <li><strong>Ticari işlem:</strong> sepet, teklif, sipariş, teslimat, fatura, ödeme ve ürün geçmişi bilgileri.</li>
        <li><strong>Talep ve destek:</strong> mesajlar, talepler, notlar, tercihler ve isteğinizle yüklediğiniz dosyalar.</li>
        <li><strong>İşlem güvenliği:</strong> oturum, giriş, IP, cihaz/tarayıcı, hata ve güvenlik kayıtları.</li>
        <li><strong>Kullanım:</strong> görüntülenen sayfa/ürün, arama, tıklama ve sepet etkileşimleri gibi portal kullanım kayıtları.</li>
      </ul>
    ),
  },
  {
    id: 'amaclar',
    title: 'Veriler hangi amaçlarla işlenir?',
    icon: ShieldCheck,
    content: (
      <ul className="space-y-2">
        <li>Hesabınızı doğrulamak ve müşteri portalını güvenli biçimde sunmak.</li>
        <li>Müşteriye özel ürün, fiyat, stok, teklif, sipariş, fatura ve ödeme süreçlerini yürütmek.</li>
        <li>Talep ve destek kayıtlarını sonuçlandırmak; bildirimleri ve operasyonel iletişimi sağlamak.</li>
        <li>Yetkisiz erişimi, hataları ve kötüye kullanımı önlemek; işlem kayıtlarını denetlemek.</li>
        <li>Portalın kullanılabilirliğini ve hizmet kalitesini ölçmek ve geliştirmek.</li>
        <li>Mevzuattan doğan saklama, ispat, denetim ve yetkili makam taleplerini yerine getirmek.</li>
      </ul>
    ),
  },
  {
    id: 'hukuki-sebep',
    title: 'Toplama yöntemi ve hukuki sebepler',
    icon: Scale,
    content: (
      <div className="space-y-3">
        <p>
          Veriler; hesabın şirket yetkililerince açılması, portal formları ve işlemleri, sistem kayıtları ile
          ERP, fatura ve ödeme entegrasyonları üzerinden elektronik olarak toplanır.
        </p>
        <p>
          İşleme faaliyetleri, niteliğine göre 6698 sayılı Kanun’un 5/2 maddesindeki sözleşmenin kurulması
          veya ifası, hukuki yükümlülüğün yerine getirilmesi, bir hakkın tesisi/kullanılması/korunması ve
          temel haklara zarar vermemek kaydıyla meşru menfaat şartlarına dayanır. Açık rıza gereken ayrı bir
          faaliyet olursa aydınlatma ve açık rıza süreçleri birbirinden ayrı yürütülür.
        </p>
      </div>
    ),
  },
  {
    id: 'aktarim',
    title: 'Kimlere ve neden aktarılabilir?',
    icon: Users,
    content: (
      <p>
        Veriler; hizmetin yürütülmesi için gerekli olduğu ölçüde yetkili şirket personeline, ERP/Mikro,
        barındırma, e-posta, e-fatura, ödeme ve teknik destek hizmeti veren tedarikçilere; teslimat veya
        ticari işlemin gerektirdiği iş ortaklarına ve hukuken yetkili kamu kurumlarına aktarılabilir.
        Her aktarım, ilgili hizmetin amacı ve gerekli veriyle sınırlandırılmalıdır.
      </p>
    ),
  },
  {
    id: 'saklama',
    title: 'Saklama ve güvenlik',
    icon: LockKeyhole,
    content: (
      <p>
        Veriler, işleme amacı ve ilgili mevzuatın gerektirdiği süre boyunca tutulur; süre sona erdiğinde
        yürürlükteki saklama-imha planına göre silinir, yok edilir veya anonim hale getirilir. Erişim
        sınırlandırma, kimlik doğrulama, kayıt izleme, yedekleme ve benzeri teknik/idari tedbirler uygulanır.
        Özel nitelikli veya işlem için gereksiz kişisel verileri destek dosyalarına yüklememeniz önerilir.
      </p>
    ),
  },
  {
    id: 'haklar',
    title: 'KVKK kapsamındaki haklarınız',
    icon: FileText,
    content: (
      <div className="space-y-3">
        <p>
          Kanun’un 11. maddesi kapsamında verinizin işlenip işlenmediğini öğrenme, bilgi isteme, amacına
          uygun kullanılıp kullanılmadığını öğrenme, aktarılan üçüncü kişileri bilme, yanlış veya eksik
          verinin düzeltilmesini isteme, şartları oluştuğunda silme/yok etme talep etme, otomatik analiz
          sonucuna itiraz etme ve hukuka aykırı işleme nedeniyle zararın giderilmesini isteme haklarına
          sahipsiniz.
        </p>
        <p>
          Resmî başvuru kanalı ve kimlik doğrulama yöntemi, veri sorumlusunun tam ticari unvanı ile birlikte
          şirket yetkilisi veya hukuk danışmanı tarafından doğrulanmadan bu taslak başvuru amacıyla
          kullanılmamalıdır. Aşağıdaki e-posta adresi yalnızca genel bilgi iletişimi içindir.
        </p>
      </div>
    ),
  },
];

export default function KvkkPage() {
  return (
    <main className="min-h-screen bg-[var(--surface-0)] text-[var(--ink-1)]">
      <div className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/home" className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700 hover:text-primary-900">
            <ArrowLeft className="h-4 w-4" />
            Portala dön
          </Link>
          <span className="text-xs font-medium text-[var(--ink-3)]">Son güncelleme: 20 Temmuz 2026</span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 to-white p-6 sm:p-8">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-700 text-white">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-700">Bakırcılar B2B · Taslak</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Müşteri Portalı KVKK Aydınlatma Metni Taslağı</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--ink-2)]">
            Bu taslak, Bakırcılar B2B müşteri portalı üzerinden gerçekleştirilen kişisel veri işleme
            faaliyetleri hakkında 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında bilgi vermek
            amacıyla hazırlanmıştır. Henüz yürürlüğe konmuş bir aydınlatma metni değildir.
          </p>
        </header>

        <aside className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 flex-none" />
            <div>
              <p className="font-semibold">Taslak — kullanıma alınmadan önce kurumsal doğrulama gerekir</p>
              <p className="mt-1">
                Veri sorumlusunun tam ticari unvanı, kayıtlı tebligat/KEP adresi, saklama süreleri ve varsa
                yurt dışı veri aktarımı şirket yetkilisi veya hukuk danışmanı tarafından doğrulanmalıdır.
                Bu alanlar repodaki doğrulanabilir bilgilerde bulunmadığı için uydurulmamıştır.
              </p>
            </div>
          </div>
        </aside>

        <section className="mt-5 rounded-xl border border-[var(--line)] bg-white p-5 sm:p-6" aria-labelledby="controller-heading">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 flex-none text-primary-700" />
            <div>
              <h2 id="controller-heading" className="text-lg font-bold">Veri sorumlusu ve resmî başvuru kanalı (doğrulanacak)</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-2)]">
                Veri sorumlusunun tam ticari unvanı, resmî adresi, KEP bilgisi ve KVKK başvuru kanalı henüz
                şirket veya hukuk yetkilisi tarafından doğrulanmamıştır. <strong>Bakırcılar Ambalaj</strong>{' '}
                marka adı tek başına tüzel kişi bilgisi olarak kabul edilmemelidir. Genel bilgi iletişimi:
              </p>
              <a className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary-700 hover:underline" href="mailto:info@bakircilarambalaj.com">
                <Mail className="h-4 w-4" />
                info@bakircilarambalaj.com
              </a>
            </div>
          </div>
        </section>

        <div className="mt-5 space-y-4">
          {sections.map(({ id, title, icon: Icon, content }) => (
            <section key={id} id={id} className="scroll-mt-5 rounded-xl border border-[var(--line)] bg-white p-5 sm:p-6" aria-labelledby={`${id}-heading`}>
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 flex-none text-primary-700" />
                <div className="min-w-0 flex-1">
                  <h2 id={`${id}-heading`} className="text-lg font-bold">{title}</h2>
                  <div className="mt-3 text-sm leading-6 text-[var(--ink-2)]">{content}</div>
                </div>
              </div>
            </section>
          ))}
        </div>

        <section className="mt-5 rounded-xl border border-[var(--line)] bg-white p-5 text-sm leading-6 text-[var(--ink-2)] sm:p-6">
          <h2 className="font-bold text-[var(--ink-1)]">Resmî kaynaklar</h2>
          <p className="mt-2">
            Metnin temel başlıkları Kişisel Verileri Koruma Kurumunun aydınlatma yükümlülüğü ve ilgili kişi
            hakları açıklamalarına göre hazırlanmıştır.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            <a href="https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-" target="_blank" rel="noreferrer" className="font-semibold text-primary-700 hover:underline">
              Aydınlatma yükümlülüğü
            </a>
            <a href="https://www.kvkk.gov.tr/Icerik/2036/Ilgili-Kisinin-Haklari" target="_blank" rel="noreferrer" className="font-semibold text-primary-700 hover:underline">
              İlgili kişinin hakları
            </a>
            <a href="https://www.kvkk.gov.tr/Icerik/8710/veri-sorumlulari-tarafindan-acik-riza-ve-aydinlatma-metinlerinin-ayri-ayri-duzenlenmesi-gerektigi-hakkinda-kisisel-verileri-koruma-kurulunun-18-02-2026-tarihli-ve-2026-347-sayili-ilke-kararina-iliskin-kamuoyu-duyurusu" target="_blank" rel="noreferrer" className="font-semibold text-primary-700 hover:underline">
              Aydınlatma ve açık rızanın ayrılması
            </a>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-[var(--ink-3)]">© {new Date().getFullYear()} Bakırcılar B2B</p>
      </div>
    </main>
  );
}
