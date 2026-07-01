'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Product } from '@/types';
import { customerApi } from '@/lib/api/customer';
import { ProductRecommendations } from './ProductRecommendations';

interface PersonalRecommendationsProps {
  allowedPriceTypes?: Array<'INVOICED' | 'WHITE'>;
  vatDisplayPreference?: 'WITH_VAT' | 'WITHOUT_VAT';
  /** Genel oneri basligi. Bos verilirse varsayilan kullanilir. */
  flatTitle?: string;
  /** "Eksik kategorileriniz" bloklari gosterilsin mi (ana sayfa icin true). */
  showMissingCategories?: boolean;
  /** Karta tiklaninca; verilmezse urun detayina yonlendirir. */
  onProductClick?: (product: Product) => void;
}

/**
 * Musterinin satin alma gecmisine gore kisisel oneriler + "eksik kategorileriniz".
 * Kendi verisini /recommendations/personal'dan ceker; hicbir sey yoksa hicbir sey render etmez.
 * Sepete ekleme burada YOK — kart urun detayina goturur, ekleme orada dogru birim/fiyatla yapilir.
 */
export function PersonalRecommendations({
  allowedPriceTypes,
  vatDisplayPreference,
  flatTitle = 'Sizin icin onerilenler',
  showMissingCategories = true,
  onProductClick,
}: PersonalRecommendationsProps) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [missing, setMissing] = useState<Array<{ category: { id: string; name: string }; products: Product[] }>>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    customerApi
      .getPersonalRecommendations()
      .then((data) => {
        if (!mounted) return;
        setProducts(data.products || []);
        setMissing(data.missingCategories || []);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!loaded) return null;
  if (products.length === 0 && missing.length === 0) return null;

  const handleClick = onProductClick ?? ((product: Product) => router.push(`/products/${product.id}`));

  return (
    <div>
      <ProductRecommendations
        products={products}
        title={flatTitle}
        icon="★"
        onProductClick={handleClick}
        allowedPriceTypes={allowedPriceTypes}
        vatDisplayPreference={vatDisplayPreference}
      />
      {showMissingCategories &&
        missing.map((group) => (
          <ProductRecommendations
            key={group.category.id}
            products={group.products}
            title={`Eksik kategoriniz: ${group.category.name}`}
            icon="+"
            onProductClick={handleClick}
            allowedPriceTypes={allowedPriceTypes}
            vatDisplayPreference={vatDisplayPreference}
          />
        ))}
    </div>
  );
}

export default PersonalRecommendations;
