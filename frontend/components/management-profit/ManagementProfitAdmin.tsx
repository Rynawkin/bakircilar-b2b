'use client';

import { FormEvent, Fragment, useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react';
import axios from 'axios';
import {
  AlertCircle,
  Check,
  Clipboard,
  ExternalLink,
  Eye,
  KeyRound,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ManagementProfitAdminLink,
  ManagementProfitEffectiveLinkStatus,
  ManagementProfitLinkSecret,
  ManagementProfitLinkStatus,
  managementProfitAdminApi,
} from '@/lib/api/managementProfitReport';
import { useAuthStore } from '@/lib/store/authStore';

const STATUS_TEXT: Record<ManagementProfitEffectiveLinkStatus, string> = {
  ACTIVE: 'Aktif',
  PAUSED: 'Duraklatılmış',
  REVOKED: 'İptal edilmiş',
  EXPIRED: 'Süresi dolmuş',
};

const STATUS_STYLE: Record<ManagementProfitEffectiveLinkStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PAUSED: 'bg-amber-50 text-amber-700 ring-amber-200',
  REVOKED: 'bg-red-50 text-red-700 ring-red-200',
  EXPIRED: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const getErrorMessage = (
  error: unknown,
  fallback = 'İşlem tamamlanamadı.'
) => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { error?: string; message?: string }
      | undefined;
    return data?.error || data?.message || error.message || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Istanbul',
  });
};

const resolveStatus = (
  link: ManagementProfitAdminLink
): ManagementProfitEffectiveLinkStatus =>
  link.effectiveStatus ||
  (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()
    ? 'EXPIRED'
    : link.status);

const secretPublicPath = (secret: ManagementProfitLinkSecret) =>
  secret.publicPath ||
  `/management-profit#${encodeURIComponent(secret.rawToken)}`;

const secretPublicUrl = (secret: ManagementProfitLinkSecret) => {
  const path = secretPublicPath(secret);
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
};

