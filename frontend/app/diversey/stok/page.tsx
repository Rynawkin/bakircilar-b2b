'use client';

import { useState, useEffect } from 'react';
import adminApi from '@/lib/api/admin';
import { Product } from '@/types';

export default function DiverseyStokPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const response = await adminApi.getProducts();

      // Sadece Diversey markasını filtrele (marka genelde ürün adında olur)
      const diverseyProducts = response.products.filter((p: Product) =>
        p.name.toUpperCase().includes('DIVERSEY') ||
        p.name.toUpperCase().includes('DİVERSEY')
      );

      setProducts(diverseyProducts);
    } catch (error) {
      console.error('Ürünler yüklenemedi:', error);
      alert('Ürünler yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p =>
    searchTerm === '' ||
    p.name.toUpperCase().includes(searchTerm.toUpperCase()) ||
    p.mikroCode.toUpperCase().includes(searchTerm.toUpperCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Ürünler yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex gap-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Ürün adı veya kodu ile ara..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Tümünü Göster
            </button>
          )}
        </div>
        <div className="mt-4 flex justify-between items-center">
          <span className="text-sm text-gray-600">
            {searchTerm
              ? `${filteredProducts.length} sonuç bulundu`
              : `Toplam ${products.length} Diversey ürünü`}
          </span>
          <button
            onClick={loadProducts}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            🔄 Yenile
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Ürün Kodu
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Ürün Adı
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Kategori
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Birim
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Fazla Stok
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    Diversey ürünü bulunamadı
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {product.mikroCode}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {product.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {product.category.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {product.unit}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      {product.excessStock > 0 ? (
                        <span className="text-green-600">{product.excessStock}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
