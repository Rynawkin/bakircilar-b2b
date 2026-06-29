'use client';

import {
  ListTodo,
  Plus,
  RefreshCcw,
  Paperclip,
  MessageSquare,
  Link2,
  Search,
  ChevronLeft,
  ChevronRight,
  User,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { formatDate, formatDateShort } from '@/lib/utils/format';
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TASK_TYPE_LABELS,
  normalizeTaskStatus,
} from '@/lib/utils/tasks';
import {
  useTalepler,
  TemplateManager,
  TASK_COLOR_OPTIONS,
  createTaskColorRule,
  LINK_TYPES,
  Task,
  TaskColor,
  FilterValue,
  TaskType,
  TaskPriority,
  TaskStatus,
  TaskLinkType,
  TaskVisibility,
} from './useTalepler';

/**
 * Yeni gorunum Talepler ekrani. Mevcut TUM mantik useTalepler'dan gelir; sadece gorsel yeni.
 * Hicbir handler/izin/kosul/modal/kolon/sekme/rozet/durum/yas-renklendirme dusurulmemistir;
 * brief 4.10.1'deki her oge mevcut.
 */

const CARD = 'bg-white border border-[#e7ebf2] rounded-xl';
const INK = '#14223b';
const INK_SOFT = '#51607a';
const INK_FAINT = '#8b97ac';
const PRIMARY = '#15356b';

// Yas renklendirme -> yeni palet arka plan + kenarlik (kart/satir icin)
const AGE_BG: Record<TaskColor, { bg: string; border: string }> = {
  red: { bg: '#fef2f2', border: '#fecaca' },
  purple: { bg: '#f5f3ff', border: '#ddd6fe' },
  amber: { bg: '#fffbeb', border: '#fde68a' },
  blue: { bg: '#eff6ff', border: '#bfdbfe' },
  slate: { bg: '#f8fafc', border: '#e2e8f0' },
  green: { bg: '#ecfdf5', border: '#a7f3d0' },
};

