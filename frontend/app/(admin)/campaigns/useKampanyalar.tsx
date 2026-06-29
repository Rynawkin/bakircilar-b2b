'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Campaign, CreateCampaignRequest } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useAuthStore } from '@/lib/store/authStore';

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type { Campaign, CreateCampaignRequest } from '@/types';

export type CampaignConfirmDialogState = {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  type?: 'danger' | 'warning' | 'success' | 'info';
};

/**
 * Kampanya Yonetimi ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useKampanyalar() {
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
  const [confirmDialog, setConfirmDialog] = useState<CampaignConfirmDialogState>({
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

  return {
    // veri / yuklenme
    campaigns,
    loading,
    // modal / form
    isModalOpen,
    setIsModalOpen,
    editingCampaign,
    formData,
    setFormData,
    handleSubmit,
    handleCloseModal,
    // kampanya aksiyonlari
    handleEdit,
    handleDelete,
    // confirm dialog
    confirmDialog,
    setConfirmDialog,
    // yardimci / turetilmis
    getCampaignTypeLabel,
    formatDiscountValue,
    formatCurrency,
    formatDate,
  };
}

export default useKampanyalar;
