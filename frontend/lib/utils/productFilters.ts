import { Product } from '@/types';
import { FilterState } from '@/components/customer/AdvancedFilters';

/**
 * Apply advanced filters and sorting to products
 */
export function applyProductFilters(products: Product[], filters: FilterState): Product[] {
  let filteredProducts = [...products];

  // Apply price range filter
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    filteredProducts = filteredProducts.filter((product) => {
      const price = filters.priceType === 'invoiced'
        ? product.prices.invoiced
        : product.prices.white;

      if (filters.minPrice !== undefined && price < filters.minPrice) {
        return false;
      }
      if (filters.maxPrice !== undefined && price > filters.maxPrice) {
        return false;
      }
      return true;
    });
  }

  // Apply stock range filter
  if (filters.minStock !== undefined || filters.maxStock !== undefined) {
    filteredProducts = filteredProducts.filter((product) => {
      const stockValue = product.maxOrderQuantity ?? product.availableStock ?? product.excessStock;
      if (filters.minStock !== undefined && stockValue < filters.minStock) {
        return false;
      }
      if (filters.maxStock !== undefined && stockValue > filters.maxStock) {
        return false;
      }
      return true;
    });
  }

  // Apply sorting
  if (filters.sortBy && filters.sortBy !== 'none') {
    filteredProducts.sort((a, b) => {
      switch (filters.sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name, 'tr');
        case 'name-desc':
          return b.name.localeCompare(a.name, 'tr');
        case 'price-asc': {
          const priceA = filters.priceType === 'invoiced' ? a.prices.invoiced : a.prices.white;
          const priceB = filters.priceType === 'invoiced' ? b.prices.invoiced : b.prices.white;
          return priceA - priceB;
        }
        case 'price-desc': {
          const priceA = filters.priceType === 'invoiced' ? a.prices.invoiced : a.prices.white;
          const priceB = filters.priceType === 'invoiced' ? b.prices.invoiced : b.prices.white;
          return priceB - priceA;
        }
        case 'stock-asc':
          return (a.maxOrderQuantity ?? a.availableStock ?? a.excessStock) -
            (b.maxOrderQuantity ?? b.availableStock ?? b.excessStock);
        case 'stock-desc':
          return (b.maxOrderQuantity ?? b.availableStock ?? b.excessStock) -
            (a.maxOrderQuantity ?? a.availableStock ?? a.excessStock);
        default:
          return 0;
      }
    });
  }

  return filteredProducts;
}
