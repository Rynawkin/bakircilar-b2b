'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { usePersonel } from './usePersonel';

/**
 * Klasik gorunum Personel Yonetimi ekrani.
 * Mevcut TUM mantik usePersonel'dan gelir; JSX eski page.tsx ile BIREBIR aynidir (emoji dahil).
 */
export default function PersonelClassic() {
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

  const getRoleBadge = (role: string) => {
    const badges: Record<string, { label: string; variant: 'success' | 'info' | 'warning' }> = {
      ADMIN: { label: 'Admin', variant: 'success' },
      MANAGER: { label: 'Manager', variant: 'info' },
      SALES_REP: { label: 'Satış Temsilcisi', variant: 'warning' },
      DEPOCU: { label: 'Depocu', variant: 'info' },
    };
    const badge = badges[role] || { label: role, variant: 'info' };
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="container-custom py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Personel Yonetimi</h1>
            <p className="text-sm text-gray-600">MANAGER, SALES_REP ve DEPOCU kullanicilarini yonetin</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} variant="secondary">
            + Yeni Kullanici
          </Button>
        </div>
        <div className="space-y-4">
          {staff.map((member) => (
            <Card key={member.id}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-lg">{member.name}</h3>
                    {getRoleBadge(member.role)}
                    {!member.active && <Badge variant="danger">Pasif</Badge>}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    <strong>Email:</strong> {member.email}
                  </p>
                  {member.role === 'SALES_REP' && member.assignedSectorCodes.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-sm text-gray-600 font-medium">Sektörler:</span>
                      {member.assignedSectorCodes.map((code, idx) => (
                        <Badge key={idx} variant="info">{code}</Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    Oluşturulma: {new Date(member.createdAt).toLocaleDateString('tr-TR')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
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
                >
                  ✎ Düzenle
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card title="Yeni Kullanıcı Oluştur" className="max-w-lg w-full">
            <div className="space-y-4">
              <Input
                label="İsim"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Ahmet Yılmaz"
              />
              <Input
                label="Email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="ahmet@bakircilar.com"
              />
              <Input
                label="Şifre"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="En az 6 karakter"
              />
              <div>
                <label className="block text-sm font-medium mb-2">Rol</label>
                <select
                  className="w-full border rounded px-3 py-2"
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
                  <label className="block text-sm font-medium mb-2">Sektör Kodları</label>
                  {availableSectorCodes.length === 0 ? (
                    <p className="text-sm text-gray-500 bg-yellow-50 p-3 rounded border border-yellow-200">
                      ⚠️ Henüz sistemde sektör kodu olan müşteri yok. Önce müşteri oluşturun.
                    </p>
                  ) : (
                    <>
                      <div className="flex gap-2 mb-2">
                        <select
                          className="flex-1 border rounded px-3 py-2"
                          value={selectedSectorCode}
                          onChange={(e) => setSelectedSectorCode(e.target.value)}
                        >
                          <option value="">Sektör seçin...</option>
                          {availableSectorCodes
                            .filter(code => !createForm.assignedSectorCodes.includes(code))
                            .map((code) => (
                              <option key={code} value={code}>
                                {code}
                              </option>
                            ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            addSectorCode(createForm.assignedSectorCodes, (codes) =>
                              setCreateForm({ ...createForm, assignedSectorCodes: codes })
                            )
                          }
                          disabled={!selectedSectorCode}
                        >
                          Ekle
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {createForm.assignedSectorCodes.map((code, idx) => (
                          <Badge
                            key={idx}
                            variant="info"
                            className="cursor-pointer hover:bg-red-100"
                            onClick={() =>
                              removeSectorCode(idx, createForm.assignedSectorCodes, (codes) =>
                                setCreateForm({ ...createForm, assignedSectorCodes: codes })
                              )
                            }
                          >
                            {code} ×
                          </Badge>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  variant="secondary"
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
                >
                  İptal
                </Button>
                <Button onClick={handleCreate}>Oluştur</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Edit Modal */}
      {editingStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card title={`${editingStaff.name} - Düzenle`} className="max-w-lg w-full">
            <div className="space-y-4">
              <Input
                label="İsim"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
              <Input
                label="Email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editForm.active}
                    onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                  />
                  <span className="text-sm font-medium">Aktif</span>
                </label>
              </div>

              {editingStaff.role === 'SALES_REP' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Sektör Kodları</label>
                  {availableSectorCodes.length === 0 ? (
                    <p className="text-sm text-gray-500 bg-yellow-50 p-3 rounded border border-yellow-200">
                      ⚠️ Henüz sistemde sektör kodu olan müşteri yok.
                    </p>
                  ) : (
                    <>
                      <div className="flex gap-2 mb-2">
                        <select
                          className="flex-1 border rounded px-3 py-2"
                          value={selectedSectorCode}
                          onChange={(e) => setSelectedSectorCode(e.target.value)}
                        >
                          <option value="">Sektör seçin...</option>
                          {availableSectorCodes
                            .filter(code => !editForm.assignedSectorCodes.includes(code))
                            .map((code) => (
                              <option key={code} value={code}>
                                {code}
                              </option>
                            ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() =>
                            addSectorCode(editForm.assignedSectorCodes, (codes) =>
                              setEditForm({ ...editForm, assignedSectorCodes: codes })
                            )
                          }
                          disabled={!selectedSectorCode}
                        >
                          Ekle
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {editForm.assignedSectorCodes.map((code, idx) => (
                          <Badge
                            key={idx}
                            variant="info"
                            className="cursor-pointer hover:bg-red-100"
                            onClick={() =>
                              removeSectorCode(idx, editForm.assignedSectorCodes, (codes) =>
                                setEditForm({ ...editForm, assignedSectorCodes: codes })
                              )
                            }
                          >
                            {code} ×
                          </Badge>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingStaff(null);
                    setSelectedSectorCode('');
                  }}
                >
                  İptal
                </Button>
                <Button onClick={handleEdit}>Kaydet</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
