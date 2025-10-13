import { Product } from '@/types';

/**
 * Get similar products from the same category
 */
export function getSimilarProducts(
  currentProduct: Product,
  allProducts: Product[],
  limit: number = 6
): Product[] {
  return allProducts
    .filter(p =>
      p.id !== currentProduct.id &&
      p.category.id === currentProduct.category.id
    )
    .slice(0, limit);
}

/**
 * Get products from related categories (price range based)
 */
export function getRelatedProducts(
  currentProduct: Product,
  allProducts: Product[],
  priceType: 'invoiced' | 'white' = 'invoiced',
  limit: number = 6
): Product[] {
  const currentPrice = priceType === 'invoiced'
    ? currentProduct.prices.invoiced
    : currentProduct.prices.white;

  // Find products within 30% price range
  const priceMin = currentPrice * 0.7;
  const priceMax = currentPrice * 1.3;

  return allProducts
    .filter(p => {
      if (p.id === currentProduct.id) return false;

      const price = priceType === 'invoiced' ? p.prices.invoiced : p.prices.white;
      return price >= priceMin && price <= priceMax;
    })
    .sort((a, b) => {
      // Sort by price similarity
      const priceA = priceType === 'invoiced' ? a.prices.invoiced : a.prices.white;
      const priceB = priceType === 'invoiced' ? b.prices.invoiced : b.prices.white;
      return Math.abs(priceA - currentPrice) - Math.abs(priceB - currentPrice);
    })
    .slice(0, limit);
}

/**
 * Get products that are frequently bought together (based on category overlap in cart)
 */
export function getFrequentlyBoughtTogether(
  currentProduct: Product,
  allProducts: Product[],
  cartProductIds: string[],
  limit: number = 4
): Product[] {
  // If cart has products from the same category, suggest other products from that category
  const cartProducts = allProducts.filter(p => cartProductIds.includes(p.id));
  const categoriesInCart = new Set(cartProducts.map(p => p.category.id));

  if (categoriesInCart.has(currentProduct.category.id)) {
    // Suggest products from other categories in the cart
    return allProducts
      .filter(p =>
        p.id !== currentProduct.id &&
        !cartProductIds.includes(p.id) &&
        cartProducts.some(cp => cp.category.id !== currentProduct.category.id && p.category.id === cp.category.id)
      )
      .slice(0, limit);
  }

  // Otherwise, suggest popular products from different categories
  return allProducts
    .filter(p =>
      p.id !== currentProduct.id &&
      p.category.id !== currentProduct.category.id &&
      !cartProductIds.includes(p.id)
    )
    .sort((a, b) => b.excessStock - a.excessStock) // Sort by stock (popular items)
    .slice(0, limit);
}
