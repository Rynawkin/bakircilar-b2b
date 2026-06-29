'use client';

/**
 * Yeni admin tasarımı için minimal footer (design 0.3).
 * Yalnızca "Yeni Görünüm" (theme==='new') aktifken render edilir; klasik görünüm
 * bu footer'ı göstermez (mevcut davranış korunur).
 */
export function AdminFooterNew() {
  const year = new Date().getFullYear();

  return (
    <footer style={{ borderTop: '1px solid #e7ebf2', background: '#fff' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 1900,
          margin: '0 auto',
          padding: '18px clamp(16px,2vw,32px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 18,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12.5, color: '#8b97ac' }}>
          © {year} Bakırcılar Toptan Dağıtım · Yönetim Paneli
        </span>
        <span style={{ fontSize: 12.5, color: '#64748b' }}>Mikro ERP bağlı · v2.0</span>
      </div>
    </footer>
  );
}
