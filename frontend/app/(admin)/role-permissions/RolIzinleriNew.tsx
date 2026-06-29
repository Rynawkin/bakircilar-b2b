'use client';

import { ShieldCheck, RotateCcw, Info, LayoutDashboard, BarChart3, Settings2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useRolIzinleri } from './useRolIzinleri';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

// Kategori başlıkları için lucide ikon eşlemesi (emoji yok)
const CATEGORY_ICONS: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  reports: BarChart3,
  admin: Settings2,
};

/**
 * Yeni görünüm Rol İzin Yönetimi ekranı. Mevcut TÜM mantık useRolIzinleri'den gelir; sadece görsel yeni.
 * Hiçbir handler/izin/koşul/kolon/sekme/rozet/modal/durum düşürülmemiştir; brief 4.13.4'teki her öğe mevcut.
 */
export default function RolIzinleriNew() {
  const {
    user,
    loading,
    saving,
    permissions,
    availablePermissions,
    permissionDescriptions,
    selectedRole,
    setSelectedRole,
    confirmDialog,
    closeConfirmDialog,
    togglePermission,
    resetRole,
    groupedPermissions,
    roles,
    ROLE_NAMES,
    PERMISSION_CATEGORIES,
  } = useRolIzinleri();

  // Yükleniyor durumu — yeni stil iskelet
  if (loading) {
    return (
      <div className="py-6">
        <div className={`${CARD} flex items-center gap-3 px-4 py-3.5`}>
          <span className="inline-block h-4 w-4 rounded-full border-2 border-[#d6e0f1] border-t-[#15356b] animate-spin" />
          <span className="text-[12.5px] text-[#8b97ac]">İzinler yükleniyor…</span>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'HEAD_ADMIN') {
    return null;
  }

  return (
    <div className="pb-8">
      {/* Başlık */}
      <div className="mt-6 mb-[18px] flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#14223b] m-0">
            Rol İzin Yönetimi
          </h1>
          <div className="text-[13px] text-[#8b97ac] mt-[5px]">
            İzinler anında kaydedilir · sadece HEAD_ADMIN
          </div>
        </div>
        {/* Varsayılana Sıfırla (ConfirmDialog tetikler) */}
        <button
          type="button"
          onClick={() => resetRole(selectedRole)}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-white border border-[#d8e0ec] rounded-lg px-[14px] py-[9px] text-[12.5px] font-medium text-[#51607a] cursor-pointer hover:bg-[#f4f6fa] disabled:opacity-50"
        >
          <RotateCcw width={14} height={14} stroke="currentColor" strokeWidth={2} />
          Varsayılana Sıfırla
        </button>
      </div>

      {/* Rol sekmeleri (pill) — ADMIN/MANAGER/SALES_REP/DEPOCU/CUSTOMER/DIVERSEY */}
      <div className="flex items-center gap-1 flex-wrap mb-4">
        {roles.map((role) => {
          const isActive = selectedRole === role;
          return (
            <button
              key={role}
              type="button"
              onClick={() => setSelectedRole(role)}
              className={`px-[14px] py-2 text-[12.5px] rounded-lg cursor-pointer transition-colors ${
                isActive
                  ? 'font-semibold text-[#15356b] bg-[#eef2fa] border border-[#d6e0f1]'
                  : 'font-medium text-[#64748b] border border-transparent hover:bg-[#f4f6fa]'
              }`}
            >
              {role}
            </button>
          );
        })}
      </div>

      {/* Seçili rol başlığı */}
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck width={16} height={16} stroke="#15356b" strokeWidth={2} />
        <span className="text-[14px] font-semibold text-[#14223b]">
          {ROLE_NAMES[selectedRole] || selectedRole} İzinleri
        </span>
      </div>

      {/* İzin kategorileri (kart) */}
      <div className="flex flex-col gap-3.5">
        {Object.entries(groupedPermissions).map(([category, perms]) => {
          const CatIcon = CATEGORY_ICONS[category] || Settings2;
          return (
            <div key={category} className={`${CARD} overflow-hidden`}>
              {/* Kategori başlığı */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#eef1f6] text-[13px] font-semibold text-[#14223b]">
                <CatIcon width={15} height={15} stroke="#15356b" strokeWidth={2} />
                {PERMISSION_CATEGORIES[category as keyof typeof PERMISSION_CATEGORIES] || category}
              </div>

              {/* İzin satırları */}
              {perms.map((permission) => {
                const isEnabled = permissions[selectedRole]?.[permission] ?? false;
                return (
                  <div
                    key={permission}
                    className="flex items-center justify-between gap-3.5 px-4 py-3 border-t border-[#f1f4f9] first:border-t-0"
                  >
                    <div className="flex-1 min-w-0">
                      {/* Görünen ad */}
                      <div className="text-[12.5px] font-medium text-[#14223b]">
                        {availablePermissions[permission]}
                      </div>
                      {/* Ham anahtar */}
                      <div className="text-[10.5px] text-[#8b97ac] font-mono mt-0.5">
                        {permission}
                      </div>
                      {/* Açıklama */}
                      {permissionDescriptions[permission] && (
                        <div className="text-[12px] text-[#51607a] mt-1">
                          {permissionDescriptions[permission]}
                        </div>
                      )}
                    </div>
                    {/* Toggle (anında kaydeder) */}
                    <button
                      type="button"
                      onClick={() => togglePermission(selectedRole, permission, isEnabled)}
                      disabled={saving}
                      role="switch"
                      aria-checked={isEnabled}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#15356b] focus:ring-offset-2 disabled:opacity-50 ${
                        isEnabled ? 'bg-[#15356b]' : 'bg-[#e3e8f0]'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-0.5 ${
                          isEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Bilgi kutusu */}
      <div className="mt-4 bg-[#eef2fa] border border-[#d6e0f1] rounded-xl p-4">
        <div className="flex gap-3">
          <div className="flex-shrink-0">
            <Info width={18} height={18} stroke="#15356b" strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-[#15356b] m-0">Bilgi</h3>
            <ul className="mt-2 text-[12.5px] text-[#51607a] list-disc list-inside space-y-1">
              <li>İzinler anında uygulanır, kullanıcıların tekrar giriş yapması gerekmez</li>
              <li>HEAD_ADMIN rolü her zaman tüm izinlere sahiptir</li>
              <li>&quot;Varsayılana Sıfırla&quot; butonu izinleri sistem varsayılan değerlerine döndürür</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Onay Diyaloğu (Sıfırlama) */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={closeConfirmDialog}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmLabel="Onayla"
        cancelLabel="İptal"
      />
    </div>
  );
}
