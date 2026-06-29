'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '@/lib/api/admin';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuthStore } from '@/lib/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { buildSearchTokens, matchesSearchTokens, normalizeSearchText } from '@/lib/utils/search';
import {
  TASK_PRIORITY_LABELS,
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

// Re-export tipler (Classic/New JSX'lerin ihtiyaci icin)
export type {
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

export type FilterValue = 'ALL' | TaskStatus;
export type TaskColor = 'red' | 'purple' | 'amber' | 'blue' | 'slate' | 'green';
export type TaskColorRule = {
  id: string;
  days: number;
  color: TaskColor;
  enabled: boolean;
};

export type ProductOption = {
  id: string;
  name: string;
  mikroCode?: string;
  unit?: string;
};

export const TASK_COLOR_OPTIONS: Array<{ value: TaskColor; label: string }> = [
  { value: 'red', label: 'Kirmizi' },
  { value: 'purple', label: 'Mor' },
  { value: 'amber', label: 'Sari' },
  { value: 'blue', label: 'Mavi' },
  { value: 'slate', label: 'Gri' },
  { value: 'green', label: 'Yesil' },
];

export const TASK_COLOR_CARD_CLASSES: Record<TaskColor, string> = {
  red: 'bg-red-50 border-red-200',
  purple: 'bg-purple-50 border-purple-200',
  amber: 'bg-amber-50 border-amber-200',
  blue: 'bg-blue-50 border-blue-200',
  slate: 'bg-slate-50 border-slate-200',
  green: 'bg-green-50 border-green-200',
};

export const TASK_COLOR_ROW_CLASSES: Record<TaskColor, string> = {
  red: 'bg-red-50',
  purple: 'bg-purple-50',
  amber: 'bg-amber-50',
  blue: 'bg-blue-50',
  slate: 'bg-slate-50',
  green: 'bg-green-50',
};

export const createTaskColorRule = (overrides?: Partial<TaskColorRule>): TaskColorRule => ({
  id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  days: 7,
  color: 'red',
  enabled: true,
  ...overrides,
});

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

export const LINK_TYPES: TaskLinkType[] = ['PRODUCT', 'QUOTE', 'ORDER', 'CUSTOMER', 'PAGE', 'OTHER'];

/**
 * Talepler ekraninin TUM mantigi (state/effect/handler/turetilmis deger).
 * Klasik ve yeni gorunum bu hook'u kullanir; gorsel disindaki hicbir mantik degismez.
 * Asagidaki kod, eski page.tsx'in `return (` oncesindeki mantigin BIRE BIR tasinmis halidir.
 */
export function useTalepler() {
  const { user, loadUserFromStorage } = useAuthStore();
  const { hasPermission } = usePermissions();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [assignees, setAssignees] = useState<Array<{ id: string; name: string; email?: string; role?: string }>>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<TaskView>('KANBAN');
  const kanbanRef = useRef<HTMLDivElement | null>(null);
  const kanbanScrollProxyRef = useRef<HTMLDivElement | null>(null);
  const syncScrollRef = useRef(false);
  const [kanbanScrollWidth, setKanbanScrollWidth] = useState(0);
  const [colorRules, setColorRules] = useState<TaskColorRule[]>([]);
  const [colorRulesOpen, setColorRulesOpen] = useState(false);
  const [colorRulesSaving, setColorRulesSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterValue>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | TaskType>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | TaskPriority>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
  const debouncedSearch = useDebounce(search, 300);
  const [customerSearch, setCustomerSearch] = useState('');
  const [detailCustomerSearch, setDetailCustomerSearch] = useState('');
  const debouncedCustomerSearch = useDebounce(customerSearch, 200);
  const debouncedDetailCustomerSearch = useDebounce(detailCustomerSearch, 200);

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
    referenceId: '',
  });
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebounce(productSearch, 250);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productSearching, setProductSearching] = useState(false);

  const canManageTemplates = hasPermission('admin:requests');

  const normalizeColorRules = (rules?: any[] | null): TaskColorRule[] => {
    if (!Array.isArray(rules)) return [];
    const allowedColors = TASK_COLOR_OPTIONS.map((option) => option.value);
    return rules
      .map((rule) => {
        if (!rule || typeof rule !== 'object') return null;
        const entry = rule as Record<string, unknown>;
        const days = Number.isFinite(Number(entry.days)) ? Math.max(1, Math.round(Number(entry.days))) : 0;
        const color = typeof entry.color === 'string' && allowedColors.includes(entry.color as TaskColor)
          ? (entry.color as TaskColor)
          : 'red';
        const enabled = entry.enabled !== undefined ? Boolean(entry.enabled) : true;
        const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : createTaskColorRule().id;
        if (days <= 0) return null;
        return { id, days, color, enabled } as TaskColorRule;
      })
      .filter(Boolean) as TaskColorRule[];
  };

  const customerTokens = useMemo(() => buildSearchTokens(debouncedCustomerSearch), [debouncedCustomerSearch]);
  const detailCustomerTokens = useMemo(() => buildSearchTokens(debouncedDetailCustomerSearch), [debouncedDetailCustomerSearch]);

  const filterCustomers = (tokens: string[]) => {
    if (tokens.length === 0) return customers;
    return customers.filter((customer) => {
      const haystack = normalizeSearchText(
        `${customer.mikroCariCode || ''} ${customer.name || ''} ${customer.email || ''} ${customer.city || ''} ${customer.district || ''}`
      );
      return matchesSearchTokens(haystack, tokens);
    });
  };

  const filteredCustomers = useMemo(() => filterCustomers(customerTokens), [customers, customerTokens]);
  const filteredDetailCustomers = useMemo(() => filterCustomers(detailCustomerTokens), [customers, detailCustomerTokens]);

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

  useEffect(() => {
    if (linkForm.type !== 'PRODUCT' && productSearch) {
      setProductSearch('');
    }
  }, [linkForm.type, productSearch]);

  useEffect(() => {
    let isActive = true;

    const run = async () => {
      if (linkForm.type !== 'PRODUCT') {
        setProductOptions([]);
        setProductSearching(false);
        return;
      }

      const term = debouncedProductSearch.trim();
      if (!term) {
        setProductOptions([]);
        setProductSearching(false);
        return;
      }

      setProductSearching(true);
      try {
        const { products } = await adminApi.getProducts({ search: term, limit: 10, page: 1 });
        if (!isActive) return;
        const mapped = (products || []).map((product: any) => ({
          id: product.id,
          name: product.name,
          mikroCode: product.mikroCode,
          unit: product.unit,
        }));
        setProductOptions(mapped);
      } catch (error) {
        if (isActive) {
          console.error('Product search failed:', error);
          setProductOptions([]);
        }
      } finally {
        if (isActive) {
          setProductSearching(false);
        }
      }
    };

    run();
    return () => {
      isActive = false;
    };
  }, [debouncedProductSearch, linkForm.type]);

  const fetchPreferences = async () => {
    try {
      const { preferences } = await adminApi.getTaskPreferences();
      setView(preferences.defaultView || 'KANBAN');
      const savedRules = normalizeColorRules(preferences.colorRules || null);
      if (savedRules.length > 0) {
        setColorRules(savedRules);
      } else {
        setColorRules([
          createTaskColorRule({ days: 7, color: 'red' }),
          createTaskColorRule({ days: 14, color: 'purple' }),
        ]);
      }
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
      if (statusFilter !== 'ALL') {
        params.status = statusFilter === 'IN_PROGRESS'
          ? 'IN_PROGRESS,WAITING'
          : statusFilter;
      }
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
      await adminApi.updateTaskPreferences({ defaultView: value, colorRules });
    } catch (error) {
      console.error('Task view preference not saved:', error);
    }
  };

  const handleSaveColorRules = async () => {
    setColorRulesSaving(true);
    try {
      await adminApi.updateTaskPreferences({ defaultView: view, colorRules });
      toast.success('Renklendirme kaydedildi');
    } catch (error) {
      toast.error('Renklendirme kaydedilemedi');
    } finally {
      setColorRulesSaving(false);
    }
  };

  const handleOpenCreate = () => {
    setNewTask(DEFAULT_TASK);
    setCustomerSearch('');
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
    setDetailCustomerSearch('');
    setProductSearch('');
    setProductOptions([]);
    try {
      const { task } = await adminApi.getTaskById(taskId);
      setDetailTask(task);
      setDetailForm({
        title: task.title || '',
        description: task.description || '',
        type: task.type,
        priority: task.priority,
        status: normalizeTaskStatus(task.status),
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
    if (!linkForm.label && !linkForm.referenceCode && !linkForm.referenceUrl && !linkForm.referenceId) {
      toast.error('Link bilgisi girin');
      return;
    }
    try {
      const { link } = await adminApi.addTaskLink(detailTask.id, {
        type: linkForm.type,
        label: linkForm.label || undefined,
        referenceId: linkForm.referenceId || undefined,
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
      setLinkForm({ type: 'OTHER', label: '', referenceCode: '', referenceUrl: '', referenceId: '' });
      setProductSearch('');
      setProductOptions([]);
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

  const handleSelectProductLink = (product: ProductOption) => {
    setLinkForm((prev) => ({
      ...prev,
      type: 'PRODUCT',
      label: product.name || prev.label,
      referenceCode: product.mikroCode || prev.referenceCode,
      referenceId: product.id,
    }));
    const label = product.mikroCode ? `${product.mikroCode} - ${product.name}` : product.name;
    setProductSearch(label);
    setProductOptions([]);
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

  const getTaskAgeDays = (task: Task) => {
    const createdAt = new Date(task.createdAt).getTime();
    if (Number.isNaN(createdAt)) return 0;
    const diffMs = Date.now() - createdAt;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  const getTaskColor = (task: Task): TaskColor | null => {
    if (colorRules.length === 0) return null;
    if (task.status === 'DONE' || task.status === 'CANCELLED') return null;
    const ageDays = getTaskAgeDays(task);
    const sortedRules = [...colorRules].filter((rule) => rule.enabled).sort((a, b) => b.days - a.days);
    for (const rule of sortedRules) {
      if (ageDays >= rule.days) {
        return rule.color;
      }
    }
    return null;
  };


  const updateKanbanScrollWidth = () => {
    const container = kanbanRef.current;
    if (!container) return;
    const width = Math.max(container.scrollWidth, container.clientWidth);
    setKanbanScrollWidth(width);
    if (kanbanScrollProxyRef.current) {
      kanbanScrollProxyRef.current.scrollLeft = container.scrollLeft;
    }
  };

  const handleProxyScroll = () => {
    const proxy = kanbanScrollProxyRef.current;
    const container = kanbanRef.current;
    if (!proxy || !container) return;
    if (syncScrollRef.current) return;
    syncScrollRef.current = true;
    container.scrollLeft = proxy.scrollLeft;
    syncScrollRef.current = false;
  };

  const handleKanbanScroll = () => {
    const proxy = kanbanScrollProxyRef.current;
    const container = kanbanRef.current;
    if (!proxy || !container) return;
    if (syncScrollRef.current) return;
    syncScrollRef.current = true;
    proxy.scrollLeft = container.scrollLeft;
    syncScrollRef.current = false;
  };

  useEffect(() => {
    if (view !== 'KANBAN') return;
    const handleResize = () => updateKanbanScrollWidth();
    updateKanbanScrollWidth();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [view, tasks.length, visibleStatuses.length]);

  const scrollKanban = (direction: 'left' | 'right') => {
    const container = kanbanRef.current;
    if (!container) return;
    const amount = direction === 'left' ? -320 : 320;
    container.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return {
    // auth / izinler
    user,
    canManageTemplates,
    // veri
    tasks,
    templates,
    assignees,
    customers,
    isLoading,
    // gorunum / kanban scroll
    view,
    kanbanRef,
    kanbanScrollProxyRef,
    kanbanScrollWidth,
    // renklendirme kurallari
    colorRules,
    setColorRules,
    colorRulesOpen,
    setColorRulesOpen,
    colorRulesSaving,
    // filtreler
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    priorityFilter,
    setPriorityFilter,
    assigneeFilter,
    setAssigneeFilter,
    // musteri arama
    customerSearch,
    setCustomerSearch,
    detailCustomerSearch,
    setDetailCustomerSearch,
    filteredCustomers,
    filteredDetailCustomers,
    // yeni talep modal
    showCreateModal,
    setShowCreateModal,
    showTemplateModal,
    setShowTemplateModal,
    newTask,
    setNewTask,
    creating,
    // detay modal
    detailTask,
    setDetailTask,
    detailLoading,
    detailOpen,
    setDetailOpen,
    detailForm,
    setDetailForm,
    detailSaving,
    // yorum / dosya / link formlari
    commentText,
    setCommentText,
    commentVisibility,
    setCommentVisibility,
    attachmentFile,
    setAttachmentFile,
    attachmentVisibility,
    setAttachmentVisibility,
    linkForm,
    setLinkForm,
    productSearch,
    setProductSearch,
    productOptions,
    productSearching,
    // handler'lar
    handleViewChange,
    handleSaveColorRules,
    handleOpenCreate,
    handleTemplateChange,
    handleCreateTask,
    openTaskDetail,
    handleSaveDetail,
    handleAddComment,
    handleUploadAttachment,
    handleAddLink,
    handleRemoveLink,
    handleSelectProductLink,
    // turetilmis / yardimci
    groupedTasks,
    visibleStatuses,
    getTaskColor,
    handleProxyScroll,
    handleKanbanScroll,
    scrollKanban,
    // alt servis
    fetchTasks,
    fetchTemplates,
  };
}

export default useTalepler;

/**
 * Sablon yonetici alt-bileseni. Eski page.tsx ile BIRE BIR aynidir;
 * Classic ve New gorunumlerin Sablon modali tarafindan kullanilir.
 */
export function TemplateManager({
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
