'use client';

import { Plus, Pencil, X, Check } from 'lucide-react';
import { usePersonel } from './usePersonel';

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';

/**
 * Yeni gorunum Personel Yonetimi ekrani.
 * Mevcut TUM mantik usePersonel'dan gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kosul/modal/kolon/durum dusurulmemistir; brief 4.13.3'teki her oge mevcut.
 */
export default function PersonelNew() {
  const {
    staff,
    availableSectorCodes,
    isLoading,
    showCreateModal,
    setShowCreateModal,
    editingStaff,
    setEditingStaff,
    createForm,
    setCreateForm,
    editForm,
    setEditForm,
    selectedSectorCode,
    setSelectedSectorCode,
    handleCreate,
    handleEdit,
    addSectorCode,
    removeSectorCode,
  } = usePersonel();

  // Ad-soyaddan bas harfleri (avatar) — sadece gorsel
  const getInitials = (name: string) => {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Rol rozeti (yeni stil) — ADMIN success / MANAGER info / SALES_REP warning / DEPOCU info
  const renderRoleBadge = (role: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      ADMIN: { label: 'Admin', cls: 'bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857]' },
      MANAGER: { label: 'Manager', cls: 'bg-[#eef2fb] border border-[#c7d2fe] text-[#4338ca]' },
      SALES_REP: { label: 'Satış Temsilcisi', cls: 'bg-[#fffbeb] border border-[#fde68a] text-[#b45309]' },
      DEPOCU: { label: 'Depocu', cls: 'bg-[#eef2fb] border border-[#c7d2fe] text-[#4338ca]' },
    };
    const b = map[role] || { label: role, cls: 'bg-[#eef2fa] border border-[#d6e0f1] text-[#1c4585]' };
    return (
      <span className={`inline-flex items-center ${b.cls} text-[10px] font-semibold px-2 py-0.5 rounded-md`}>
        {b.label}
      </span>
    );
  };

  // Pasif rozeti (yeni stil) — danger
  const renderInactiveBadge = () => (
    <span className="inline-flex items-center bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-[10px] font-semibold px-2 py-0.5 rounded-md">
      Pasif
    </span>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f7fb]">
        <div className="container-custom py-8">
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`${CARD} p-4 animate-pulse`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-[10px] bg-[#eef2fa]" />
                  <div className="flex-1">
                    <div className="h-3.5 w-2/3 bg-[#eef2fa] rounded mb-2" />
                    <div className="h-3 w-1/2 bg-[#f1f4f9] rounded" />
                  </div>
                </div>
                <div className="border-t border-[#f1f4f9] pt-3 h-7" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Ortak input stilleri (yeni)
  const inputCls =
    'w-full border border-[#d8e0ec] rounded-[8px] px-3 py-2.5 text-[13.5px] text-[#14223b] outline-none focus:border-[#15356b] placeholder:text-[#9aa6b8] bg-white';
  const labelCls = 'block text-[12px] font-semibold text-[#51607a] mb-1.5';

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      <div className="container-custom py-8">
        {/* Sayfa basligi + Yeni Kullanici */}
        <div className="flex items-end justify-between gap-4 mb-[18px] flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#14223b] m-0">
              Personel Yönetimi
            </h1>
            <div className="text-[13px] text-[#8b97ac] mt-1.5">
              Kullanıcılar, roller ve sektör atamaları
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-[7px] bg-[#15356b] text-white border-none rounded-[9px] px-4 py-2.5 text-[13px] font-semibold cursor-pointer hover:bg-[#1c4585]"
          >
            <Plus width={15} height={15} stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
            Yeni Kullanıcı
          </button>
        </div>

        {/* Personel kartlari */}
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {staff.map((member) => (
            <div key={member.id} className={`${CARD} p-4`}>
              <div className="flex items-center gap-[11px] mb-[11px]">
                <span className="w-10 h-10 rounded-[10px] bg-[#eef2fa] text-[#15356b] flex items-center justify-center font-semibold text-[14px] flex-none overflow-hidden">
                  {getInitials(member.name)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-[7px] flex-wrap">
                    <span className="text-[14px] font-semibold text-[#14223b]">{member.name}</span>
                    {renderRoleBadge(member.role)}
                    {!member.active && renderInactiveBadge()}
                  </div>
                  <div className="text-[11.5px] text-[#8b97ac] mt-[3px] truncate">{member.email}</div>
                </div>
              </div>

              {member.role === 'SALES_REP' && member.assignedSectorCodes.length > 0 && (
                <div className="text-[11px] text-[#51607a] mb-[11px]">
                  Sektörler:{' '}
                  <b className="text-[#14223b] font-semibold">
                    {member.assignedSectorCodes.join(', ')}
                  </b>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-[#f1f4f9] pt-[11px]">
                <span className="text-[11px] text-[#9aa6b8]">
                  Kayıt: {new Date(member.createdAt).toLocaleDateString('tr-TR')}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingStaff(member);
                    setEditForm({
                      email: member.email,
                      name: member.name,
                      active: member.active,
                      assignedSectorCodes: member.assignedSectorCodes,
                    });
                    setSelectedSectorCode('');
                  }}
                  className="flex items-center gap-1.5 bg-white border border-[#d8e0ec] rounded-[7px] px-3 py-1.5 text-[12px] font-semibold text-[#15356b] cursor-pointer hover:bg-[#eef2fa]"
                >
                  <Pencil width={13} height={13} stroke="currentColor" strokeWidth={2.2} />
                  Düzenle
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`${CARD} max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl`}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e7ebf2]">
              <h2 className="text-[16px] font-semibold text-[#14223b] m-0">Yeni Kullanıcı Oluştur</h2>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateForm({
                    email: '',
                    password: '',
                    name: '',
                    role: 'SALES_REP',
                    assignedSectorCodes: [],
                  });
                  setSelectedSectorCode('');
                }}
                className="text-[#8b97ac] hover:text-[#14223b] cursor-pointer bg-transparent border-none p-1"
              >
                <X width={18} height={18} stroke="currentColor" strokeWidth={2.2} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className={labelCls}>İsim</label>
                <input
                  className={inputCls}
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Ahmet Yılmaz"
                />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input
                  className={inputCls}
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="ahmet@bakircilar.com"
                />
              </div>
              <div>
                <label className={labelCls}>Şifre</label>
                <input
                  className={inputCls}
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="En az 6 karakter"
                />
              </div>
              <div>
                <label className={labelCls}>Rol</label>
                <select
                  className={inputCls}
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as any })}
                >
                  <option value="SALES_REP">Satış Temsilcisi</option>
                  <option value="MANAGER">Manager</option>
                  <option value="DEPOCU">Depocu</option>
                </select>
              </div>

              {createForm.role === 'SALES_REP' && (
                <div>
                  <label className={labelCls}>Sektör Kodları</label>
                  {availableSectorCodes.length === 0 ? (
                    <p className="text-[12px] text-[#b45309] bg-[#fffbeb] p-3 rounded-[8px] border border-[#fde68a]">
                      Henüz sistemde sektör kodu olan müşteri yok. Önce müşteri oluşturun.
                    </p>
                  ) : (
                    <>
                      <div className="flex gap-2 mb-2">
                        <select
                          className={`${inputCls} flex-1`}
                          value={selectedSectorCode}
                          onChange={(e) => setSelectedSectorCode(e.target.value)}
                        >
                          <option value="">Sektör seçin...</option>
                          {availableSectorCodes
                            .filter((code) => !createForm.assignedSectorCodes.includes(code))
                            .map((code) => (
                              <option key={code} value={code}>
                                {code}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            addSectorCode(createForm.assignedSectorCodes, (codes) =>
                              setCreateForm({ ...createForm, assignedSectorCodes: codes })
                            )
                          }
                          disabled={!selectedSectorCode}
                          className="bg-[#15356b] text-white border-none rounded-[8px] px-4 py-2.5 text-[13px] font-semibold cursor-pointer hover:bg-[#1c4585] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Ekle
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {createForm.assignedSectorCodes.map((code, idx) => (
                          <span
                            key={idx}
                            onClick={() =>
                              removeSectorCode(idx, createForm.assignedSectorCodes, (codes) =>
                                setCreateForm({ ...createForm, assignedSectorCodes: codes })
                              )
                            }
                            className="inline-flex items-center gap-1 bg-[#eef2fa] border border-[#d6e0f1] text-[#1c4585] text-[11px] font-semibold px-2 py-1 rounded-md cursor-pointer hover:bg-[#fef2f2] hover:border-[#fecaca] hover:text-[#b91c1c]"
                          >
                            {code}
                            <X width={11} height={11} stroke="currentColor" strokeWidth={2.4} />
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateForm({
                      email: '',
                      password: '',
                      name: '',
                      role: 'SALES_REP',
                      assignedSectorCodes: [],
                    });
                    setSelectedSectorCode('');
                  }}
                  className="bg-white border border-[#d8e0ec] rounded-[8px] px-4 py-2.5 text-[13px] font-semibold text-[#51607a] cursor-pointer hover:bg-[#eef2fa]"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="bg-[#15356b] text-white border-none rounded-[8px] px-4 py-2.5 text-[13px] font-semibold cursor-pointer hover:bg-[#1c4585]"
                >
                  Oluştur
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingStaff && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className={`${CARD} max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl`}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e7ebf2]">
              <h2 className="text-[16px] font-semibold text-[#14223b] m-0">
                {editingStaff.name} - Düzenle
              </h2>
              <button
                type="button"
                onClick={() => {
                  setEditingStaff(null);
                  setSelectedSectorCode('');
                }}
                className="text-[#8b97ac] hover:text-[#14223b] cursor-pointer bg-transparent border-none p-1"
              >
                <X width={18} height={18} stroke="currentColor" strokeWidth={2.2} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className={labelCls}>İsim</label>
                <input
                  className={inputCls}
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input
                  className={inputCls}
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editForm.active}
                    onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                    className="w-4 h-4 accent-[#15356b]"
                  />
                  <span className="text-[13px] font-semibold text-[#14223b]">Aktif</span>
                </label>
              </div>

              {editingStaff.role === 'SALES_REP' && (
                <div>
                  <label className={labelCls}>Sektör Kodları</label>
                  {availableSectorCodes.length === 0 ? (
                    <p className="text-[12px] text-[#b45309] bg-[#fffbeb] p-3 rounded-[8px] border border-[#fde68a]">
                      Henüz sistemde sektör kodu olan müşteri yok.
                    </p>
                  ) : (
                    <>
                      <div className="flex gap-2 mb-2">
                        <select
                          className={`${inputCls} flex-1`}
                          value={selectedSectorCode}
                          onChange={(e) => setSelectedSectorCode(e.target.value)}
                        >
                          <option value="">Sektör seçin...</option>
                          {availableSectorCodes
                            .filter((code) => !editForm.assignedSectorCodes.includes(code))
                            .map((code) => (
                              <option key={code} value={code}>
                                {code}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            addSectorCode(editForm.assignedSectorCodes, (codes) =>
                              setEditForm({ ...editForm, assignedSectorCodes: codes })
                            )
                          }
                          disabled={!selectedSectorCode}
                          className="bg-[#15356b] text-white border-none rounded-[8px] px-4 py-2.5 text-[13px] font-semibold cursor-pointer hover:bg-[#1c4585] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Ekle
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {editForm.assignedSectorCodes.map((code, idx) => (
                          <span
                            key={idx}
                            onClick={() =>
                              removeSectorCode(idx, editForm.assignedSectorCodes, (codes) =>
                                setEditForm({ ...editForm, assignedSectorCodes: codes })
                              )
                            }
                            className="inline-flex items-center gap-1 bg-[#eef2fa] border border-[#d6e0f1] text-[#1c4585] text-[11px] font-semibold px-2 py-1 rounded-md cursor-pointer hover:bg-[#fef2f2] hover:border-[#fecaca] hover:text-[#b91c1c]"
                          >
                            {code}
                            <X width={11} height={11} stroke="currentColor" strokeWidth={2.4} />
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingStaff(null);
                    setSelectedSectorCode('');
                  }}
                  className="bg-white border border-[#d8e0ec] rounded-[8px] px-4 py-2.5 text-[13px] font-semibold text-[#51607a] cursor-pointer hover:bg-[#eef2fa]"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handleEdit}
                  className="bg-[#15356b] text-white border-none rounded-[8px] px-4 py-2.5 text-[13px] font-semibold cursor-pointer hover:bg-[#1c4585]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Check width={14} height={14} stroke="currentColor" strokeWidth={2.4} />
                    Kaydet
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
