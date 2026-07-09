const TURKISH_CHAR_MAP: Record<string, string> = {
  '\u00e7': 'c',
  '\u011f': 'g',
  '\u0131': 'i',
  '\u0130': 'i',
  '\u00f6': 'o',
  '\u015f': 's',
  '\u00fc': 'u',
  '\u00c7': 'c',
  '\u011e': 'g',
  '\u00d6': 'o',
  '\u015e': 's',
  '\u00dc': 'u',
};

const MOJIBAKE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u00c3\u00a7/g, 'c'],
  [/\u00c4\u0178/g, 'g'],
  [/\u00c4\u00b1/g, 'i'],
  [/\u00c4\u00b0/g, 'i'],
  [/\u00c3\u00b6/g, 'o'],
  [/\u00c5\u0178/g, 's'],
  [/\u00c3\u00bc/g, 'u'],
  [/\u00c3\u0087/g, 'c'],
  [/\u00c4\u017e/g, 'g'],
  [/\u00c3\u0096/g, 'o'],
  [/\u00c5\u017e/g, 's'],
  [/\u00c3\u009c/g, 'u'],
];

const ASCII_TO_TURKISH: Record<string, string> = {
  c: '\u00e7',
  C: '\u00c7',
  g: '\u011f',
  G: '\u011e',
  i: '\u0131',
  I: '\u0130',
  o: '\u00f6',
  O: '\u00d6',
  s: '\u015f',
  S: '\u015e',
  u: '\u00fc',
  U: '\u00dc',
};

export const normalizeSearchText = (value?: string | number | null) => {
  let text = String(value ?? '').trim();
  MOJIBAKE_REPLACEMENTS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  return Array.from(text)
    .map((char) => TURKISH_CHAR_MAP[char] || char)
    .join('')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

export const includesSearch = (haystack: string, needle: string) => {
  const normalizedNeedle = normalizeSearchText(needle);
  if (!normalizedNeedle) return true;
  return normalizeSearchText(haystack).includes(normalizedNeedle);
};

export const compareSearchText = (left?: string | null, right?: string | null) =>
  normalizeSearchText(left).localeCompare(normalizeSearchText(right), 'tr-TR');

export const buildSearchVariants = (value?: string | null, maxVariants = 5) => {
  const raw = String(value || '').trim();
  if (!raw) return [''];

  const variants: string[] = [];
  const add = (variant: string) => {
    const clean = variant.trim();
    if (clean && !variants.includes(clean)) variants.push(clean);
  };

  add(raw);

  const normalized = normalizeSearchText(raw);
  if (normalized && normalized !== raw) add(normalized);

  const chars = Array.from(raw);
  chars.forEach((char, index) => {
    const replacement = ASCII_TO_TURKISH[char];
    if (!replacement || variants.length >= maxVariants) return;
    const next = [...chars];
    next[index] = replacement;
    add(next.join(''));
  });

  if (variants.length < maxVariants) {
    add(chars.map((char) => ASCII_TO_TURKISH[char] || char).join(''));
  }

  return variants.slice(0, maxVariants);
};
