'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import customerApi from '@/lib/api/customer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/lib/store/authStore';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { formatDate, formatDateShort } from '@/lib/utils/format';
import {
  TASK_PRIORITY_BADGE,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_BADGE,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TASK_TYPE_LABELS,
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
      if (statusFilter !== 'ALL') params.status = statusFilter;
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
      await customerApi.updateTaskPreferences(value);
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
      map.get(task.status)?.push(task);
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
        className="w-full text-left bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm text-gray-900 line-clamp-2">{task.title}</p>
          <Badge variant={TASK_PRIORITY_BADGE[task.priority] as any}>
            {TASK_PRIORITY_LABELS[task.priority]}
          </Badge>
        </div>
        <div className="mt-2 text-xs text-gray-500 space-y-1">
          <div>{TASK_TYPE_LABELS[task.type]}</div>
          <div>Atanan: {task.assignedTo?.name || '-'}</div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              {task._count?.comments ?? 0}
            </span>
            <span className="inline-flex items-center gap-1">
              <Paperclip className="w-3.5 h-3.5" />
              {task._count?.attachments ?? 0}
            </span>
          </div>
          {dueLabel && (
            <span className={isOverdue ? 'text-red-600 font-semibold' : ''}>
              {dueLabel}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container-custom py-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ListTodo className="w-6 h-6 text-primary-600" />
              Taleplerim
            </h1>
            <p className="text-sm text-gray-600">
              Taleplerinizi olusturun ve takip edin.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              className={`px-4 py-2 text-sm font-medium ${view === 'KANBAN' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700'}`}
              onClick={() => handleViewChange('KANBAN')}
            >
              Kanban
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium ${view === 'LIST' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700'}`}
              onClick={() => handleViewChange('LIST')}
            >
              Liste
            </button>
          </div>
        </div>

        <Card className="space-y-4">
          <Input
            label="Baslik"
            placeholder="Kisa bir baslik yazin"
            value={newRequest.title}
            onChange={(e) => setNewRequest((prev) => ({ ...prev, title: e.target.value }))}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Aciklama</label>
            <textarea
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              value={newRequest.description}
              onChange={(e) => setNewRequest((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tur</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Oncelik</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
              <Button onClick={handleCreateRequest} isLoading={creating}>
                Talep Gonder
              </Button>
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Input
              label="Arama"
              placeholder="Baslik veya aciklama..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Durum</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>
        ) : view === 'KANBAN' ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {visibleStatuses.map((status) => (
              <div key={status} className="min-w-[260px] max-w-[280px] flex-1">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={TASK_STATUS_BADGE[status] as any}>
                      {TASK_STATUS_LABELS[status]}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {groupedTasks.get(status)?.length || 0}
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {(groupedTasks.get(status) || []).map(renderTaskCard)}
                  {(groupedTasks.get(status) || []).length === 0 && (
                    <div className="text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-3 text-center">
                      Bu kolonda talep yok.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-gray-500 border-b">
                <tr>
                  <th className="py-3 pr-4">Baslik</th>
                  <th className="py-3 pr-4">Durum</th>
                  <th className="py-3 pr-4">Tur</th>
                  <th className="py-3 pr-4">Oncelik</th>
                  <th className="py-3 pr-4">Atanan</th>
                  <th className="py-3">Son Aktivite</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b last:border-b-0 hover:bg-gray-50 cursor-pointer"
                    onClick={() => openTaskDetail(task.id)}
                  >
                    <td className="py-3 pr-4 font-medium text-gray-900">{task.title}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={TASK_STATUS_BADGE[task.status] as any}>
                        {TASK_STATUS_LABELS[task.status]}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">{TASK_TYPE_LABELS[task.type]}</td>
                    <td className="py-3 pr-4">{TASK_PRIORITY_LABELS[task.priority]}</td>
                    <td className="py-3 pr-4">{task.assignedTo?.name || '-'}</td>
                    <td className="py-3">{formatDateShort(task.lastActivityAt)}</td>
                  </tr>
                ))}
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-gray-500">
                      Talep bulunamadi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
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
          <div className="space-y-6">
            <Card className="space-y-2">
              <div className="text-lg font-semibold text-gray-900">{detailTask.title}</div>
              <div className="text-sm text-gray-600">{detailTask.description || '-'}</div>
              <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                <Badge variant={TASK_STATUS_BADGE[detailTask.status] as any}>
                  {TASK_STATUS_LABELS[detailTask.status]}
                </Badge>
                <Badge variant={TASK_PRIORITY_BADGE[detailTask.priority] as any}>
                  {TASK_PRIORITY_LABELS[detailTask.priority]}
                </Badge>
                <span>{TASK_TYPE_LABELS[detailTask.type]}</span>
                <span>Atanan: {detailTask.assignedTo?.name || '-'}</span>
                <span>Olusturma: {formatDate(detailTask.createdAt)}</span>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <MessageSquare className="w-4 h-4" />
                Yorumlar
              </div>
              <div className="space-y-3">
                {detailTask.comments.map((comment) => (
                  <div key={comment.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{comment.author?.name || 'Kullanici'}</span>
                      <span>{formatDate(comment.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{comment.body}</p>
                  </div>
                ))}
                {detailTask.comments.length === 0 && (
                  <div className="text-sm text-gray-500">Yorum yok.</div>
                )}
              </div>
              <div className="space-y-2">
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Yorum yazin..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <Button size="sm" onClick={handleAddComment}>
                  Yorum Ekle
                </Button>
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Paperclip className="w-4 h-4" />
                Dosyalar
              </div>
              <div className="space-y-2">
                {(detailTask.attachments || []).map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    className="block text-sm text-primary-600 hover:underline"
                    rel="noreferrer"
                  >
                    {attachment.originalName} ({Math.round(attachment.size / 1024)} KB)
                  </a>
                ))}
                {detailTask.attachments.length === 0 && (
                  <div className="text-sm text-gray-500">Dosya yok.</div>
                )}
              </div>
              <div className="space-y-2">
                <input
                  type="file"
                  onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                />
                <Button size="sm" onClick={handleUploadAttachment}>
                  Dosya Yukle
                </Button>
              </div>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  );
}
