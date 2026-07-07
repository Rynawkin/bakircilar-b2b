export const getApiErrorMessage = (error: any, fallback: string): string => {
  const raw =
    error?.response?.data?.error ??
    error?.response?.data?.message ??
    error?.response?.data ??
    error?.message;

  if (!raw) return fallback;
  if (typeof raw === 'string') return raw;
  if (typeof raw?.message === 'string') return raw.message;
  if (typeof raw?.code === 'string') return raw.code;

  try {
    return JSON.stringify(raw);
  } catch {
    return fallback;
  }
};
