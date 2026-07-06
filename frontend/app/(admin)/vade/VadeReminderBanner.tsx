'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X, Check, ArrowRight } from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { useAuthStore } from '@/lib/store/authStore';
import { formatDateShort } from '@/lib/utils/format';
import { VadeNote } from '@/types';

/** Vade modulune girince kullanicinin bugun/gecmis vadesi gelen hatirlaticilari — kapatilabilir banner. */
export default function VadeReminderBanner() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const [reminders, setReminders] = useState<VadeNote[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    adminApi
      .getVadeNotes({ authorId: userId, reminderOnly: true, reminderCompleted: false, reminderTo: end.toISOString() })
      .then((res) => {
        if (mounted) setReminders(res.notes || []);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [userId]);

  const complete = async (id: string) => {
    try {
      await adminApi.updateVadeNote(id, { reminderCompleted: true });
      setReminders((prev) => prev.filter((n) => n.id !== id));
    } catch {
      /* yoksay */
    }
  };

  if (dismissed || reminders.length === 0) return null;
  const shown = expanded ? reminders : reminders.slice(0, 4);

  return (
    <div className="mb-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#b45309]">
          <Bell width={16} height={16} stroke="currentColor" strokeWidth={2} />
          Bugun {reminders.length} hatirlatman var
        </div>
        <button type="button" onClick={() => setDismissed(true)} className="rounded p-1 text-[#b45309] hover:bg-[#fef3c7]">
          <X size={16} />
        </button>
      </div>
      <div className="mt-2.5 flex flex-col gap-2">
        {shown.map((n) => {
          const cust = n.customer;
          const label = cust?.displayName || cust?.mikroName || cust?.name || 'Musteri';
          return (
            <div key={n.id} className="flex items-center gap-2 rounded-lg bg-white/70 px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-[#14223b]">{label}</div>
                <div className="truncate text-[11px] text-[#8b97ac]">
                  {n.reminderNote || n.noteContent}
                  {n.reminderDate ? ` · ${formatDateShort(n.reminderDate)}` : ''}
                </div>
              </div>
              {cust?.id && (
                <button
                  type="button"
                  onClick={() => router.push(`/vade/customers/${cust.id}`)}
                  className="flex-none rounded-lg border border-[#d8e0ec] bg-white px-2 py-1 text-[11px] font-medium text-[#51607a] hover:bg-[#f4f6fa]"
                >
                  <ArrowRight width={13} height={13} stroke="currentColor" strokeWidth={2} />
                </button>
              )}
              <button
                type="button"
                onClick={() => complete(n.id)}
                className="flex-none inline-flex items-center gap-1 rounded-lg border border-[#a7f3d0] bg-[#ecfdf5] px-2 py-1 text-[11px] font-semibold text-[#047857] hover:bg-[#d1fae5]"
              >
                <Check size={12} /> Tamamla
              </button>
            </div>
          );
        })}
      </div>
      {reminders.length > 4 && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 text-[11.5px] font-medium text-[#b45309] hover:underline">
          {expanded ? 'Daha az goster' : `Tumunu goster (${reminders.length})`}
        </button>
      )}
    </div>
  );
}
