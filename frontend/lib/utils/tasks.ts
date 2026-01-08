import { TaskPriority, TaskStatus, TaskType } from '@/types';

export const TASK_STATUS_ORDER: TaskStatus[] = [
  'NEW',
  'TRIAGE',
  'IN_PROGRESS',
  'WAITING',
  'REVIEW',
  'DONE',
  'CANCELLED',
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  NEW: 'Yeni',
  TRIAGE: 'Triage',
  IN_PROGRESS: 'Devam',
  WAITING: 'Beklemede',
  REVIEW: 'Inceleme',
  DONE: 'Tamam',
  CANCELLED: 'Iptal',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  NONE: 'Oncelik Yok',
  LOW: 'Dusuk',
  MEDIUM: 'Orta',
  HIGH: 'Yuksek',
  URGENT: 'Acil',
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  BUG: 'Hata',
  IMPROVEMENT: 'Iyilestirme',
  FEATURE: 'Yeni Ozellik',
  OPERATION: 'Operasyon',
  PROCUREMENT: 'Satinalma',
  REPORT: 'Rapor',
  DATA_SYNC: 'Senkron',
  ACCESS: 'Yetki',
  DESIGN_UX: 'Tasarim',
  OTHER: 'Diger',
};

export const TASK_PRIORITY_BADGE: Record<TaskPriority, string> = {
  NONE: 'default',
  LOW: 'info',
  MEDIUM: 'warning',
  HIGH: 'danger',
  URGENT: 'destructive',
};

export const TASK_STATUS_BADGE: Record<TaskStatus, string> = {
  NEW: 'info',
  TRIAGE: 'warning',
  IN_PROGRESS: 'info',
  WAITING: 'default',
  REVIEW: 'warning',
  DONE: 'success',
  CANCELLED: 'danger',
};
