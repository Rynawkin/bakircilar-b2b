const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'http://104.248.38.69:5000/api';

const BASE_URL = API_BASE.replace(/\/api\/?$/, '');

export const resolveImageUrl = (url?: string | null) => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${BASE_URL}${url}`;
  return `${BASE_URL}/${url}`;
};
