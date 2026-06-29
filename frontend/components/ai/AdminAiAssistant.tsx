'use client';

/**
 * AdminAiAssistant — her admin ekraninda gorunen yuzen AI asistani.
 * Dogal dil soru-cevap (stok/fiyat/maliyet/marj/cari/siparis/vade). Salt-okuma; rol/sektor farkinda.
 * Yetki: admin:ai-assistant. Yetki yoksa hic render edilmez.
 */

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, X, Loader2, Bot, User as UserIcon } from 'lucide-react';
import adminApi from '@/lib/api/admin';
import { usePermissions } from '@/hooks/usePermissions';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

const STARTERS = [
  'En cok satan 10 urun (son 3 ay)',
  'Vadesi gecmis en riskli 10 cari',
  'Fazla stoklu, maliyeti yuksek urunler',
  'Maliyeti artmis ama fiyati eski olan urunler',
];

export function AdminAiAssistant() {
  const { hasPermission, loading: permLoading } = usePermissions();
  const allowed = hasPermission('admin:ai-assistant');

  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [model, setModel] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || enabled !== null) return;
    adminApi
      .aiStatus()
      .then((s) => setEnabled(!!s.enabled))
      .catch(() => setEnabled(false));
    adminApi
      .aiModels()
      .then((m) => {
        setModels(m.models || []);
        const saved = typeof window !== 'undefined' ? localStorage.getItem('ai-chat-model') : null;
        const valid = saved && (m.models || []).some((x) => x.id === saved);
        setModel(valid ? (saved as string) : m.defaultChat);
      })
      .catch(() => {});
  }, [open, enabled]);

  const onModelChange = (id: string) => {
    setModel(id);
    if (typeof window !== 'undefined') localStorage.setItem('ai-chat-model', id);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  if (permLoading || !allowed) return null;

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    const next: ChatMsg[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const res = await adminApi.aiChat(next, model || undefined);
      setMessages([...next, { role: 'assistant', content: res.reply || 'Cevap uretilemedi.' }]);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        'AI asistan su an yanit veremiyor. (Yapilandirma veya baglanti hatasi olabilir.)';
      setMessages([...next, { role: 'assistant', content: msg }]);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-full bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-600/30 transition-all hover:bg-primary-700 hover:shadow-xl"
          aria-label="AI Asistan'i ac"
        >
          <Sparkles className="h-5 w-5" />
          <span className="hidden sm:inline">AI Asistan</span>
        </button>
      )}

      {/* Overlay + Panel */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-[65] bg-black/30 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-[440px] flex-col border-l border-[var(--line)] bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--line)] bg-gradient-to-r from-primary-700 to-primary-600 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold leading-tight">AI Asistan</div>
                  <div className="text-[11px] text-primary-100">
                    Kendi verinizden Turkce cevap
                  </div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 transition-colors hover:bg-white/15"
                aria-label="Kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Model secici */}
            {models.length > 0 && (
              <div className="flex items-center gap-2 border-b border-[var(--line)] bg-white px-4 py-2">
                <span className="text-[11px] font-medium text-[var(--ink-3)]">Model</span>
                <select
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  className="flex-1 rounded-lg border border-[var(--line-strong)] bg-white px-2 py-1 text-[12px] font-medium text-[var(--ink-1)] focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-[var(--surface-0)] p-4">
              {enabled === false && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800">
                  AI asistan henuz yapilandirilmadi. Sunucuda <code>ANTHROPIC_API_KEY</code> tanimlanip
                  servis yeniden baslatildiginda aktif olur.
                </div>
              )}

              {messages.length === 0 && enabled !== false && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-[var(--line)] bg-white p-3 text-[13px] text-[var(--ink-2)]">
                    Stok, fiyat, maliyet, marj, cari, siparis ve vade hakkinda dogal dille soru
                    sorabilirsiniz. Asistan sadece okur; hicbir veriyi degistirmez.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-lg border border-[var(--line-strong)] bg-white px-2.5 py-1.5 text-left text-[12px] font-medium text-primary-700 transition-colors hover:bg-primary-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      m.role === 'user'
                        ? 'bg-primary-600 text-white'
                        : 'bg-white text-primary-600 ring-1 ring-inset ring-[var(--line)]'
                    }`}
                  >
                    {m.role === 'user' ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div
                    className={`max-w-[82%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-primary-600 text-white'
                        : 'border border-[var(--line)] bg-white text-[var(--ink-1)]'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex gap-2">
                  <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-white text-primary-600 ring-1 ring-inset ring-[var(--line)]">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[13px] text-[var(--ink-3)]">
                    <Loader2 className="h-4 w-4 animate-spin" /> Dusunuyor...
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-[var(--line)] bg-white p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder="Bir soru yazin... (Enter ile gonder)"
                  disabled={enabled === false}
                  className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
                />
                <button
                  onClick={() => send()}
                  disabled={sending || !input.trim() || enabled === false}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                  aria-label="Gonder"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1.5 px-1 text-[10.5px] text-[var(--ink-3)]">
                Yalniz okur, veri degistirmez. Sayilar canli sistemden gelir.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default AdminAiAssistant;
