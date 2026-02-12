const SESSION_KEY = 'b2b-activity-session';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

type StoredSession = {
  id: string;
  lastSeen: number;
};

const loadSession = (): StoredSession | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.id || !parsed?.lastSeen) return null;
    return parsed;
  } catch {
    return null;
  }
};

const saveSession = (session: StoredSession) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore storage errors
  }
};

const generateSessionId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const getOrCreateSessionId = () => {
  if (typeof window === 'undefined') return null;
  const now = Date.now();
  const existing = loadSession();
  if (existing && now - existing.lastSeen <= SESSION_TIMEOUT_MS) {
    const updated = { ...existing, lastSeen: now };
    saveSession(updated);
    return updated.id;
  }

  const nextSession = { id: generateSessionId(), lastSeen: now };
  saveSession(nextSession);
  return nextSession.id;
};
