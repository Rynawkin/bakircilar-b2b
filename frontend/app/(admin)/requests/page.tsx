'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { AdminNavigation } from '@/components/layout/AdminNavigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
  TaskLink,
  TaskTemplate,
  TaskView,
  TaskStatus,
  TaskPriority,
  TaskType,
  TaskLinkType,
  TaskVisibility,
  Customer,
} from '@/types';
import { ListTodo, Plus, RefreshCcw, Paperclip, MessageSquare, Link2 } from 'lucide-react';

type FilterValue = 'ALL' | TaskStatus;

const DEFAULT_TASK: {
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  assignedToId: string;
  customerId: string;
  templateId: string;
} = {
  title: '',
  description: '',
  type: 'OTHER',
  priority: 'NONE',
  status: 'NEW',
  dueDate: '',
  assignedToId: '',
  customerId: '',
  templateId: '',
};

const LINK_TYPES: TaskLinkType[] = ['PRODUCT', 'QUOTE', 'ORDER', 'CUSTOMER', 'PAGE', 'OTHER'];

export default function AdminRequestsPage() {
  const { user, loadUserFromStorage } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [assignees, setAssignees] = useState<Array<{ id: string; name: string; email?: string; role?: string }>>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<TaskView>('KANBAN');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterValue>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | TaskType>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | TaskPriority>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
  const debouncedSearch = useDebounce(search, 300);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [newTask, setNewTask] = useState(DEFAULT_TASK);
  const [creating, setCreating] = useState(false);

  const [detailTask, setDetailTask] = useState<TaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailForm, setDetailForm] = useState(DEFAULT_TASK);
  const [detailSaving, setDetailSaving] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<TaskVisibility>('PUBLIC');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentVisibility, setAttachmentVisibility] = useState<TaskVisibility>('PUBLIC');
  const [linkForm, setLinkForm] = useState({
    type: 'OTHER' as TaskLinkType,
    label: '',
    referenceCode: '',
    referenceUrl: '',
  });

  const canManageTemplates =
    user?.role === 'HEAD_ADMIN' || user?.role === 'ADMIN' || user?.role === 'MANAGER';

  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  useEffect(() => {
    fetchPreferences();
    fetchAssignees();
    fetchTemplates();
    fetchCustomers();
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [debouncedSearch, statusFilter, typeFilter, priorityFilter, assigneeFilter]);

  const fetchPreferences = async () => {
    try {
      const { preferences } = await adminApi.getTaskPreferences();
      setView(preferences.defaultView || 'KANBAN');
    } catch (error) {
      console.error('Task preferences not loaded:', error);
    }
  };

  const fetchAssignees = async () => {
    try {
      const { assignees } = await adminApi.getTaskAssignees();
      setAssignees(assignees);
    } catch (error) {
      console.error('Assignees not loaded:', error);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { templates } = await adminApi.getTaskTemplates(true);
      setTemplates(templates);
    } catch (error) {
      console.error('Templates not loaded:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
      const { customers } = await adminApi.getCustomers();
      setCustomers(customers);
    } catch (error) {
      console.error('Customers not loaded:', error);
    }
  };

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (typeFilter !== 'ALL') params.type = typeFilter;
      if (priorityFilter !== 'ALL') params.priority = priorityFilter;
      if (assigneeFilter !== 'ALL') params.assignedToId = assigneeFilter;

      const { tasks } = await adminApi.getTasks(params);
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
      await adminApi.updateTaskPreferences(value);
    } catch (error) {
      console.error('Task view preference not saved:', error);
    }
  };

  const handleOpenCreate = () => {
    setNewTask(DEFAULT_TASK);
    setShowCreateModal(true);
  };

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) {
      setNewTask((prev) => ({ ...prev, templateId }));
      return;
    }
    setNewTask((prev) => ({
      ...prev,
      templateId: template.id,
      title: template.title || prev.title,
      description: template.description || '',
      type: template.type,
      priority: template.priority,
      status: template.defaultStatus,
    }));
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) {
      toast.error('Baslik gerekli');
      return;
    }
    setCreating(true);
    try {
      await adminApi.createTask({
        title: newTask.title.trim(),
        description: newTask.description.trim() || null,
        type: newTask.type,
        priority: newTask.priority,
        status: newTask.status,
        dueDate: newTask.dueDate || null,
        assignedToId: newTask.assignedToId || null,
        customerId: newTask.customerId || null,
        templateId: newTask.templateId || null,
      });
      toast.success('Talep olusturuldu');
      setShowCreateModal(false);
      setNewTask(DEFAULT_TASK);
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
      const { task } = await adminApi.getTaskById(taskId);
      setDetailTask(task);
      setDetailForm({
        title: task.title || '',
        description: task.description || '',
        type: task.type,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
        assignedToId: task.assignedTo?.id || '',
        customerId: task.customer?.id || '',
        templateId: '',
      });
    } catch (error) {
      toast.error('Talep yuklenemedi');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSaveDetail = async () => {
    if (!detailTask) return;
    if (!detailForm.title.trim()) {
      toast.error('Baslik gerekli');
      return;
    }
    setDetailSaving(true);
    try {
      const { task } = await adminApi.updateTask(detailTask.id, {
        title: detailForm.title.trim(),
        description: detailForm.description.trim() || null,
        type: detailForm.type,
        priority: detailForm.priority,
        status: detailForm.status,
        dueDate: detailForm.dueDate || null,
        assignedToId: detailForm.assignedToId || null,
        customerId: detailForm.customerId || null,
      });
      setDetailTask(task);
      toast.success('Talep guncellendi');
      fetchTasks();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Guncelleme basarisiz');
    } finally {
      setDetailSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!detailTask) return;
    if (!commentText.trim()) {
      toast.error('Yorum gerekli');
      return;
    }
    try {
      const { comment } = await adminApi.addTaskComment(detailTask.id, {
        body: commentText.trim(),
        visibility: commentVisibility,
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
    formData.append('visibility', attachmentVisibility);
    try {
      const { attachment } = await adminApi.addTaskAttachment(detailTask.id, formData);
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

  const handleAddLink = async () => {
    if (!detailTask) return;
    if (!linkForm.label && !linkForm.referenceCode && !linkForm.referenceUrl) {
      toast.error('Link bilgisi girin');
      return;
    }
    try {
      const { link } = await adminApi.addTaskLink(detailTask.id, {
        type: linkForm.type,
        label: linkForm.label || undefined,
        referenceCode: linkForm.referenceCode || undefined,
        referenceUrl: linkForm.referenceUrl || undefined,
      });
      setDetailTask((prev) =>
        prev
          ? {
              ...prev,
              links: [...(prev.links || []), link as TaskLink],
            }
          : prev
      );
      setLinkForm({ type: 'OTHER', label: '', referenceCode: '', referenceUrl: '' });
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Link eklenemedi');
    }
  };

  const handleRemoveLink = async (linkId: string) => {
    if (!detailTask) return;
    try {
      await adminApi.deleteTaskLink(detailTask.id, linkId);
      setDetailTask((prev) =>
        prev
          ? {
              ...prev,
              links: (prev.links || []).filter((link) => link.id !== linkId),
            }
          : prev
      );
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Link silinemedi');
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
          {task.customer && (
            <div>{task.customer.displayName || task.customer.mikroName || task.customer.name}</div>
          )}
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
      <AdminNavigation />
      <div className="container-custom py-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ListTodo className="w-6 h-6 text-primary-600" />
              Talepler
            </h1>
            <p className="text-sm text-gray-600">
              Taleplerinizi takip edin, atayin ve ilerlemeyi gorun.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleOpenCreate}>
              <Plus className="w-4 h-4 mr-1" />
              Yeni Talep
            </Button>
            {canManageTemplates && (
              <Button variant="secondary" onClick={() => setShowTemplateModal(true)}>
                Sablonlar
              </Button>
            )}
            <Button variant="secondary" onClick={fetchTasks}>
              <RefreshCcw className="w-4 h-4 mr-1" />
              Yenile
            </Button>
          </div>
        </div>

        <Card className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <Input
                label="Arama"
                placeholder="Baslik, musteri veya kisi..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tur</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'ALL' | TaskType)}
              >
                <option value="ALL">Tum Turler</option>
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
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as 'ALL' | TaskPriority)}
              >
                <option value="ALL">Tum Oncelikler</option>
                {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((priority) => (
                  <option key={priority} value={priority}>
                    {TASK_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Atanan</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
              >
                <option value="ALL">Tum Kullanicilar</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2 flex justify-end">
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
                  <th className="py-3 pr-4">Musteri</th>
                  <th className="py-3 pr-4">Son Tarih</th>
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
                    <td className="py-3 pr-4">
                      {task.customer?.displayName || task.customer?.mikroName || task.customer?.name || '-'}
                    </td>
                    <td className="py-3 pr-4">{task.dueDate ? formatDateShort(task.dueDate) : '-'}</td>
                    <td className="py-3">{formatDateShort(task.lastActivityAt)}</td>
                  </tr>
                ))}
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-gray-500">
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
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Yeni Talep"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Iptal
            </Button>
            <Button onClick={handleCreateTask} isLoading={creating}>
              Olustur
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Baslik"
            value={newTask.title}
            onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Aciklama</label>
            <textarea
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              value={newTask.description}
              onChange={(e) => setNewTask((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tur</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                value={newTask.type}
                onChange={(e) => setNewTask((prev) => ({ ...prev, type: e.target.value as TaskType }))}
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
                value={newTask.priority}
                onChange={(e) => setNewTask((prev) => ({ ...prev, priority: e.target.value as TaskPriority }))}
              >
                {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((priority) => (
                  <option key={priority} value={priority}>
                    {TASK_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Durum</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                value={newTask.status}
                onChange={(e) => setNewTask((prev) => ({ ...prev, status: e.target.value as TaskStatus }))}
              >
                {TASK_STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {TASK_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Son Tarih"
              type="date"
              value={newTask.dueDate}
              onChange={(e) => setNewTask((prev) => ({ ...prev, dueDate: e.target.value }))}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Atanan</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                value={newTask.assignedToId}
                onChange={(e) => setNewTask((prev) => ({ ...prev, assignedToId: e.target.value }))}
              >
                <option value="">Otomatik / Ben</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Musteri</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                value={newTask.customerId}
                onChange={(e) => setNewTask((prev) => ({ ...prev, customerId: e.target.value }))}
              >
                <option value="">Secilmedi</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.mikroCariCode ? `${customer.mikroCariCode} - ` : ''}{customer.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sablon</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                value={newTask.templateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
              >
                <option value="">Sablon Yok</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        title="Sablon Gorevler"
        size="lg"
      >
        <TemplateManager
          templates={templates}
          onRefresh={fetchTemplates}
        />
      </Modal>

      <Modal
        isOpen={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailTask(null);
        }}
        title="Talep Detayi"
        size="full"
        footer={
          detailTask ? (
            <>
              <Button variant="secondary" onClick={() => setDetailOpen(false)}>
                Kapat
              </Button>
              <Button onClick={handleSaveDetail} isLoading={detailSaving}>
                Guncelle
              </Button>
            </>
          ) : null
        }
      >
        {detailLoading || !detailTask ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              <Card className="space-y-4">
                <Input
                  label="Baslik"
                  value={detailForm.title}
                  onChange={(e) => setDetailForm((prev) => ({ ...prev, title: e.target.value }))}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Aciklama</label>
                  <textarea
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    value={detailForm.description}
                    onChange={(e) => setDetailForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Durum</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      value={detailForm.status}
                      onChange={(e) => setDetailForm((prev) => ({ ...prev, status: e.target.value as TaskStatus }))}
                    >
                      {TASK_STATUS_ORDER.map((status) => (
                        <option key={status} value={status}>
                          {TASK_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Oncelik</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      value={detailForm.priority}
                      onChange={(e) => setDetailForm((prev) => ({ ...prev, priority: e.target.value as TaskPriority }))}
                    >
                      {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((priority) => (
                        <option key={priority} value={priority}>
                          {TASK_PRIORITY_LABELS[priority]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tur</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      value={detailForm.type}
                      onChange={(e) => setDetailForm((prev) => ({ ...prev, type: e.target.value as TaskType }))}
                    >
                      {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((type) => (
                        <option key={type} value={type}>
                          {TASK_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Son Tarih"
                    type="date"
                    value={detailForm.dueDate}
                    onChange={(e) => setDetailForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Atanan</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      value={detailForm.assignedToId}
                      onChange={(e) => setDetailForm((prev) => ({ ...prev, assignedToId: e.target.value }))}
                    >
                      <option value="">Secilmedi</option>
                      {assignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>
                          {assignee.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Musteri</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      value={detailForm.customerId}
                      onChange={(e) => setDetailForm((prev) => ({ ...prev, customerId: e.target.value }))}
                    >
                      <option value="">Secilmedi</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.mikroCariCode ? `${customer.mikroCariCode} - ` : ''}{customer.name}
                        </option>
                      ))}
                    </select>
                  </div>
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
                      {comment.visibility === 'INTERNAL' && (
                        <Badge variant="outline" className="mt-2">Internal</Badge>
                      )}
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
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      value={commentVisibility}
                      onChange={(e) => setCommentVisibility(e.target.value as TaskVisibility)}
                    >
                      <option value="PUBLIC">Herkese Acik</option>
                      <option value="INTERNAL">Sadece Ic</option>
                    </select>
                    <Button size="sm" onClick={handleAddComment}>
                      Yorum Ekle
                    </Button>
                  </div>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      value={attachmentVisibility}
                      onChange={(e) => setAttachmentVisibility(e.target.value as TaskVisibility)}
                    >
                      <option value="PUBLIC">Herkese Acik</option>
                      <option value="INTERNAL">Sadece Ic</option>
                    </select>
                    <Button size="sm" onClick={handleUploadAttachment}>
                      Dosya Yukle
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="space-y-3">
                <div className="text-sm font-semibold text-gray-800">Bilgiler</div>
                <div className="text-xs text-gray-500 space-y-1">
                  <div>Olusturan: {detailTask.createdBy?.name || '-'}</div>
                  <div>Atanan: {detailTask.assignedTo?.name || '-'}</div>
                  <div>Olusturma: {formatDate(detailTask.createdAt)}</div>
                  <div>Son Aktivite: {formatDate(detailTask.lastActivityAt)}</div>
                </div>
              </Card>

              <Card className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <Link2 className="w-4 h-4" />
                  Iliskiler
                </div>
                <div className="space-y-2">
                  {(detailTask.links || []).map((link) => (
                    <div key={link.id} className="flex items-center justify-between text-xs text-gray-600">
                      <span>
                        {link.type}: {link.label || link.referenceCode || link.referenceUrl || '-'}
                      </span>
                      <button
                        className="text-red-500 hover:text-red-600"
                        onClick={() => handleRemoveLink(link.id)}
                      >
                        Sil
                      </button>
                    </div>
                  ))}
                  {(detailTask.links || []).length === 0 && (
                    <div className="text-xs text-gray-500">Baglanti yok.</div>
                  )}
                </div>
                <div className="space-y-2">
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={linkForm.type}
                    onChange={(e) => setLinkForm((prev) => ({ ...prev, type: e.target.value as TaskLinkType }))}
                  >
                    {LINK_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Baslik / Etiket"
                    value={linkForm.label}
                    onChange={(e) => setLinkForm((prev) => ({ ...prev, label: e.target.value }))}
                  />
                  <Input
                    placeholder="Referans kodu"
                    value={linkForm.referenceCode}
                    onChange={(e) => setLinkForm((prev) => ({ ...prev, referenceCode: e.target.value }))}
                  />
                  <Input
                    placeholder="Link (opsiyonel)"
                    value={linkForm.referenceUrl}
                    onChange={(e) => setLinkForm((prev) => ({ ...prev, referenceUrl: e.target.value }))}
                  />
                  <Button size="sm" onClick={handleAddLink}>
                    Link Ekle
                  </Button>
                </div>
              </Card>

              <Card className="space-y-3">
                <div className="text-sm font-semibold text-gray-800">Durum Gecmisi</div>
                <div className="space-y-2 text-xs text-gray-600">
                  {detailTask.statusHistory.map((history) => (
                    <div key={history.id} className="flex items-center justify-between">
                      <span>
                        {history.fromStatus ? TASK_STATUS_LABELS[history.fromStatus as TaskStatus] : 'Baslangic'} ->
                        {` ${TASK_STATUS_LABELS[history.toStatus]}`}
                      </span>
                      <span>{formatDateShort(history.createdAt)}</span>
                    </div>
                  ))}
                  {detailTask.statusHistory.length === 0 && (
                    <div className="text-xs text-gray-500">Durum kaydi yok.</div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function TemplateManager({
  templates,
  onRefresh,
}: {
  templates: TaskTemplate[];
  onRefresh: () => void;
}) {
  const [form, setForm] = useState({
    id: '',
    title: '',
    description: '',
    type: 'OTHER' as TaskType,
    priority: 'NONE' as TaskPriority,
    defaultStatus: 'NEW' as TaskStatus,
    isActive: true,
  });
  const [saving, setSaving] = useState(false);

  const handleEditTemplate = (template: TaskTemplate) => {
    setForm({
      id: template.id,
      title: template.title,
      description: template.description || '',
      type: template.type,
      priority: template.priority,
      defaultStatus: template.defaultStatus,
      isActive: template.isActive,
    });
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('Baslik gerekli');
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await adminApi.updateTaskTemplate(form.id, {
          title: form.title.trim(),
          description: form.description.trim() || null,
          type: form.type,
          priority: form.priority,
          defaultStatus: form.defaultStatus,
          isActive: form.isActive,
        });
        toast.success('Sablon guncellendi');
      } else {
        await adminApi.createTaskTemplate({
          title: form.title.trim(),
          description: form.description.trim() || null,
          type: form.type,
          priority: form.priority,
          defaultStatus: form.defaultStatus,
          isActive: form.isActive,
        });
        toast.success('Sablon olusturuldu');
      }
      setForm({
        id: '',
        title: '',
        description: '',
        type: 'OTHER',
        priority: 'NONE',
        defaultStatus: 'NEW',
        isActive: true,
      });
      onRefresh();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Sablon kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {templates.length === 0 && (
          <p className="text-sm text-gray-500">Sablon yok.</p>
        )}
        {templates.map((template) => (
          <button
            key={template.id}
            onClick={() => handleEditTemplate(template)}
            className="w-full text-left bg-gray-50 border border-gray-200 rounded-lg p-3 hover:bg-gray-100"
          >
            <div className="font-semibold text-sm text-gray-900">{template.title}</div>
            <div className="text-xs text-gray-500">{TASK_TYPE_LABELS[template.type]}</div>
          </button>
        ))}
      </div>

      <Card className="space-y-4">
        <Input
          label="Baslik"
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Aciklama</label>
          <textarea
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tur</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as TaskType }))}
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
              value={form.priority}
              onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as TaskPriority }))}
            >
              {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((priority) => (
                <option key={priority} value={priority}>
                  {TASK_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Baslangic Durumu</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              value={form.defaultStatus}
              onChange={(e) => setForm((prev) => ({ ...prev, defaultStatus: e.target.value as TaskStatus }))}
            >
              {TASK_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {TASK_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
          />
          <span>Aktif</span>
        </div>
        <Button onClick={handleSave} isLoading={saving}>
          {form.id ? 'Sablonu Guncelle' : 'Sablon Olustur'}
        </Button>
      </Card>
    </div>
  );
}
