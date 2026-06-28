'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import customerApi from '@/lib/api/customer';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
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
import { ListTodo, Paperclip, MessageSquare } from 'lucide-react';

type FilterValue = 'ALL' | TaskStatus;

const DEFAULT_REQUEST = {
  title: '',
  description: '',
  type: 'OTHER' as TaskType,
  priority: 'NONE' as TaskPriority,
};

export default function CustomerRequestsPage() {
  const { loadUserFromStorage } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<TaskView>('KANBAN');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterValue>('ALL');
  const debouncedSearch = useDebounce(search, 300);
  const lastSearchRef = useRef('');

  const [newRequest, setNewRequest] = useState(DEFAULT_REQUEST);
  const [creating, setCreating] = useState(false);

  const [detailTask, setDetailTask] = useState<TaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

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
    setIsLoading(true);
    try {
      const params: any = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter !== 'ALL') {
        params.status = statusFilter === 'IN_PROGRESS'
          ? 'IN_PROGRESS,WAITING'
          : statusFilter;
      }
      const { tasks } = await customerApi.getTasks(params);
      setTasks(tasks);
    } catch (error) {
      console.error('Tasks not loaded:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewChange = async (value: TaskView) => {
    setView(value);
    try {
      await customerApi.updateTaskPreferences({ defaultView: value });
    } catch (error) {
      console.error('Task view preference not saved:', error);
    }
  };

  const handleCreateRequest = async () => {
    if (!newRequest.title.trim()) {
      toast.error('Baslik gerekli');
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
      toast.success('Talep gonderildi');
      setNewRequest(DEFAULT_REQUEST);
      fetchTasks();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Talep olusturulamadi');
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
    if (!commentText.trim()) {
      toast.error('Yorum gerekli');
      return;
    }
    try {
      const { comment } = await customerApi.addTaskComment(detailTask.id, {
        body: commentText.trim(),
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
      fetchTasks();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Yorum eklenemedi');
    }
  };

  const handleUploadAttachment = async () => {
    if (!detailTask || !attachmentFile) {
      toast.error('Dosya secin');
      return;
    }
    const formData = new FormData();
    formData.append('file', attachmentFile);
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
      fetchTasks();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Dosya yuklenemedi');
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
        className="card card-hover w-full p-3 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-semibold text-gray-900">{task.title}</p>
          <Badge variant={TASK_PRIORITY_BADGE[task.priority] as any}>
            {TASK_PRIORITY_LABELS[task.priority]}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="chip">{TASK_TYPE_LABELS[task.type]}</span>
          <span className="text-[11px] text-gray-500">Atanan: {task.assignedTo?.name || '-'}</span>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
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
    <div className="min-h-screen">
      <div className="container-custom py-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <ListTodo className="h-5 w-5" />
            </div>
            <div>
              <h1 className="page-title">Taleplerim</h1>
              <p className="page-subtitle">Taleplerinizi olusturun ve takip edin.</p>
            </div>
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-[var(--line-strong)]">
            <button
              className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'KANBAN' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              onClick={() => handleViewChange('KANBAN')}
            >
              Kanban
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'LIST' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              onClick={() => handleViewChange('LIST')}
            >
              Liste
            </button>
          </div>
        </div>

        <div className="card card-pad space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Yeni Talep</h2>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div className="flex items-end">
              <Button onClick={handleCreateRequest} isLoading={creating} className="w-full">
                Talep Gonder
              </Button>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Input
              label="Arama"
              placeholder="Baslik veya aciklama..."
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
                <option value="ALL">Tum Durumlar</option>
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
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>
        ) : view === 'KANBAN' ? (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {visibleStatuses.map((status) => (
              <div key={status} className="min-w-[220px] max-w-[240px] flex-1">
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant={TASK_STATUS_BADGE[status] as any}>
                    {TASK_STATUS_LABELS[status]}
                  </Badge>
                  <span className="text-xs text-gray-400">
                    {groupedTasks.get(status)?.length || 0}
                  </span>
                </div>
                <div className="space-y-2">
                  {(groupedTasks.get(status) || []).map(renderTaskCard)}
                  {(groupedTasks.get(status) || []).length === 0 && (
                    <div className="rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-1)] p-3 text-center text-xs text-gray-400">
                      Bu kolonda talep yok.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Baslik</th>
                  <th className="px-5 py-3 font-medium">Durum</th>
                  <th className="px-5 py-3 font-medium">Tur</th>
                  <th className="px-5 py-3 font-medium">Oncelik</th>
                  <th className="px-5 py-3 font-medium">Atanan</th>
                  <th className="px-5 py-3 font-medium">Son Aktivite</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    className="cursor-pointer border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-1)]"
                    onClick={() => openTaskDetail(task.id)}
                  >
                    <td className="px-5 py-3 font-medium text-gray-900">{task.title}</td>
                    <td className="px-5 py-3">
                      <Badge variant={TASK_STATUS_BADGE[normalizeTaskStatus(task.status)] as any}>
                        {TASK_STATUS_LABELS[normalizeTaskStatus(task.status)]}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{TASK_TYPE_LABELS[task.type]}</td>
                    <td className="px-5 py-3 text-gray-600">{TASK_PRIORITY_LABELS[task.priority]}</td>
                    <td className="px-5 py-3 text-gray-600">{task.assignedTo?.name || '-'}</td>
                    <td className="px-5 py-3 text-gray-500">{formatDateShort(task.lastActivityAt)}</td>
                  </tr>
                ))}
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-gray-500">
                      Talep bulunamadi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="card card-pad space-y-2">
              <div className="text-lg font-semibold text-gray-900">{detailTask.title}</div>
              <div className="text-sm text-gray-600 whitespace-pre-wrap">{detailTask.description || '-'}</div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <Badge variant={TASK_STATUS_BADGE[normalizeTaskStatus(detailTask.status)] as any}>
                  {TASK_STATUS_LABELS[normalizeTaskStatus(detailTask.status)]}
                </Badge>
                <Badge variant={TASK_PRIORITY_BADGE[detailTask.priority] as any}>
                  {TASK_PRIORITY_LABELS[detailTask.priority]}
                </Badge>
                <span className="chip">{TASK_TYPE_LABELS[detailTask.type]}</span>
                <span>Atanan: {detailTask.assignedTo?.name || '-'}</span>
                <span>Olusturma: {formatDate(detailTask.createdAt)}</span>
              </div>
            </div>

            <div className="card card-pad space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <MessageSquare className="h-4 w-4 text-primary-600" />
                Yorumlar
              </div>
              <div className="space-y-3">
                {detailTask.comments.map((comment) => (
                  <div key={comment.id} className="surface p-3">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span className="font-medium text-gray-600">{comment.author?.name || 'Kullanici'}</span>
                      <span>{formatDate(comment.createdAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{comment.body}</p>
                  </div>
                ))}
                {detailTask.comments.length === 0 && (
                  <div className="text-sm text-gray-400">Yorum yok.</div>
                )}
              </div>
              <div className="space-y-2">
                <textarea
                  rows={3}
                  className="input"
                  placeholder="Yorum yazin..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <Button size="sm" onClick={handleAddComment}>
                  Yorum Ekle
                </Button>
              </div>
            </div>

            <div className="card card-pad space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Paperclip className="h-4 w-4 text-primary-600" />
                Dosyalar
              </div>
              <div className="space-y-2">
                {(detailTask.attachments || []).map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:underline"
                    rel="noreferrer"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {attachment.originalName} ({Math.round(attachment.size / 1024)} KB)
                  </a>
                ))}
                {detailTask.attachments.length === 0 && (
                  <div className="text-sm text-gray-400">Dosya yok.</div>
                )}
              </div>
              <div className="space-y-2">
                <input
                  type="file"
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                  onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                />
                <Button size="sm" onClick={handleUploadAttachment}>
                  Dosya Yukle
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
