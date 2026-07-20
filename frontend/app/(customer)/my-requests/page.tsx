'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import customerApi from '@/lib/api/customer';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { LoadErrorState } from '@/components/ui/LoadErrorState';
import { useAuthStore } from '@/lib/store/authStore';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { trackCustomerActivity } from '@/lib/analytics/customerAnalytics';
import { formatDate, formatDateShort } from '@/lib/utils/format';
import {
  TASK_PRIORITY_BADGE,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_BADGE,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TASK_TYPE_LABELS,
  normalizeTaskStatus,
} from '@/lib/utils/tasks';
import {
  Task,
  TaskAttachment,
  TaskComment,
  TaskDetail,
  TaskPriority,
  TaskStatus,
  TaskType,
  TaskView,
} from '@/types';
import Link from 'next/link';
import {
  ListTodo,
  Paperclip,
  MessageSquare,
  Plus,
  LayoutGrid,
  List as ListIcon,
  ChevronRight,
} from 'lucide-react';

type FilterValue = 'ALL' | TaskStatus;

const DEFAULT_REQUEST = {
  title: '',
  description: '',
  type: 'OTHER' as TaskType,
  priority: 'NONE' as TaskPriority,
};

// Tek dil: durum/oncelik rozetleri .badge-* sinifina eslenir
const STATUS_BADGE_CLASS: Record<string, string> = {
  info: 'badge-info',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  destructive: 'badge-danger',
  default: 'badge-neutral',
};

const badgeClassFor = (variant?: string) => STATUS_BADGE_CLASS[variant || 'default'] || 'badge-neutral';

// Talep no (gercek veri yok): id'den okunabilir mono token
const taskRef = (id: string) => `#${id.slice(-6).toUpperCase()}`;

