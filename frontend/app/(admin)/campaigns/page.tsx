'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Campaign, CreateCampaignRequest } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { Fragment } from 'react';
import { LogoLink } from '@/components/ui/Logo';
import { useAuthStore } from '@/lib/store/authStore';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function CampaignsPage() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

  const [formData, setFormData] = useState<CreateCampaignRequest>({
    name: '',
    description: '',
    type: 'PERCENTAGE',
    discountValue: 0,
    minOrderAmount: undefined,
    maxDiscountAmount: undefined,
    startDate: '',
    endDate: '',
    active: true,
    customerTypes: [],
    categoryIds: [],
    productIds: [],
  });
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'danger' | 'warning' | 'success' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const response = await fetch('/api/campaigns', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      setCampaigns(data);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingCampaign
        ? `/api/campaigns/${editingCampaign.id}`
        : '/api/campaigns';

      const method = editingCampaign ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        await fetchCampaigns();
        handleCloseModal();
        toast.success(editingCampaign ? 'Kampanya güncellendi' : 'Kampanya oluşturuldu');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Kampanya kaydedilemedi');
      }
    } catch (error) {
      console.error('Error saving campaign:', error);
      toast.error('Kampanya kaydedilemedi');
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Kampanyayı Sil',
      message: 'Bu kampanyayı silmek istediğinizden emin misiniz?',
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        try {
          const response = await fetch(`/api/campaigns/${id}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            await fetchCampaigns();
            toast.success('Kampanya silindi');
          } else {
            const error = await response.json();
            toast.error(error.error || 'Kampanya silinemedi');
          }
        } catch (error) {
          console.error('Error deleting campaign:', error);
          toast.error('Kampanya silinemedi');
        }
      },
    });
  };

  const handleEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name,
      description: campaign.description,
      type: campaign.type,
      discountValue: campaign.discountValue,
      minOrderAmount: campaign.minOrderAmount,
      maxDiscountAmount: campaign.maxDiscountAmount,
      startDate: campaign.startDate.split('T')[0],
      endDate: campaign.endDate.split('T')[0],
      active: campaign.active,
      customerTypes: campaign.customerTypes,
      categoryIds: campaign.categoryIds,
      productIds: campaign.productIds,
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCampaign(null);
    setFormData({
      name: '',
      description: '',
      type: 'PERCENTAGE',
      discountValue: 0,
      minOrderAmount: undefined,
      maxDiscountAmount: undefined,
      startDate: '',
      endDate: '',
      active: true,
      customerTypes: [],
      categoryIds: [],
      productIds: [],
    });
  };

  const getCampaignTypeLabel = (type: string) => {
    switch (type) {
      case 'PERCENTAGE':
        return 'Yüzde İndirim';
      case 'FIXED_AMOUNT':
        return 'Sabit Tutar İndirim';
      case 'BUY_X_GET_Y':
        return 'X Al Y Öde';
      default:
        return type;
    }
  };

  const formatDiscountValue = (campaign: Campaign) => {
    if (campaign.type === 'PERCENTAGE') {
      return `%${(campaign.discountValue * 100).toFixed(0)}`;
    } else {
      return formatCurrency(campaign.discountValue);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary-700 to-primary-600 shadow-lg">
        <div className="container-custom py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
              <LogoLink href="/dashboard" variant="light" />
              <div>
                <h1 className="text-xl font-bold text-white">🎯 Kampanya Yönetimi</h1>
                <p className="text-sm text-primary-100">Dinamik indirim ve kampanya sistemi</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setIsModalOpen(true)}
                className="bg-white text-primary-700 hover:bg-primary-50"
              >
                + Yeni Kampanya
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

      {/* Main Content */}
      <div className="container-custom py-8">
        <div className="space-y-6">

      {campaigns.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">Henüz kampanya oluşturulmamış.</p>
            <Button onClick={() => setIsModalOpen(true)}>
              İlk Kampanyayı Oluştur
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className="relative">
              {campaign.active ? (
                <div className="absolute top-4 right-4 bg-green-100 text-green-800 text-xs font-semibold px-2 py-1 rounded">
                  Aktif
                </div>
              ) : (
                <div className="absolute top-4 right-4 bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-1 rounded">
                  Pasif
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">
                    {campaign.name}
                  </h3>
                  {campaign.description && (
                    <p className="text-sm text-gray-600">{campaign.description}</p>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tip:</span>
                    <span className="font-medium">{getCampaignTypeLabel(campaign.type)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">İndirim:</span>
                    <span className="font-bold text-primary-600">
                      {formatDiscountValue(campaign)}
                    </span>
                  </div>
                  {campaign.minOrderAmount && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Min. Tutar:</span>
                      <span className="font-medium">
                        {formatCurrency(campaign.minOrderAmount)}
                      </span>
                    </div>
                  )}
                  {campaign.maxDiscountAmount && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Maks. İndirim:</span>
                      <span className="font-medium">
                        {formatCurrency(campaign.maxDiscountAmount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Başlangıç:</span>
                    <span className="font-medium">{formatDate(campaign.startDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Bitiş:</span>
                    <span className="font-medium">{formatDate(campaign.endDate)}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleEdit(campaign)}
                    className="flex-1"
                  >
                    Düzenle
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(campaign.id)}
                    className="flex-1"
                  >
                    Sil
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <Transition show={isModalOpen} as={Fragment}>
        <Dialog onClose={handleCloseModal} className="relative z-50">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          </TransitionChild>

          <div className="fixed inset-0 flex items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <DialogTitle className="text-2xl font-bold text-gray-900 mb-6">
                    {editingCampaign ? 'Kampanya Düzenle' : 'Yeni Kampanya'}
                  </DialogTitle>

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Kampanya Adı *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Açıklama
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({ ...formData, description: e.target.value })
                        }
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Kampanya Tipi *
                        </label>
                        <select
                          value={formData.type}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              type: e.target.value as any,
                            })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="PERCENTAGE">Yüzde İndirim</option>
                          <option value="FIXED_AMOUNT">Sabit Tutar İndirim</option>
                          <option value="BUY_X_GET_Y">X Al Y Öde</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          İndirim Değeri *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={formData.discountValue}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              discountValue: parseFloat(e.target.value),
                            })
                          }
                          placeholder={
                            formData.type === 'PERCENTAGE'
                              ? '0.15 (%15 için)'
                              : '50 (50 TL için)'
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Minimum Sipariş Tutarı (TL)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.minOrderAmount || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              minOrderAmount: e.target.value
                                ? parseFloat(e.target.value)
                                : undefined,
                            })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Maksimum İndirim Tutarı (TL)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.maxDiscountAmount || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              maxDiscountAmount: e.target.value
                                ? parseFloat(e.target.value)
                                : undefined,
                            })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Başlangıç Tarihi *
                        </label>
                        <input
                          type="date"
                          required
                          value={formData.startDate}
                          onChange={(e) =>
                            setFormData({ ...formData, startDate: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Bitiş Tarihi *
                        </label>
                        <input
                          type="date"
                          required
                          value={formData.endDate}
                          onChange={(e) =>
                            setFormData({ ...formData, endDate: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formData.active}
                          onChange={(e) =>
                            setFormData({ ...formData, active: e.target.checked })
                          }
                          className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          Kampanya Aktif
                        </span>
                      </label>
                    </div>

                    <div className="flex gap-3 pt-4 border-t">
                      <Button type="button" variant="secondary" onClick={handleCloseModal}>
                        İptal
                      </Button>
                      <Button type="submit" className="flex-1">
                        {editingCampaign ? 'Güncelle' : 'Oluştur'}
                      </Button>
                    </div>
                  </form>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmLabel="Onayla"
        cancelLabel="İptal"
      />
        </div>
      </div>
    </div>
  );
}
