'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
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
import { ListTodo, Plus, RefreshCcw, Paperclip, MessageSquare, Link2 } from 'lucide-react';
import {
  useTalepler,
  TemplateManager,
  TASK_COLOR_OPTIONS,
  TASK_COLOR_CARD_CLASSES,
  TASK_COLOR_ROW_CLASSES,
  createTaskColorRule,
  LINK_TYPES,
  Task,
  FilterValue,
  TaskType,
  TaskPriority,
  TaskStatus,
  TaskLinkType,
  TaskVisibility,
} from './useTalepler';

/**
 * Klasik (mevcut) Talepler gorunumu.
 * JSX, eski page.tsx ile BIRE BIR aynidir; tum mantik useTalepler hook'undan gelir.
 */
export default function TaleplerClassic() {
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

  const renderTaskCard = (task: Task) => {
    const dueLabel = task.dueDate ? formatDateShort(task.dueDate) : null;
    const isOverdue = task.dueDate ? new Date(task.dueDate) < new Date() && task.status !== 'DONE' : false;
    const taskColor = getTaskColor(task);
    const cardClass = taskColor ? TASK_COLOR_CARD_CLASSES[taskColor] : 'bg-white border-gray-200';

    return (
      <button
        key={task.id}
        onClick={() => openTaskDetail(task.id)}
        className={`w-full text-left rounded-lg border p-3 shadow-sm hover:shadow-md transition-shadow ${cardClass}`}
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
            <div className="lg:col-span-2 flex justify-end gap-2">
              {view === 'KANBAN' && (
                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    className="px-3 py-2 text-sm font-medium bg-white text-gray-700 hover:bg-gray-50"
                    onClick={() => scrollKanban('left')}
                    aria-label="Sola kaydir"
                  >
                    &lt;
                  </button>
                  <button
                    className="px-3 py-2 text-sm font-medium bg-white text-gray-700 hover:bg-gray-50"
                    onClick={() => scrollKanban('right')}
                    aria-label="Saga kaydir"
                  >
                    &gt;
                  </button>
                </div>
              )}
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
          <>
            <div className="sticky top-3 z-20 mb-3 rounded-xl border border-gray-200 bg-white/90 backdrop-blur px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-gray-500">Yatay kaydirma</div>
              <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  className="px-3 py-1 text-sm font-medium bg-white text-gray-700 hover:bg-gray-50"
                  onClick={() => scrollKanban('left')}
                  aria-label="Sola kaydir"
                >
                  &lt;
                </button>
                <button
                  className="px-3 py-1 text-sm font-medium bg-white text-gray-700 hover:bg-gray-50"
                  onClick={() => scrollKanban('right')}
                  aria-label="Saga kaydir"
                >
                  &gt;
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

          <div ref={kanbanRef} onScroll={handleKanbanScroll} className="flex gap-3 overflow-x-auto pb-4">
            {visibleStatuses.map((status) => (
              <div key={status} className="min-w-[220px] max-w-[240px] flex-1">
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
                <div className="space-y-2">
                  {(groupedTasks.get(status) || []).map(renderTaskCard)}
                  {(groupedTasks.get(status) || []).length === 0 && (
                    <div className="text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-2 text-center">
                      Bu kolonda talep yok.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          </>
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
                {tasks.map((task) => {
                  const rowColor = getTaskColor(task);
                  const normalizedStatus = normalizeTaskStatus(task.status);
                  return (
                    <tr
                      key={task.id}
                      className={`border-b last:border-b-0 hover:bg-gray-50 cursor-pointer ${rowColor ? TASK_COLOR_ROW_CLASSES[rowColor] : ''}`}
                      onClick={() => openTaskDetail(task.id)}
                    >
                      <td className="py-3 pr-4 font-medium text-gray-900">{task.title}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={TASK_STATUS_BADGE[normalizedStatus] as any}>
                          {TASK_STATUS_LABELS[normalizedStatus]}
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
                  );
                })}
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
                <div className="text-sm font-semibold text-gray-800">Renklendirme</div>
                <div className="text-xs text-gray-500">Acik talepler icin yas kurallari.</div>
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
                    <label className="flex items-center gap-2 text-sm text-gray-600">
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
                  <div className="text-xs text-gray-500">Kural yok.</div>
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
                        <div className="text-xs text-gray-500">Araniyor...</div>
                      )}
                      {!productSearching && productSearch && productOptions.length === 0 && (
                        <div className="text-xs text-gray-500">Sonuc bulunamadi.</div>
                      )}
                      {productOptions.length > 0 && (
                        <div className="border border-gray-200 rounded-lg max-h-40 overflow-auto text-sm">
                          {productOptions.map((product) => (
                            <button
                              key={product.id}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50"
                              onClick={() => handleSelectProductLink(product)}
                              type="button"
                            >
                              <div className="font-medium text-gray-900">{product.name}</div>
                              <div className="text-xs text-gray-500">
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
              </Card>

              <Card className="space-y-3">
                <div className="text-sm font-semibold text-gray-800">Durum Gecmisi</div>
                <div className="space-y-2 text-xs text-gray-600">
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
