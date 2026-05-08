'use client';

type ProductNameTooltipProps = {
  name: string;
  className?: string;
};

export function ProductNameTooltip({ name, className = '' }: ProductNameTooltipProps) {
  return (
    <span className={`group/name relative inline-block max-w-full align-top ${className}`} title={name}>
      <span className="line-clamp-2">{name}</span>
      <span className="pointer-events-none absolute left-0 top-full z-40 mt-1 hidden max-w-[18rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold leading-snug text-slate-800 shadow-xl group-hover/name:block group-focus-within/name:block">
        {name}
      </span>
    </span>
  );
}
