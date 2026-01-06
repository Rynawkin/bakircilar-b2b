const TURKISH_CHAR_MAP: Record<string, string> = {
  Ç: 'c',
  ç: 'c',
  Ğ: 'g',
  ğ: 'g',
  İ: 'i',
  ı: 'i',
  Ö: 'o',
  ö: 'o',
  Ş: 's',
  ş: 's',
  Ü: 'u',
  ü: 'u',
};

export const normalizeSearchText = (value?: string | null) => {
  if (!value) return '';
  let output = '';
  for (const char of String(value)) {
    output += TURKISH_CHAR_MAP[char] ?? char;
  }
  return output
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

export const buildSearchTokens = (value?: string | null) => {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(' ') : [];
};

export const splitSearchTokens = (value?: string | null) => {
  if (!value) return [] as string[];
  return String(value)
    .replace(/\*/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
};

export const matchesSearchTokens = (normalizedHaystack: string, tokens: string[]) => {
  if (tokens.length === 0) return true;
  return tokens.every((token) => normalizedHaystack.includes(token));
};
