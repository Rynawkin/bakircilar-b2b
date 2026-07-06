const TURKISH_CHAR_MAP: Record<string, string> = {
  '\u00c7': 'c',
  '\u00e7': 'c',
  '\u011e': 'g',
  '\u011f': 'g',
  '\u0130': 'i',
  '\u0131': 'i',
  '\u00d6': 'o',
  '\u00f6': 'o',
  '\u015e': 's',
  '\u015f': 's',
  '\u00dc': 'u',
  '\u00fc': 'u',
  'Ã‡': 'c',
  'Ã§': 'c',
  'Ä': 'g',
  'ÄŸ': 'g',
  'Ä°': 'i',
  'Ä±': 'i',
  'Ã–': 'o',
  'Ã¶': 'o',
  'Å': 's',
  'ÅŸ': 's',
  'Ãœ': 'u',
  'Ã¼': 'u',
};

export const normalizeSearchText = (value?: string | null) => {
  if (!value) return '';
  let output = '';
  for (const char of String(value).normalize('NFD')) {
    output += TURKISH_CHAR_MAP[char] ?? char;
  }
  return output
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

export const buildSearchTokens = (value?: string | null) => {
  const normalized = normalizeSearchText(value);
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
};

export const matchesSearchTokens = (normalizedHaystack: string, tokens: string[]) => {
  if (tokens.length === 0) return true;
  return tokens.every((token) => normalizedHaystack.includes(token));
};
