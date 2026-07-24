const PRODUCT_DETAIL_PATH = /^\/products\/[^/?#]+\/?$/;

export const isProductDetailHref = (href?: string | null): boolean => {
  if (!href || !href.startsWith('/') || href.startsWith('//')) return false;

  try {
    const url = new URL(href, 'https://customer.bakircilar.local');
    return PRODUCT_DETAIL_PATH.test(url.pathname);
  } catch {
    return false;
  }
};
