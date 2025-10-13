'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LogoLink } from '@/components/ui/Logo';
import { Badge } from '@/components/ui/Badge';

interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: string;
  assignedSectorCodes: string[];
  active: boolean;
  createdAt: string;
}

export default function StaffManagementPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  // Create form
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'SALES_REP' as 'SALES_REP' | 'MANAGER',
    assignedSectorCodes: [] as string[],
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    email: '',
    name: '',
    active: true,
    assignedSectorCodes: [] as string[],
  });

  const [sectorInput, setSectorInput] = useState('');

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    try {
      const { staff: staffList } = await adminApi.getStaffMembers();
      setStaff(staffList);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Staff listesi yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.email || !createForm.password || !createForm.name) {
      toast.error('Email, şifre ve isim zorunludur');
      return;
    }

    try {
      await adminApi.createStaffMember(createForm);
      toast.success('Kullanıcı oluşturuldu!');
      setShowCreateModal(false);
      setCreateForm({
        email: '',
        password: '',
        name: '',
        role: 'SALES_REP',
        assignedSectorCodes: [],
      });
      setSectorInput('');
      fetchStaff();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Oluşturma başarısız');
    }
  };

  const handleEdit = async () => {
    if (!editingStaff) return;

    try {
      await adminApi.updateStaffMember(editingStaff.id, editForm);
      toast.success('Kullanıcı güncellendi!');
      setEditingStaff(null);
      fetchStaff();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Güncelleme başarısız');
    }
  };

  const addSectorCode = (codes: string[], setCodes: (codes: string[]) => void) => {
    if (!sectorInput.trim()) return;
    const newCodes = [...codes, sectorInput.trim()];
    setCodes(newCodes);
    setSectorInput('');
  };

  const removeSectorCode = (index: number, codes: string[], setCodes: (codes: string[]) => void) => {
    const newCodes = codes.filter((_, i) => i !== index);
    setCodes(newCodes);
  };

  const getRoleBadge = (role: string) => {
    const badges: Record<string, { label: string; variant: 'success' | 'info' | 'warning' }> = {
      ADMIN: { label: 'Admin', variant: 'success' },
      MANAGER: { label: 'Manager', variant: 'info' },
      SALES_REP: { label: 'Satış Temsilcisi', variant: 'warning' },
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
      <header className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg">
        <div className="container-custom py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/dashboard" variant="light" />
              <div>
                <h1 className="text-xl font-bold text-white">👥 Personel Yönetimi</h1>
                <p className="text-sm text-primary-100">MANAGER ve SALES_REP kullanıcılarını yönetin</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => setShowCreateModal(true)}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                + Yeni Kullanıcı
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/dashboard')}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                ← Dashboard
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container-custom py-8">
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
                    setSectorInput('');
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
                </select>
              </div>

              {createForm.role === 'SALES_REP' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Sektör Kodları</label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      value={sectorInput}
                      onChange={(e) => setSectorInput(e.target.value)}
                      placeholder="Sektör kodu (örn: İNTERNET)"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSectorCode(createForm.assignedSectorCodes, (codes) =>
                            setCreateForm({ ...createForm, assignedSectorCodes: codes })
                          );
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        addSectorCode(createForm.assignedSectorCodes, (codes) =>
                          setCreateForm({ ...createForm, assignedSectorCodes: codes })
                        )
                      }
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
                    setSectorInput('');
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
                  <div className="flex gap-2 mb-2">
                    <Input
                      value={sectorInput}
                      onChange={(e) => setSectorInput(e.target.value)}
                      placeholder="Sektör kodu"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSectorCode(editForm.assignedSectorCodes, (codes) =>
                            setEditForm({ ...editForm, assignedSectorCodes: codes })
                          );
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        addSectorCode(editForm.assignedSectorCodes, (codes) =>
                          setEditForm({ ...editForm, assignedSectorCodes: codes })
                        )
                      }
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
                </div>
              )}

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingStaff(null);
                    setSectorInput('');
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
