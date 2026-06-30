'use client';

import Link from 'next/link';

export function CustomerFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t border-[var(--line)] bg-white">
      <div className="mx-auto flex w-full max-w-[1900px] flex-col flex-wrap items-center justify-between gap-4 px-4 py-5 text-center sm:flex-row sm:text-left sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center justify-center gap-2.5">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary-600 text-[13px] font-semibold text-white">B</span>
          <span className="min-w-0 break-words text-[12.5px] text-[var(--ink-3)]">© {year} Bakırcılar Toptan Dağıtım · Tüm hakları saklıdır.</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px] text-[var(--ink-2)]">
          <Link href="/my-requests" className="hover:text-primary-700">Yardım / Talep</Link>
          <Link href="/profile" className="hover:text-primary-700">Hesabım</Link>
          <span className="text-[var(--ink-3)]">KVKK</span>
        </div>
      </div>
    </footer>
  );
}

export default CustomerFooter;
