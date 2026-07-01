'use client';

import { Product } from '@/types';
import { ProductCard, ProductCardAddArgs } from './ProductCard';
import { useCartStore } from '@/lib/store/cartStore';

interface ProductRecommendationsProps {
  products: Product[];
  title: string;
  icon?: string;
  /** Geriye uyum icin tutuldu; kart artik kendi Link'i ile detaya gider. */
  onProductClick?: (product: Product) => void;
  /** Geriye uyum icin tutuldu; ekleme artik ProductCard uzerinden cartStore'a yapilir. */
  onAddToCart?: (productId: string) => void;
  allowedPriceTypes?: Array<'INVOICED' | 'WHITE'>;
  defaultPriceType?: 'INVOICED' | 'WHITE';
  vatDisplayPreference?: 'WITH_VAT' | 'WITHOUT_VAT';
}

/**
 * Oneri/tamamlayici urun seridi. Normal ProductCard'i kullanir; boylece stok, fiyat, birim,
 * indirim, KDV ve sepete ekleme (birim secimli) NORMAL urun kartiyla BIREBIR ayni gorunur.
 * (Eski surum ozel bir kart cizip stok yerine excessStock gosteriyordu -> yanlis/eksik veri.)
 */
export function ProductRecommendations({
  products,
  title,
  icon,
  allowedPriceTypes,
  defaultPriceType,
  vatDisplayPreference,
}: ProductRecommendationsProps) {
  const { addToCart } = useCartStore();
  if (products.length === 0) return null;

  const allowed: Array<'INVOICED' | 'WHITE'> =
    allowedPriceTypes && allowedPriceTypes.length > 0 ? allowedPriceTypes : ['INVOICED', 'WHITE'];
  const dpt: 'INVOICED' | 'WHITE' = defaultPriceType || allowed[0] || 'INVOICED';
  const handleAdd = async (args: ProductCardAddArgs) => {
    await addToCart(args);
  };

  return (
    <div className="mb-6">
      {title ? (
        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
          {icon ? <span className="text-xl">{icon}</span> : null}
          {title}
        </h3>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            allowedPriceTypes={allowed}
            defaultPriceType={dpt}
            vatDisplayPreference={vatDisplayPreference || 'WITHOUT_VAT'}
            variant="default"
            onAdd={handleAdd}
          />
        ))}
      </div>
    </div>
  );
}

export default ProductRecommendations;
