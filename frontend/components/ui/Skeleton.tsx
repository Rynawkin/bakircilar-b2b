import { cn } from '@/lib/utils/cn';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'card';
  width?: string | number;
  height?: string | number;
  count?: number;
}

export function Skeleton({
  className,
  variant = 'rectangular',
  width,
  height,
  count = 1,
}: SkeletonProps) {
  const baseStyles = 'bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 bg-[length:200%_100%] animate-shimmer';

  const variantStyles = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
    card: 'rounded-xl h-64',
  };

  const style = {
    width: width || '100%',
    height: height || (variant === 'text' ? '1rem' : '100%'),
  };

  if (count > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn(baseStyles, variantStyles[variant], className)}
            style={style}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(baseStyles, variantStyles[variant], className)}
      style={style}
    />
  );
}

// Özel Skeleton varyantları
export function ProductCardSkeleton() {
  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <Skeleton variant="rectangular" height={192} />
      <Skeleton variant="text" height={24} />
      <Skeleton variant="text" height={16} width="60%" />
      <div className="grid grid-cols-2 gap-2 pt-2">
        <Skeleton variant="rectangular" height={60} />
        <Skeleton variant="rectangular" height={60} />
      </div>
      <Skeleton variant="rectangular" height={40} />
    </div>
  );
}

export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <div className="flex gap-4 p-4 border-b border-gray-200">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} variant="text" height={20} />
      ))}
    </div>
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div className="space-y-2 flex-1">
          <Skeleton variant="text" height={20} width="40%" />
          <Skeleton variant="text" height={16} width="30%" />
        </div>
        <Skeleton variant="rectangular" width={80} height={24} />
      </div>
      <Skeleton variant="text" count={2} />
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="border border-gray-200 rounded-xl p-6 space-y-3">
      <Skeleton variant="text" height={16} width="60%" />
      <Skeleton variant="text" height={32} width="40%" />
      <Skeleton variant="text" height={14} width="50%" />
    </div>
  );
}