export function ManagementProfitAdmin() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const loadUserFromStorage = useAuthStore(
    (state) => state.loadUserFromStorage
  );
  const [hydrated, setHydrated] = useState(false);
  const [links, setLinks] = useState<ManagementProfitAdminLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<ManagementProfitLinkSecret | null>(
    null
  );

  useEffect(() => {
    loadUserFromStorage();
    setHydrated(true);
  }, [loadUserFromStorage]);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await managementProfitAdminApi.listLinks();
      setLinks(Array.isArray(response.links) ? response.links : []);
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          'Rapor bağlantıları yüklenirken bir hata oluştu.'
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'HEAD_ADMIN') {
      router.replace('/dashboard');
      return;
    }
    loadLinks();
  }, [hydrated, loadLinks, router, user]);

  const replaceLink = (updated: ManagementProfitAdminLink) => {
    setLinks((current) =>
      current.map((link) => (link.id === updated.id ? updated : link))
    );
  };

  const updateStatus = async (
    link: ManagementProfitAdminLink,
    status: ManagementProfitLinkStatus
  ) => {
    if (
      status === 'REVOKED' &&
      !window.confirm(
        `"${link.name}" bağlantısını kalıcı olarak iptal etmek istediğinize emin misiniz? Açık oturumlar da kapatılır.`
      )
    ) {
      return;
    }

    setBusyId(link.id);
    try {
      const response = await managementProfitAdminApi.updateLink(link.id, {
        status,
      });
      replaceLink(response.link);
      toast.success(
        status === 'ACTIVE'
          ? 'Bağlantı yeniden açıldı.'
          : status === 'PAUSED'
            ? 'Bağlantı duraklatıldı.'
            : 'Bağlantı iptal edildi.'
      );
    } catch (requestError) {
      toast.error(getErrorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  };

  const toggleLayoutSave = async (link: ManagementProfitAdminLink) => {
    setBusyId(link.id);
    try {
      const response = await managementProfitAdminApi.updateLink(link.id, {
        canSaveLayout: !link.canSaveLayout,
      });
      replaceLink(response.link);
      toast.success(
        response.link.canSaveLayout
          ? 'Görünüm kaydetme açıldı.'
          : 'Görünüm kaydetme kapatıldı.'
      );
    } catch (requestError) {
      toast.error(getErrorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  };

  const rotate = async (link: ManagementProfitAdminLink) => {
    if (
      !window.confirm(
        `"${link.name}" için yeni bağlantı üretilecek. Eski bağlantı ve açık oturumlar hemen geçersiz olacak. Devam edilsin mi?`
      )
    ) {
      return;
    }

    setBusyId(link.id);
    try {
      const response = await managementProfitAdminApi.rotateLink(link.id);
      replaceLink(response.link);
      setSecret(response);
      toast.success('Yeni güvenli bağlantı üretildi.');
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, 'Bağlantı yenilenemedi.'));
    } finally {
      setBusyId(null);
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secretPublicUrl(secret));
      toast.success('Güvenli bağlantı panoya kopyalandı.');
    } catch {
      toast.error('Bağlantı panoya kopyalanamadı.');
    }
  };

  if (!hydrated || !user || user.role !== 'HEAD_ADMIN') {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="container-custom py-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-red-700 ring-1 ring-inset ring-red-100">
            <ShieldCheck className="h-3.5 w-3.5" />
            Yalnız HEAD_ADMIN
          </div>
          <h1 className="page-title">Yönetim karlılık raporu</h1>
          <p className="page-subtitle max-w-2xl">
            PIN korumalı rapor bağlantılarını oluşturun, erişimi durdurun ve
            patronun varsayılan görünümü kaydedebilmesini yönetin.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadLinks}
            disabled={loading}
            className="btn-secondary"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
            Yenile
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            Yeni bağlantı
          </button>
        </div>
      </div>

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        <KeyRound className="mt-0.5 h-4 w-4 flex-none" />
        <div>
          <div className="font-semibold">Bağlantı anahtarı yalnız bir kez gösterilir.</div>
          <div className="mt-0.5 text-amber-800">
            Oluşturma veya yenileme sonrasında tam bağlantıyı güvenli bir
            kanaldan paylaşın. PIN’i aynı mesajda göndermeyin.
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={loadLinks}
            className="font-semibold hover:underline"
          >
            Tekrar dene
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Güvenli bağlantılar
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {links.length} kayıt
            </p>
          </div>
        </div>

        {loading && links.length === 0 ? (
          <div className="flex min-h-[260px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
          </div>
        ) : links.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Link2 className="mx-auto h-9 w-9 text-slate-300" />
            <h3 className="mt-3 text-sm font-semibold text-slate-800">
              Henüz rapor bağlantısı yok
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              İlk PIN korumalı bağlantıyı oluşturarak başlayın.
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="btn-primary mt-5"
            >
              <Plus className="h-4 w-4" />
              Bağlantı oluştur
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                  <th className="px-4 py-3 sm:px-5">Bağlantı</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3">Görünüm kaydı</th>
                  <th className="px-4 py-3">Kullanım</th>
                  <th className="px-4 py-3">Süre</th>
                  <th className="px-4 py-3 text-right sm:px-5">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {links.map((link) => {
                  const effectiveStatus = resolveStatus(link);
                  const busy = busyId === link.id;
                  return (
                    <tr key={link.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3.5 sm:px-5">
                        <div className="font-semibold text-slate-900">
                          {link.name}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                          <span className="font-mono">
                            Anahtar ipucu: {link.tokenHint || '—'}…
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatDateTime(link.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${STATUS_STYLE[effectiveStatus]}`}
                        >
                          {STATUS_TEXT[effectiveStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={link.canSaveLayout}
                          disabled={busy || link.status === 'REVOKED'}
                          onClick={() => toggleLayoutSave(link)}
                          className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                            link.canSaveLayout
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-white text-slate-600'
                          }`}
                        >
                          <span
                            className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${
                              link.canSaveLayout
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 text-slate-500'
                            }`}
                          >
                            {link.canSaveLayout && <Check className="h-3 w-3" />}
                          </span>
                          {link.canSaveLayout ? 'Açık' : 'Kapalı'}
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <Eye className="h-3.5 w-3.5 text-slate-400" />
                          {link.viewCount || 0} görüntüleme
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Son: {formatDateTime(link.lastViewedAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {link.expiresAt ? formatDateTime(link.expiresAt) : 'Süresiz'}
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <div className="flex justify-end gap-1">
                          {busy ? (
                            <span className="inline-flex h-8 w-8 items-center justify-center">
                              <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                            </span>
                          ) : (
                            <>
                              {link.status === 'ACTIVE' && (
                                <IconAction
                                  title="Bağlantıyı duraklat"
                                  icon={<Pause className="h-3.5 w-3.5" />}
                                  onClick={() => updateStatus(link, 'PAUSED')}
                                />
                              )}
                              {link.status === 'PAUSED' && (
                                <IconAction
                                  title="Bağlantıyı yeniden aç"
                                  icon={<Play className="h-3.5 w-3.5" />}
                                  onClick={() => updateStatus(link, 'ACTIVE')}
                                />
                              )}
                              {link.status !== 'REVOKED' && (
                                <>
                                  <IconAction
                                    title="Yeni güvenli bağlantı üret"
                                    icon={<RotateCw className="h-3.5 w-3.5" />}
                                    onClick={() => rotate(link)}
                                  />
                                  <IconAction
                                    title="Bağlantıyı iptal et"
                                    danger
                                    icon={<Trash2 className="h-3.5 w-3.5" />}
                                    onClick={() =>
                                      updateStatus(link, 'REVOKED')
                                    }
                                  />
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CreateLinkDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setLinks((current) => [created.link, ...current]);
          setCreateOpen(false);
          setSecret(created);
        }}
      />

      <SecretDialog
        secret={secret}
        onClose={() => setSecret(null)}
        onCopy={copySecret}
      />
    </div>
  );
}

function IconAction({
  title,
  icon,
  onClick,
  danger = false,
}: {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
        danger
          ? 'border-red-200 text-red-600 hover:bg-red-50'
          : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {icon}
    </button>
  );
}

function CreateLinkDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (secret: ManagementProfitLinkSecret) => void;
}) {
  const [name, setName] = useState('Patron Karlılık Raporu');
  const [pin, setPin] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [canSaveLayout, setCanSaveLayout] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('Patron Karlılık Raporu');
    setPin('');
    setExpiresAt('');
    setCanSaveLayout(true);
    setError(null);
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError('Bağlantı adı en az 2 karakter olmalı.');
      return;
    }
    if (!/^\d{6,12}$/.test(pin)) {
      setError('PIN 6–12 rakamdan oluşmalı.');
      return;
    }

    let expiresAtIso: string | null = null;
    if (expiresAt) {
      const expiry = new Date(expiresAt);
      if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
        setError('Bitiş zamanı gelecekte olmalı.');
        return;
      }
      expiresAtIso = expiry.toISOString();
    }

    setSaving(true);
    setError(null);
    try {
      const response = await managementProfitAdminApi.createLink({
        name: name.trim(),
        pin,
        expiresAt: expiresAtIso,
        canSaveLayout,
      });
      onCreated(response);
      toast.success('PIN korumalı rapor bağlantısı oluşturuldu.');
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, 'Rapor bağlantısı oluşturulamadı.')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Transition show={open} as={Fragment}>
      <Dialog
        onClose={saving ? () => undefined : onClose}
        className="relative z-[70]"
      >
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-[2px]" />
        </TransitionChild>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="translate-y-3 opacity-0 scale-[0.98]"
              enterTo="translate-y-0 opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="translate-y-0 opacity-100 scale-100"
              leaveTo="translate-y-3 opacity-0 scale-[0.98]"
            >
              <DialogPanel className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-950/10">
                <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
                  <div>
                    <DialogTitle className="text-base font-semibold text-slate-900">
                      Yeni rapor bağlantısı
                    </DialogTitle>
                    <p className="mt-1 text-xs text-slate-500">
                      Tam bağlantı oluşturma sonrasında yalnız bir kez gösterilir.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={saving}
                    aria-label="Pencereyi kapat"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={submit}>
                  <div className="space-y-4 px-6 py-5">
                    <label>
                      <span className="field-label">Bağlantı adı</span>
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        maxLength={100}
                        className="input"
                        placeholder="Örn. Patron Karlılık Raporu"
                      />
                    </label>
                    <label>
                      <span className="field-label">PIN</span>
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        value={pin}
                        onChange={(event) =>
                          setPin(
                            event.target.value.replace(/\D/g, '').slice(0, 12)
                          )
                        }
                        className="input font-mono tracking-[0.18em]"
                        placeholder="6–12 rakam"
                      />
                      <span className="mt-1.5 block text-[11px] text-slate-500">
                        PIN’i bağlantıdan ayrı ve güvenli bir kanaldan iletin.
                      </span>
                    </label>
                    <label>
                      <span className="field-label">
                        Bitiş zamanı (isteğe bağlı)
                      </span>
                      <input
                        type="datetime-local"
                        value={expiresAt}
                        onChange={(event) => setExpiresAt(event.target.value)}
                        className="input"
                      />
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={canSaveLayout}
                        onChange={(event) =>
                          setCanSaveLayout(event.target.checked)
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-800">
                          Varsayılan görünümü kaydedebilsin
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                          Bu yetki açıkken PIN’i bilen kişi sonraki girişlerde
                          kullanılacak düzeni değiştirebilir.
                        </span>
                      </span>
                    </label>
                    {error && (
                      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                        <span>{error}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={saving}
                      className="btn-secondary"
                    >
                      Vazgeç
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="btn-primary"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      {saving ? 'Oluşturuluyor…' : 'Bağlantı oluştur'}
                    </button>
                  </div>
                </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

function SecretDialog({
  secret,
  onClose,
  onCopy,
}: {
  secret: ManagementProfitLinkSecret | null;
  onClose: () => void;
  onCopy: () => void;
}) {
  return (
    <Transition show={Boolean(secret)} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-[80]">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px]" />
        </TransitionChild>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="translate-y-3 opacity-0 scale-[0.98]"
              enterTo="translate-y-0 opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="translate-y-0 opacity-100 scale-100"
              leaveTo="translate-y-3 opacity-0 scale-[0.98]"
            >
              <DialogPanel className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-950/10">
                <div className="bg-[#0b1d3b] px-6 py-5 text-white">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-blue-200">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <DialogTitle className="mt-3 text-lg font-semibold text-white">
                    Güvenli bağlantı hazır
                  </DialogTitle>
                  <p className="mt-1 text-xs leading-5 text-white/65">
                    Bu tam adres yeniden gösterilmeyecek. Şimdi kopyalayıp güvenli
                    biçimde saklayın.
                  </p>
                </div>
                <div className="p-6">
                  <label className="field-label">Public bağlantı</label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-700 [overflow-wrap:anywhere]">
                    {secret ? secretPublicUrl(secret) : ''}
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={onCopy}
                      className="btn-primary flex-1"
                    >
                      <Clipboard className="h-4 w-4" />
                      Bağlantıyı kopyala
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!secret) return;
                        window.open(
                          secretPublicPath(secret),
                          '_blank',
                          'noopener,noreferrer'
                        );
                      }}
                      className="btn-secondary flex-1"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Yeni sekmede aç
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn-ghost mt-3 w-full"
                  >
                    Kopyaladım, kapat
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
