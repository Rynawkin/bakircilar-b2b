import { AlertTriangle, RefreshCw } from 'lucide-react';

interface LoadErrorStateProps {
  title?: string;
  description?: string;
  onRetry: () => void;
  retryLabel?: string;
  compact?: boolean;
}

export function LoadErrorState({
  title = 'Bilgiler yüklenemedi',
  description = 'Bağlantı veya sunucu kaynaklı geçici bir sorun oluştu. Kayıtlarınız silinmedi.',
  onRetry,
  retryLabel = 'Tekrar dene',
  compact = false,
}: LoadErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-5 text-center ${
        compact ? 'py-7' : 'py-12'
      }`}
    >
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm ring-1 ring-amber-200">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <h2 className="text-base font-bold text-amber-950">{title}</h2>
      <p className="mt-1.5 max-w-lg text-sm leading-6 text-amber-900/80">{description}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2"
      >
        <RefreshCw className="h-4 w-4" />
        {retryLabel}
      </button>
    </div>
  );
}