// Durum rozeti (yeni stil) — durum bazli renk
const STATUS_STYLE: Record<TaskStatus, { bg: string; border: string; color: string }> = {
  NEW: { bg: '#eff6ff', border: '#bfdbfe', color: '#1c4585' },
  TRIAGE: { bg: '#fffbeb', border: '#fde68a', color: '#b45309' },
  IN_PROGRESS: { bg: '#eef2fa', border: '#d6e0f1', color: '#1c4585' },
  WAITING: { bg: '#eef2fa', border: '#d6e0f1', color: '#1c4585' },
  REVIEW: { bg: '#fffbeb', border: '#fde68a', color: '#b45309' },
  DONE: { bg: '#ecfdf5', border: '#a7f3d0', color: '#047857' },
  CANCELLED: { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
};

// Oncelik rozeti (yeni stil)
const PRIORITY_STYLE: Record<TaskPriority, { bg: string; border: string; color: string }> = {
  NONE: { bg: '#f4f6fa', border: '#e3e8f0', color: '#51607a' },
  LOW: { bg: '#eff6ff', border: '#bfdbfe', color: '#1c4585' },
  MEDIUM: { bg: '#fffbeb', border: '#fde68a', color: '#b45309' },
  HIGH: { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
  URGENT: { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
};

export default function TaleplerNew() {
  const {
    canManageTemplates,
    tasks,
    templates,
    assignees,
    isLoading,
    view,
    kanbanRef,
    kanbanScrollProxyRef,
    kanbanScrollWidth,
    colorRules,
    setColorRules,
    colorRulesOpen,
    setColorRulesOpen,
    colorRulesSaving,
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
    customerSearch,
    setCustomerSearch,
    detailCustomerSearch,
    setDetailCustomerSearch,
    filteredCustomers,
    filteredDetailCustomers,
    showCreateModal,
    setShowCreateModal,
    showTemplateModal,
    setShowTemplateModal,
    newTask,
    setNewTask,
    creating,
    detailTask,
    setDetailTask,
    detailLoading,
    detailOpen,
    setDetailOpen,
    detailForm,
    setDetailForm,
    detailSaving,
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
    groupedTasks,
    visibleStatuses,
    getTaskColor,
    handleProxyScroll,
    handleKanbanScroll,
    scrollKanban,
    fetchTasks,
    fetchTemplates,
  } = useTalepler();

  // Yeni stil rozet yardimcilari
  const renderPriorityBadge = (priority: TaskPriority) => {
    const s = PRIORITY_STYLE[priority];
    return (
      <span
        className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md"
        style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
      >
        {TASK_PRIORITY_LABELS[priority]}
      </span>
    );
  };

  const renderStatusBadge = (status: TaskStatus) => {
    const norm = normalizeTaskStatus(status);
    const s = STATUS_STYLE[norm];
    return (
      <span
        className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full"
        style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
      >
        {TASK_STATUS_LABELS[norm]}
      </span>
    );
  };

  // Yeni tasarim talep karti (Kanban) — mevcut renderTaskCard mantigi birebir
  const renderTaskCard = (task: Task) => {
    const dueLabel = task.dueDate ? formatDateShort(task.dueDate) : null;
    const isOverdue = task.dueDate ? new Date(task.dueDate) < new Date() && task.status !== 'DONE' : false;
    const taskColor = getTaskColor(task);
    const age = taskColor ? AGE_BG[taskColor] : null;

    return (
      <button
        key={task.id}
        type="button"
        onClick={() => openTaskDetail(task.id)}
        className="w-full text-left rounded-[10px] p-[11px] transition-colors"
        style={{
          background: age ? age.bg : '#fff',
          border: `1px solid ${age ? age.border : '#e7ebf2'}`,
        }}
      >
        <div className="text-[12.5px] font-semibold leading-[1.35] mb-2" style={{ color: INK }}>
          {task.title}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {renderPriorityBadge(task.priority)}
          <span
            className="text-[10px] font-semibold px-[7px] py-0.5 rounded-md"
            style={{ background: '#f4f6fa', border: '1px solid #e3e8f0', color: INK_SOFT }}
          >
            {TASK_TYPE_LABELS[task.type]}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10.5px]" style={{ color: INK_FAINT }}>
          <span>{task.customer ? (task.customer.displayName || task.customer.mikroName || task.customer.name) : '-'}</span>
          {dueLabel && (
            <span style={isOverdue ? { color: '#b91c1c', fontWeight: 600 } : undefined}>{dueLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-[7px] text-[10.5px] mt-[5px]" style={{ color: INK_SOFT }}>
          <User width={12} height={12} stroke={INK_FAINT} strokeWidth={2} />
          {task.assignedTo?.name || '-'}
          <span className="ml-auto inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <MessageSquare width={11} height={11} stroke="#9aa6b8" strokeWidth={2} />
              {task._count?.comments ?? 0}
            </span>
            <span className="inline-flex items-center gap-1">
              <Paperclip width={11} height={11} stroke="#9aa6b8" strokeWidth={2} />
              {task._count?.attachments ?? 0}
            </span>
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: '#f4f6fa' }}>
      <div className="container-custom py-6 space-y-4">
        {/* Baslik + ust aksiyonlar */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] flex items-center gap-2 m-0" style={{ color: INK }}>
              <ListTodo width={22} height={22} stroke={PRIMARY} strokeWidth={2} />
              Talepler
            </h1>
            <div className="text-[13px] mt-[5px]" style={{ color: INK_FAINT }}>
              Dahili gorev panosu · Kanban / liste gorunumu
            </div>
          </div>
          <div className="flex gap-[9px] flex-wrap">
            {canManageTemplates && (
              <button
                type="button"
                onClick={() => setShowTemplateModal(true)}
                className="bg-white rounded-[9px] px-[15px] py-[10px] text-[13px] font-medium cursor-pointer hover:bg-[#f4f6fa]"
                style={{ border: '1px solid #d8e0ec', color: INK_SOFT }}
              >
                Sablonlar
              </button>
            )}
            <button
              type="button"
              onClick={fetchTasks}
              className="inline-flex items-center gap-1.5 bg-white rounded-[9px] px-[13px] py-[10px] text-[13px] font-medium cursor-pointer hover:bg-[#f4f6fa]"
              style={{ border: '1px solid #d8e0ec', color: INK_SOFT }}
            >
              <RefreshCcw width={14} height={14} stroke="currentColor" strokeWidth={2} />
              Yenile
            </button>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-[7px] rounded-[9px] px-4 py-[10px] text-[13px] font-semibold text-white cursor-pointer hover:bg-[#1c4585]"
              style={{ background: PRIMARY, border: 'none' }}
            >
              <Plus width={15} height={15} stroke="currentColor" strokeWidth={2.2} />
              Yeni Talep
            </button>
          </div>
        </div>

        {/* Filtre + gorunum cubugu */}
        <div className={`${CARD} flex items-center gap-[9px] flex-wrap p-[11px_14px]`} style={{ padding: '11px 14px' }}>
          <div className="flex items-center gap-2 h-9 rounded-[8px] px-[11px] min-w-[180px]" style={{ border: '1px solid #e3e8f0' }}>
            <Search width={14} height={14} stroke="#9aa6b8" strokeWidth={2} />
            <input
              placeholder="Ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 border-none bg-transparent outline-none text-[12px]"
              style={{ color: INK }}
            />
          </div>

          <label className="flex items-center gap-1.5 h-9 rounded-[8px] px-[10px] text-[12px]" style={{ border: '1px solid #e3e8f0', color: INK_SOFT }}>
            <span style={{ color: INK_FAINT }}>Durum</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as FilterValue)}
              className="border-none bg-transparent outline-none text-[12px] font-medium cursor-pointer"
              style={{ color: INK }}
            >
              <option value="ALL">Tumu</option>
              {TASK_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {TASK_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 h-9 rounded-[8px] px-[10px] text-[12px]" style={{ border: '1px solid #e3e8f0', color: INK_SOFT }}>
            <span style={{ color: INK_FAINT }}>Tur</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'ALL' | TaskType)}
              className="border-none bg-transparent outline-none text-[12px] font-medium cursor-pointer"
              style={{ color: INK }}
            >
              <option value="ALL">Tumu</option>
              {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((type) => (
                <option key={type} value={type}>
                  {TASK_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 h-9 rounded-[8px] px-[10px] text-[12px]" style={{ border: '1px solid #e3e8f0', color: INK_SOFT }}>
            <span style={{ color: INK_FAINT }}>Oncelik</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as 'ALL' | TaskPriority)}
              className="border-none bg-transparent outline-none text-[12px] font-medium cursor-pointer"
              style={{ color: INK }}
            >
              <option value="ALL">Tumu</option>
              {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((priority) => (
                <option key={priority} value={priority}>
                  {TASK_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 h-9 rounded-[8px] px-[10px] text-[12px]" style={{ border: '1px solid #e3e8f0', color: INK_SOFT }}>
            <span style={{ color: INK_FAINT }}>Atanan</span>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="border-none bg-transparent outline-none text-[12px] font-medium cursor-pointer"
              style={{ color: INK }}
            >
              <option value="ALL">Tumu</option>
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex items-center gap-2">
            {view === 'KANBAN' && (
              <div className="inline-flex rounded-[8px] overflow-hidden" style={{ border: '1px solid #e3e8f0' }}>
                <button
                  type="button"
                  className="px-2.5 py-1.5 bg-white hover:bg-[#f4f6fa]"
                  style={{ color: INK_SOFT }}
                  onClick={() => scrollKanban('left')}
                  aria-label="Sola kaydir"
                >
                  <ChevronLeft width={15} height={15} stroke="currentColor" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="px-2.5 py-1.5 bg-white hover:bg-[#f4f6fa]"
                  style={{ color: INK_SOFT }}
                  onClick={() => scrollKanban('right')}
                  aria-label="Saga kaydir"
                >
                  <ChevronRight width={15} height={15} stroke="currentColor" strokeWidth={2} />
                </button>
              </div>
            )}
            <div className="inline-flex bg-[#f1f4f9] rounded-[8px] p-[3px]">
              <button
                type="button"
                onClick={() => handleViewChange('KANBAN')}
                className="text-[12px] font-semibold rounded-[6px] px-3 py-1.5 cursor-pointer"
                style={
                  view === 'KANBAN'
                    ? { background: '#fff', color: PRIMARY, boxShadow: '0 1px 2px rgba(20,34,59,.08)' }
                    : { background: 'transparent', color: INK_SOFT, border: 'none' }
                }
              >
                Kanban
              </button>
              <button
                type="button"
                onClick={() => handleViewChange('LIST')}
                className="text-[12px] font-semibold rounded-[6px] px-3 py-1.5 cursor-pointer"
                style={
                  view === 'LIST'
                    ? { background: '#fff', color: PRIMARY, boxShadow: '0 1px 2px rgba(20,34,59,.08)' }
                    : { background: 'transparent', color: INK_SOFT, border: 'none' }
                }
              >
                Liste
              </button>
            </div>
          </div>
        </div>

        {/* Icerik */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: PRIMARY }}></div>
          </div>
        ) : view === 'KANBAN' ? (
          <>
            {/* Yatay kaydirma proxy (mevcut mantik) */}
            <div className="sticky top-3 z-20 rounded-xl px-3 py-2" style={{ border: '1px solid #e7ebf2', background: 'rgba(255,255,255,.9)', backdropFilter: 'blur(4px)' }}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px]" style={{ color: INK_FAINT }}>Yatay kaydirma</div>
                <div className="inline-flex rounded-[8px] overflow-hidden" style={{ border: '1px solid #e3e8f0' }}>
                  <button
                    type="button"
                    className="px-2.5 py-1 bg-white hover:bg-[#f4f6fa]"
                    style={{ color: INK_SOFT }}
                    onClick={() => scrollKanban('left')}
                    aria-label="Sola kaydir"
                  >
                    <ChevronLeft width={14} height={14} stroke="currentColor" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="px-2.5 py-1 bg-white hover:bg-[#f4f6fa]"
                    style={{ color: INK_SOFT }}
                    onClick={() => scrollKanban('right')}
                    aria-label="Saga kaydir"
                  >
                    <ChevronRight width={14} height={14} stroke="currentColor" strokeWidth={2} />
                  </button>
                </div>
              </div>
              <div
                ref={kanbanScrollProxyRef}
                onScroll={handleProxyScroll}
                className="mt-2 h-3 overflow-x-auto"
              >
                <div style={{ width: kanbanScrollWidth }} />
              </div>
            </div>

            {/* Kanban kolonlari */}
            <div ref={kanbanRef} onScroll={handleKanbanScroll} className="flex gap-[14px] overflow-x-auto pb-4 items-start">
              {visibleStatuses.map((status) => (
                <div
                  key={status}
                  className="min-w-[240px] max-w-[280px] flex-1 rounded-xl p-3"
                  style={{ background: '#f4f6fa', border: '1px solid #e7ebf2' }}
                >
                  <div className="flex items-center justify-between mb-[11px]">
                    {renderStatusBadge(status)}
                    <span
                      className="text-[11px] font-semibold px-2 py-px rounded-full"
                      style={{ background: '#fff', border: '1px solid #e7ebf2', color: '#64748b' }}
                    >
                      {groupedTasks.get(status)?.length || 0}
                    </span>
                  </div>
                  <div className="flex flex-col gap-[9px]">
                    {(groupedTasks.get(status) || []).map(renderTaskCard)}
                    {(groupedTasks.get(status) || []).length === 0 && (
                      <div
                        className="text-[11px] rounded-[10px] p-2 text-center"
                        style={{ color: '#9aa6b8', background: '#fff', border: '1px dashed #e3e8f0' }}
                      >
                        Bu kolonda talep yok.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className={`${CARD} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafbfd', borderBottom: '1px solid #eef1f6' }}>
                    <th className="text-left font-semibold uppercase tracking-[0.04em] text-[10px] px-4 py-[11px]" style={{ color: INK_FAINT }}>Baslik</th>
                    <th className="text-left font-semibold uppercase tracking-[0.04em] text-[10px] px-4 py-[11px]" style={{ color: INK_FAINT }}>Durum</th>
                    <th className="text-left font-semibold uppercase tracking-[0.04em] text-[10px] px-4 py-[11px]" style={{ color: INK_FAINT }}>Tur</th>
                    <th className="text-center font-semibold uppercase tracking-[0.04em] text-[10px] px-4 py-[11px]" style={{ color: INK_FAINT }}>Oncelik</th>
                    <th className="text-left font-semibold uppercase tracking-[0.04em] text-[10px] px-4 py-[11px]" style={{ color: INK_FAINT }}>Atanan</th>
                    <th className="text-left font-semibold uppercase tracking-[0.04em] text-[10px] px-4 py-[11px]" style={{ color: INK_FAINT }}>Musteri</th>
                    <th className="text-left font-semibold uppercase tracking-[0.04em] text-[10px] px-4 py-[11px]" style={{ color: INK_FAINT }}>Son Tarih</th>
                    <th className="text-left font-semibold uppercase tracking-[0.04em] text-[10px] px-4 py-[11px]" style={{ color: INK_FAINT }}>Son Aktivite</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const rowColor = getTaskColor(task);
                    const age = rowColor ? AGE_BG[rowColor] : null;
                    return (
                      <tr
                        key={task.id}
                        onClick={() => openTaskDetail(task.id)}
                        className="cursor-pointer hover:bg-[#fafbfd]"
                        style={{ borderTop: '1px solid #f1f4f9', background: age ? age.bg : undefined }}
                      >
                        <td className="px-4 py-3 font-medium" style={{ color: INK }}>{task.title}</td>
                        <td className="px-4 py-3">{renderStatusBadge(task.status)}</td>
                        <td className="px-4 py-3" style={{ color: INK_SOFT }}>{TASK_TYPE_LABELS[task.type]}</td>
                        <td className="px-4 py-3 text-center">{renderPriorityBadge(task.priority)}</td>
                        <td className="px-4 py-3" style={{ color: INK_SOFT }}>{task.assignedTo?.name || '-'}</td>
                        <td className="px-4 py-3" style={{ color: INK_SOFT }}>
                          {task.customer?.displayName || task.customer?.mikroName || task.customer?.name || '-'}
                        </td>
                        <td className="px-4 py-3" style={{ color: INK_SOFT }}>{task.dueDate ? formatDateShort(task.dueDate) : '-'}</td>
                        <td className="px-4 py-3" style={{ color: INK_SOFT }}>{formatDateShort(task.lastActivityAt)}</td>
                      </tr>
                    );
                  })}
                  {tasks.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center" style={{ color: INK_FAINT }}>
                        Talep bulunamadi.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* === Yeni Talep modali (tum alanlar korundu) === */}
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
              <Input
                placeholder="Musteri ara..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-2"
                value={newTask.customerId}
                onChange={(e) => setNewTask((prev) => ({ ...prev, customerId: e.target.value }))}
              >
                <option value="">Secilmedi</option>
                {filteredCustomers.map((customer) => (
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

      {/* === Sablon Yonetici modali === */}
      <Modal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        title="Sablon Gorevler"
        size="lg"
      >
        <TemplateManager templates={templates} onRefresh={fetchTemplates} />
      </Modal>

      {/* === Talep Detay modali (full) — tum bolumler korundu === */}
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: PRIMARY }}></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              {/* Duzenleme + renklendirme kurallari */}
              <div className={`${CARD} p-4 space-y-4`}>
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
                    <Input
                      placeholder="Musteri ara..."
                      value={detailCustomerSearch}
                      onChange={(e) => setDetailCustomerSearch(e.target.value)}
                    />
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg mt-2"
                      value={detailForm.customerId}
                      onChange={(e) => setDetailForm((prev) => ({ ...prev, customerId: e.target.value }))}
                    >
                      <option value="">Secilmedi</option>
                      {filteredDetailCustomers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.mikroCariCode ? `${customer.mikroCariCode} - ` : ''}{customer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: INK }}>Renklendirme</div>
                      <div className="text-xs" style={{ color: INK_FAINT }}>Acik talepler icin yas kurallari.</div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setColorRulesOpen((prev) => !prev)}
                    >
                      {colorRulesOpen ? 'Gizle' : 'Kurallari Duzenle'}
                    </Button>
                  </div>
                  {colorRulesOpen && (
                    <div className="space-y-3">
                      {colorRules.map((rule, index) => (
                        <div key={rule.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                          <label className="flex items-center gap-2 text-sm" style={{ color: INK_SOFT }}>
                            <input
                              type="checkbox"
                              checked={rule.enabled}
                              onChange={(e) => {
                                const enabled = e.target.checked;
                                setColorRules((prev) =>
                                  prev.map((item) => item.id === rule.id ? { ...item, enabled } : item)
                                );
                              }}
                            />
                            Etkin
                          </label>
                          <div className="md:col-span-2">
                            <Input
                              label={`Gun (kural ${index + 1})`}
                              type="number"
                              min="1"
                              value={rule.days}
                              onChange={(e) => {
                                const days = Math.max(1, Number(e.target.value));
                                setColorRules((prev) =>
                                  prev.map((item) => item.id === rule.id ? { ...item, days } : item)
                                );
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Renk</label>
                            <select
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              value={rule.color}
                              onChange={(e) => {
                                const color = e.target.value as typeof rule.color;
                                setColorRules((prev) =>
                                  prev.map((item) => item.id === rule.id ? { ...item, color } : item)
                                );
                              }}
                            >
                              {TASK_COLOR_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setColorRules((prev) => prev.filter((item) => item.id !== rule.id));
                              }}
                            >
                              Sil
                            </Button>
                          </div>
                        </div>
                      ))}
                      {colorRules.length === 0 && (
                        <div className="text-xs" style={{ color: INK_FAINT }}>Kural yok.</div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setColorRules((prev) => [...prev, createTaskColorRule()])}
                        >
                          Kural Ekle
                        </Button>
                        <Button size="sm" onClick={handleSaveColorRules} isLoading={colorRulesSaving}>
                          Kaydet
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Yorumlar */}
              <div className={`${CARD} p-4 space-y-4`}>
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: INK }}>
                  <MessageSquare width={16} height={16} stroke="currentColor" strokeWidth={2} />
                  Yorumlar
                </div>
                <div className="space-y-3">
                  {detailTask.comments.map((comment) => (
                    <div key={comment.id} className="rounded-lg p-3" style={{ background: '#f8fafc', border: '1px solid #e7ebf2' }}>
                      <div className="flex items-center justify-between text-xs" style={{ color: INK_FAINT }}>
                        <span>{comment.author?.name || 'Kullanici'}</span>
                        <span>{formatDate(comment.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: INK }}>{comment.body}</p>
                      {comment.visibility === 'INTERNAL' && (
                        <span
                          className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md mt-2"
                          style={{ background: '#eef2fa', border: '1px solid #d6e0f1', color: '#1c4585' }}
                        >
                          Internal
                        </span>
                      )}
                    </div>
                  ))}
                  {detailTask.comments.length === 0 && (
                    <div className="text-sm" style={{ color: INK_FAINT }}>Yorum yok.</div>
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
              </div>

              {/* Dosyalar */}
              <div className={`${CARD} p-4 space-y-4`}>
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: INK }}>
                  <Paperclip width={16} height={16} stroke="currentColor" strokeWidth={2} />
                  Dosyalar
                </div>
                <div className="space-y-2">
                  {(detailTask.attachments || []).map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.url}
                      target="_blank"
                      className="block text-sm hover:underline"
                      style={{ color: PRIMARY }}
                      rel="noreferrer"
                    >
                      {attachment.originalName} ({Math.round(attachment.size / 1024)} KB)
                    </a>
                  ))}
                  {detailTask.attachments.length === 0 && (
                    <div className="text-sm" style={{ color: INK_FAINT }}>Dosya yok.</div>
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
              </div>
            </div>

            <div className="space-y-6">
              {/* Bilgiler */}
              <div className={`${CARD} p-4 space-y-3`}>
                <div className="text-sm font-semibold" style={{ color: INK }}>Bilgiler</div>
                <div className="text-xs space-y-1" style={{ color: INK_FAINT }}>
                  <div>Olusturan: {detailTask.createdBy?.name || '-'}</div>
                  <div>Atanan: {detailTask.assignedTo?.name || '-'}</div>
                  <div>Olusturma: {formatDate(detailTask.createdAt)}</div>
                  <div>Son Aktivite: {formatDate(detailTask.lastActivityAt)}</div>
                </div>
              </div>

              {/* Iliskiler */}
              <div className={`${CARD} p-4 space-y-3`}>
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: INK }}>
                  <Link2 width={16} height={16} stroke="currentColor" strokeWidth={2} />
                  Iliskiler
                </div>
                <div className="space-y-2">
                  {(detailTask.links || []).map((link) => (
                    <div key={link.id} className="flex items-center justify-between text-xs" style={{ color: INK_SOFT }}>
                      <span>
                        {link.type}: {link.label || link.referenceCode || link.referenceUrl || '-'}
                      </span>
                      <button
                        type="button"
                        className="inline-flex items-center"
                        style={{ color: '#ef4444' }}
                        onClick={() => handleRemoveLink(link.id)}
                        aria-label="Sil"
                      >
                        <X width={14} height={14} stroke="currentColor" strokeWidth={2.2} />
                      </button>
                    </div>
                  ))}
                  {(detailTask.links || []).length === 0 && (
                    <div className="text-xs" style={{ color: INK_FAINT }}>Baglanti yok.</div>
                  )}
                </div>
                <div className="space-y-2">
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    value={linkForm.type}
                    onChange={(e) => {
                      const nextType = e.target.value as TaskLinkType;
                      setLinkForm((prev) => ({
                        ...prev,
                        type: nextType,
                        referenceId: nextType === 'PRODUCT' ? prev.referenceId : '',
                      }));
                    }}
                  >
                    {LINK_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  {linkForm.type === 'PRODUCT' && (
                    <div className="space-y-2">
                      <Input
                        placeholder="Stok ara (kod veya isim)"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                      {productSearching && (
                        <div className="text-xs" style={{ color: INK_FAINT }}>Araniyor...</div>
                      )}
                      {!productSearching && productSearch && productOptions.length === 0 && (
                        <div className="text-xs" style={{ color: INK_FAINT }}>Sonuc bulunamadi.</div>
                      )}
                      {productOptions.length > 0 && (
                        <div className="rounded-lg max-h-40 overflow-auto text-sm" style={{ border: '1px solid #e7ebf2' }}>
                          {productOptions.map((product) => (
                            <button
                              key={product.id}
                              className="w-full text-left px-3 py-2 hover:bg-[#f8fafc]"
                              onClick={() => handleSelectProductLink(product)}
                              type="button"
                            >
                              <div className="font-medium" style={{ color: INK }}>{product.name}</div>
                              <div className="text-xs" style={{ color: INK_FAINT }}>
                                {product.mikroCode || '-'} {product.unit ? `• ${product.unit}` : ''}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
              </div>

              {/* Durum Gecmisi */}
              <div className={`${CARD} p-4 space-y-3`}>
                <div className="text-sm font-semibold" style={{ color: INK }}>Durum Gecmisi</div>
                <div className="space-y-2 text-xs" style={{ color: INK_SOFT }}>
                  {detailTask.statusHistory.map((history) => (
                    <div key={history.id} className="flex items-center justify-between">
                      <span>
                        {history.fromStatus
                          ? TASK_STATUS_LABELS[normalizeTaskStatus(history.fromStatus as TaskStatus)]
                          : 'Baslangic'}
                        {' -> '}
                        {TASK_STATUS_LABELS[normalizeTaskStatus(history.toStatus as TaskStatus)]}
                      </span>
                      <span>{formatDateShort(history.createdAt)}</span>
                    </div>
                  ))}
                  {detailTask.statusHistory.length === 0 && (
                    <div className="text-xs" style={{ color: INK_FAINT }}>Durum kaydi yok.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