export default function CustomerRequestsPage() {
  const { loadUserFromStorage } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<TaskView>('KANBAN');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterValue>('ALL');
  const debouncedSearch = useDebounce(search, 300);
  const lastSearchRef = useRef('');
  const tasksRequestSequenceRef = useRef(0);

  const [newRequest, setNewRequest] = useState(DEFAULT_REQUEST);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [detailTask, setDetailTask] = useState<TaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const commentSubmittingRef = useRef(false);
  const attachmentUploadingRef = useRef(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadUserFromStorage();
    fetchPreferences();
  }, [loadUserFromStorage]);

  useEffect(() => {
    const term = debouncedSearch.trim();
    if (!term) {
      lastSearchRef.current = '';
      return;
    }
    if (term === lastSearchRef.current) return;
    lastSearchRef.current = term;
    trackCustomerActivity({
      type: 'SEARCH',
      pagePath: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined,
      pageTitle: typeof document !== 'undefined' ? document.title : undefined,
      meta: { query: term, source: 'my-requests' },
    });
  }, [debouncedSearch]);

  useEffect(() => {
    fetchTasks();
  }, [debouncedSearch, statusFilter]);

  const fetchPreferences = async () => {
    try {
      const { preferences } = await customerApi.getTaskPreferences();
      setView(preferences.defaultView || 'KANBAN');
    } catch (error) {
      console.error('Task preferences not loaded:', error);
    }
  };

  const fetchTasks = async () => {
    const requestId = ++tasksRequestSequenceRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const params: any = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter !== 'ALL') {
        params.status = statusFilter === 'IN_PROGRESS'
          ? 'IN_PROGRESS,WAITING'
          : statusFilter;
      }
      const { tasks } = await customerApi.getTasks(params);
      if (requestId !== tasksRequestSequenceRef.current) return;
      setTasks(tasks);
    } catch (error) {
      if (requestId !== tasksRequestSequenceRef.current) return;
      console.error('Tasks not loaded:', error);
      setTasks([]);
      setLoadError('Talepleriniz şu anda yüklenemedi. Kayıtlarınız silinmedi.');
    } finally {
      if (requestId === tasksRequestSequenceRef.current) setIsLoading(false);
    }
  };

  const handleViewChange = async (value: TaskView) => {
    const previousView = view;
    setView(value);
    try {
      await customerApi.updateTaskPreferences({ defaultView: value });
    } catch (error) {
      console.error('Task view preference not saved:', error);
      setView(previousView);
      toast.error('Görünüm tercihi kaydedilemedi. Lütfen tekrar deneyin.');
    }
  };

  const handleCreateRequest = async () => {
    if (!newRequest.title.trim()) {
      toast.error('Başlık gerekli');
      return;
    }
    setCreating(true);
    try {
      await customerApi.createTask({
        title: newRequest.title.trim(),
        description: newRequest.description.trim() || null,
        type: newRequest.type,
        priority: newRequest.priority,
      });
      toast.success('Talep gönderildi');
      setNewRequest(DEFAULT_REQUEST);
      setCreateOpen(false);
      fetchTasks();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Talep oluşturulamadı');
    } finally {
      setCreating(false);
    }
  };

  const openTaskDetail = async (taskId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const { task } = await customerApi.getTaskById(taskId);
      setDetailTask(task);
    } catch (error) {
      toast.error('Talep yuklenemedi');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!detailTask) return;
    if (commentSubmittingRef.current) return;
    if (!commentText.trim()) {
      toast.error('Yorum gerekli');
      return;
    }
    const body = commentText.trim();
    commentSubmittingRef.current = true;
    setCommentSubmitting(true);
    try {
      const { comment } = await customerApi.addTaskComment(detailTask.id, {
        body,
      });
      setDetailTask((prev) =>
        prev
          ? {
              ...prev,
              comments: [...prev.comments, comment as TaskComment],
              _count: prev._count
                ? { ...prev._count, comments: prev._count.comments + 1 }
                : prev._count,
            }
          : prev
      );
      setCommentText('');
      await fetchTasks();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Yorum eklenemedi');
    } finally {
      commentSubmittingRef.current = false;
      setCommentSubmitting(false);
    }
  };

  const handleUploadAttachment = async () => {
    if (attachmentUploadingRef.current) return;
    if (!detailTask || !attachmentFile) {
      toast.error('Dosya secin');
      return;
    }
    const file = attachmentFile;
    const formData = new FormData();
    formData.append('file', file);
    attachmentUploadingRef.current = true;
    setAttachmentUploading(true);
    try {
      const { attachment } = await customerApi.addTaskAttachment(detailTask.id, formData);
      setDetailTask((prev) =>
        prev
          ? {
              ...prev,
              attachments: [...prev.attachments, attachment as TaskAttachment],
              _count: prev._count
                ? { ...prev._count, attachments: prev._count.attachments + 1 }
                : prev._count,
            }
          : prev
      );
      setAttachmentFile(null);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
      await fetchTasks();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Dosya yuklenemedi');
    } finally {
      attachmentUploadingRef.current = false;
      setAttachmentUploading(false);
    }
  };

  const groupedTasks = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    TASK_STATUS_ORDER.forEach((status) => map.set(status, []));
    tasks.forEach((task) => {
      map.get(normalizeTaskStatus(task.status))?.push(task);
    });
    return map;
  }, [tasks]);

  const visibleStatuses = statusFilter === 'ALL' ? TASK_STATUS_ORDER : [statusFilter];

  const renderTaskCard = (task: Task) => {
    const dueLabel = task.dueDate ? formatDateShort(task.dueDate) : null;
    const isOverdue = task.dueDate ? new Date(task.dueDate) < new Date() && task.status !== 'DONE' : false;

    return (
      <button
        key={task.id}
        onClick={() => openTaskDetail(task.id)}
        className="w-full rounded-xl border border-[var(--line)] bg-white p-3 text-left transition-shadow hover:shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_24px_-12px_rgba(15,23,42,0.14)]"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-semibold text-[var(--ink-1)]">{task.title}</p>
          <span className={badgeClassFor(TASK_PRIORITY_BADGE[task.priority])}>
            {TASK_PRIORITY_LABELS[task.priority]}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="chip">{TASK_TYPE_LABELS[task.type]}</span>
          <span className="text-[11px] text-[var(--ink-3)]">Atanan: {task.assignedTo?.name || '-'}</span>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-[var(--ink-3)]">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              {task._count?.comments ?? 0}
            </span>
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3.5 w-3.5" />
              {task._count?.attachments ?? 0}
            </span>
          </div>
          {dueLabel && (
            <span className={isOverdue ? 'font-semibold text-red-600' : ''}>
              {dueLabel}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-6 space-y-6">
        {/* Breadcrumb */}
        <div className="-mb-2 flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <Link href="/home" className="hover:text-primary-700">Ana Sayfa</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-[var(--ink-2)]">Taleplerim</span>
        </div>

        {/* Sayfa basligi + aksiyonlar */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3.5">
            <span className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-[13px] bg-primary-50 text-primary-600">
              <ListTodo className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h1 className="text-[23px] font-extrabold tracking-[-0.02em] text-[var(--ink-1)]">Taleplerim</h1>
              <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">Destek ve iş talepleriniz · durum, öncelik ve termin takibi</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-[var(--line-strong)]">
              <button
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${view === 'KANBAN' ? 'bg-primary-600 text-white' : 'bg-white text-[var(--ink-2)] hover:bg-gray-50'}`}
                onClick={() => handleViewChange('KANBAN')}
              >
                <LayoutGrid className="h-4 w-4" strokeWidth={2} />
                Kanban
              </button>
              <button
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${view === 'LIST' ? 'bg-primary-600 text-white' : 'bg-white text-[var(--ink-2)] hover:bg-gray-50'}`}
                onClick={() => handleViewChange('LIST')}
              >
                <ListIcon className="h-4 w-4" strokeWidth={2} />
                Liste
              </button>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="flex-shrink-0">
              <Plus className="h-4 w-4" strokeWidth={2.4} />
              Yeni talep oluştur
            </Button>
          </div>
        </div>

        {/* Filtreler */}
        <div className="card card-pad">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Input
              label="Arama"
              placeholder="Başlık veya açıklama..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div>
              <label className="field-label">Durum</label>
              <select
                className="input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as FilterValue)}
              >
                <option value="ALL">Tüm Durumlar</option>
                {TASK_STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {TASK_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary-600"></div>
          </div>
        ) : loadError ? (
          <LoadErrorState
            title="Talepler yüklenemedi"
            description={loadError}
            onRetry={() => void fetchTasks()}
          />
        ) : view === 'KANBAN' ? (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {visibleStatuses.map((status) => (
              <div key={status} className="min-w-[220px] max-w-[240px] flex-1">
                <div className="mb-3 flex items-center gap-2">
                  <span className={badgeClassFor(TASK_STATUS_BADGE[status])}>
                    {TASK_STATUS_LABELS[status]}
                  </span>
                  <span className="text-xs text-[var(--ink-3)]">
                    {groupedTasks.get(status)?.length || 0}
                  </span>
                </div>
                <div className="space-y-2">
                  {(groupedTasks.get(status) || []).map(renderTaskCard)}
                  {(groupedTasks.get(status) || []).length === 0 && (
                    <div className="rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-1)] p-3 text-center text-xs text-[var(--ink-3)]">
                      Bu kolonda talep yok.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Liste: tasarim tablosu — No / Baslik / Durum / Oncelik / Termin / Atanan */
          <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_1px_2px_rgba(20,34,59,0.04)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] bg-[var(--surface-1)] text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[var(--ink-3)]">
                    <th className="px-[18px] py-3 font-semibold">No</th>
                    <th className="px-[18px] py-3 font-semibold">Başlık</th>
                    <th className="px-[18px] py-3 text-center font-semibold">Durum</th>
                    <th className="px-[18px] py-3 text-center font-semibold">Öncelik</th>
                    <th className="px-[18px] py-3 font-semibold">Termin</th>
                    <th className="px-[18px] py-3 font-semibold">Atanan</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const isOverdue = task.dueDate
                      ? new Date(task.dueDate) < new Date() && normalizeTaskStatus(task.status) !== 'DONE'
                      : false;
                    return (
                      <tr
                        key={task.id}
                        className="cursor-pointer border-t border-[var(--line)] transition-colors hover:bg-[var(--surface-1)]"
                        onClick={() => openTaskDetail(task.id)}
                      >
                        <td className="whitespace-nowrap px-[18px] py-3.5 font-mono text-[var(--ink-3)]">
                          {taskRef(task.id)}
                        </td>
                        <td className="px-[18px] py-3.5 font-medium text-[var(--ink-1)]">{task.title}</td>
                        <td className="px-[18px] py-3.5 text-center">
                          <span className={badgeClassFor(TASK_STATUS_BADGE[normalizeTaskStatus(task.status)])}>
                            {TASK_STATUS_LABELS[normalizeTaskStatus(task.status)]}
                          </span>
                        </td>
                        <td className="px-[18px] py-3.5 text-center">
                          <span className={badgeClassFor(TASK_PRIORITY_BADGE[task.priority])}>
                            {TASK_PRIORITY_LABELS[task.priority]}
                          </span>
                        </td>
                        <td className={`whitespace-nowrap px-[18px] py-3.5 ${isOverdue ? 'font-semibold text-red-600' : 'text-[var(--ink-2)]'}`}>
                          {task.dueDate ? formatDateShort(task.dueDate) : '—'}
                        </td>
                        <td className="px-[18px] py-3.5 text-[var(--ink-2)]">{task.assignedTo?.name || '—'}</td>
                      </tr>
                    );
                  })}
                  {tasks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-[18px] py-12 text-center text-[var(--ink-3)]">
                        Talep bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Yeni talep modali — create akisi korunur */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni Talep"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Vazgeç
            </Button>
            <Button onClick={handleCreateRequest} isLoading={creating}>
              Talep Gonder
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Baslik"
            placeholder="Kisa bir baslik yazin"
            value={newRequest.title}
            onChange={(e) => setNewRequest((prev) => ({ ...prev, title: e.target.value }))}
          />
          <div>
            <label className="field-label">Aciklama</label>
            <textarea
              rows={4}
              className="input"
              placeholder="Talebinizi detaylandirin (opsiyonel)"
              value={newRequest.description}
              onChange={(e) => setNewRequest((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="field-label">Tur</label>
              <select
                className="input"
                value={newRequest.type}
                onChange={(e) => setNewRequest((prev) => ({ ...prev, type: e.target.value as TaskType }))}
              >
                {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((type) => (
                  <option key={type} value={type}>
                    {TASK_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Oncelik</label>
              <select
                className="input"
                value={newRequest.priority}
                onChange={(e) => setNewRequest((prev) => ({ ...prev, priority: e.target.value as TaskPriority }))}
              >
                {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((priority) => (
                  <option key={priority} value={priority}>
                    {TASK_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailTask(null);
        }}
        title="Talep Detayi"
        size="xl"
        footer={
          <Button variant="secondary" onClick={() => setDetailOpen(false)}>
            Kapat
          </Button>
        }
      >
        {detailLoading || !detailTask ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="card card-pad space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[var(--ink-3)]">{taskRef(detailTask.id)}</span>
                <div className="text-lg font-semibold text-[var(--ink-1)]">{detailTask.title}</div>
              </div>
              <div className="whitespace-pre-wrap text-sm text-[var(--ink-2)]">{detailTask.description || '-'}</div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-3)]">
                <span className={badgeClassFor(TASK_STATUS_BADGE[normalizeTaskStatus(detailTask.status)])}>
                  {TASK_STATUS_LABELS[normalizeTaskStatus(detailTask.status)]}
                </span>
                <span className={badgeClassFor(TASK_PRIORITY_BADGE[detailTask.priority])}>
                  {TASK_PRIORITY_LABELS[detailTask.priority]}
                </span>
                <span className="chip">{TASK_TYPE_LABELS[detailTask.type]}</span>
                <span>Atanan: {detailTask.assignedTo?.name || '-'}</span>
                <span>Olusturma: {formatDate(detailTask.createdAt)}</span>
              </div>
            </div>

            <div className="card card-pad space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-1)]">
                <MessageSquare className="h-4 w-4 text-primary-600" />
                Yorumlar
              </div>
              <div className="space-y-3">
                {detailTask.comments.map((comment) => (
                  <div key={comment.id} className="surface p-3">
                    <div className="flex items-center justify-between text-xs text-[var(--ink-3)]">
                      <span className="font-medium text-[var(--ink-2)]">{comment.author?.name || 'Kullanici'}</span>
                      <span>{formatDate(comment.createdAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ink-1)]">{comment.body}</p>
                  </div>
                ))}
                {detailTask.comments.length === 0 && (
                  <div className="text-sm text-[var(--ink-3)]">Yorum yok.</div>
                )}
              </div>
              <div className="space-y-2">
                <textarea
                  rows={3}
                  className="input"
                  placeholder="Yorum yazin..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  disabled={commentSubmitting}
                />
                <Button size="sm" onClick={handleAddComment} isLoading={commentSubmitting} disabled={!commentText.trim()}>
                  Yorum Ekle
                </Button>
              </div>
            </div>

            <div className="card card-pad space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-1)]">
                <Paperclip className="h-4 w-4 text-primary-600" />
                Dosyalar
              </div>
              <div className="space-y-2">
                {(detailTask.attachments || []).map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    className="flex items-start gap-1.5 break-all text-sm text-primary-600 hover:underline"
                    rel="noreferrer"
                  >
                    <Paperclip className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span className="min-w-0">{attachment.originalName} ({Math.round(attachment.size / 1024)} KB)</span>
                  </a>
                ))}
                {detailTask.attachments.length === 0 && (
                  <div className="text-sm text-[var(--ink-3)]">Dosya yok.</div>
                )}
              </div>
              <div className="space-y-2">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  className="block w-full text-sm text-[var(--ink-2)] file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--ink-2)] hover:file:bg-gray-200"
                  onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                  disabled={attachmentUploading}
                />
                <Button
                  size="sm"
                  onClick={handleUploadAttachment}
                  isLoading={attachmentUploading}
                  disabled={!attachmentFile}
                >
                  Dosya Yükle
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
