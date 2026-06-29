'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi, type CustomerRecoveryAction } from '@/lib/api/admin';
import { formatDateShort } from '@/lib/utils/format';

// Tip re-export: New/Classic dosyalari bu hook'tan tip de tuketebilsin.
export type { CustomerRecoveryAction } from '@/lib/api/admin';

export type RecoveryActionDraft = {
  status: string;
  outcome: string;
  followUpDate: string;
};

export const safeDate = (date?: string | null) => {
  if (!date) return '-';
  try {
    return formatDateShort(date);
  } catch {
    return date.slice(0, 10);
  }
};

export const toDateInputValue = (date?: string | null) => (date ? date.slice(0, 10) : '');

/**
 * "Bana Atanan Geri Kazanım Aksiyonları" raporunun TUM is mantigi.
 *
 * `return (` oncesindeki tum state/effect/handler/turetilmis degerler buraya
 * AYNEN tasinmistir; hicbir mantik degistirilmemistir. Classic ve New gorunum
 * bu hook'u tuketir.
 */
export function useBanaAtananGeriKazanim() {
  const [actions, setActions] = useState<CustomerRecoveryAction[]>([]);
  const [status, setStatus] = useState('OPEN');
  const [search, setSearch] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 0, totalRecords: 0 });
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, {
    status: string;
    outcome: string;
    followUpDate: string;
  }>>({});

  const loadActions = async (requestedPage = page) => {
    setLoading(true);
    try {
      const result = await adminApi.getAssignedCustomerRecoveryActions({
        status,
        search: search.trim() || undefined,
        dueOnly: dueOnly || undefined,
        page: requestedPage,
        limit: 50,
      });
      const nextActions = result.data.actions || [];
      setActions(nextActions);
      setPagination(result.data.pagination);
      setDrafts(Object.fromEntries(nextActions.map((action) => [
        action.id,
        {
          status: action.status || 'OPEN',
          outcome: action.outcome || '',
          followUpDate: toDateInputValue(action.followUpDate),
        },
      ])));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Atanan aksiyonlar alinamadi');
      setActions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActions(page);
  }, [page]);

  const runSearch = () => {
    setPage(1);
    loadActions(1);
  };

  const updateDraft = (actionId: string, patch: Partial<{ status: string; outcome: string; followUpDate: string }>) => {
    setDrafts((previous) => ({
      ...previous,
      [actionId]: {
        status: previous[actionId]?.status || 'OPEN',
        outcome: previous[actionId]?.outcome || '',
        followUpDate: previous[actionId]?.followUpDate || '',
        ...patch,
      },
    }));
  };

  const saveAction = async (action: CustomerRecoveryAction, forceDone = false) => {
    const draft = drafts[action.id];
    if (!draft) return;
    setSavingId(action.id);
    try {
      await adminApi.updateCustomerRecoveryAction(action.id, {
        status: forceDone ? 'DONE' : draft.status,
        outcome: draft.outcome.trim() || (forceDone ? 'Tamamlandi' : null),
        followUpDate: draft.followUpDate || null,
      });
      toast.success(forceDone ? 'Aksiyon kapatildi' : 'Aksiyon notu kaydedildi');
      await loadActions(page);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Aksiyon guncellenemedi');
    } finally {
      setSavingId(null);
    }
  };

  return {
    // state
    actions,
    status,
    setStatus,
    search,
    setSearch,
    dueOnly,
    setDueOnly,
    page,
    setPage,
    pagination,
    loading,
    savingId,
    drafts,
    // handlers
    loadActions,
    runSearch,
    updateDraft,
    saveAction,
    // helpers
    safeDate,
    toDateInputValue,
  };
}

export default useBanaAtananGeriKazanim;
