import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import { ProductCard } from '../components/ProductCard';
import { Loader2, ArrowRight, Package, Star } from 'lucide-react';
import { productApi, Product as DynamicProduct } from '../api/products';
import { Product as ShopProduct } from '../types/product';
import { useAuth } from '../context/AuthContext';
import { wishlistApi } from '../api/wishlist';
import { slugifyProductName } from '../utils/wishlistPayload';
import { getProductImageUrl } from '../utils/imageUrl';

const FEATURED_COUNT = 8;

export function ProductsPreview() {
  const { user } = useAuth();
  const [dynamicFeatured, setDynamicFeatured] = useState<ShopProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [wishlistKeySet, setWishlistKeySet] = useState<Set<string>>(() => new Set());

  const refreshWishlistKeys = useCallback(async () => {
    if (!user) {
      setWishlistKeySet(new Set());
      return;
    }
    try {
      const res = await wishlistApi.getList();
      if (!res.success || !res.data) return;
      const next = new Set<string>();
      (res.data.productIds || []).forEach((id: string) => next.add(`mongo:${id}`));
      (res.data.items || []).forEach((row: any) => {
        if (row.productKey) next.add(row.productKey);
      });
      setWishlistKeySet(next);
    } catch {
      setWishlistKeySet(new Set());
    }
  }, [user]);

  useEffect(() => {
    refreshWishlistKeys();
  }, [refreshWishlistKeys]);

  useEffect(() => {
    let cancelled = false;

    const fetchFeatured = async () => {
      try {
        setIsLoading(true);
        const clientId = user?.clientId || user?.linkedClientId || localStorage.getItem("retail_verse_client_id");
        const response = await productApi.getFeatured(clientId || undefined);
        if (cancelled) return;

        if (response.success && Array.isArray(response.data)) {
          const normalized = response.data
            .slice(0, FEATURED_COUNT)
            .map((p: DynamicProduct) => ({
              id: p._id || `dyn-${Math.random().toString(36).substr(2, 9)}`,
              _id: p._id,
              name: p.name,
              slug: slugifyProductName(p.name),
              price: p.price,
              originalPrice: p.originalPrice,
              description: p.description || '',
              category: p.category,
              image: getProductImageUrl(p) || 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=1000&auto=format&fit=crop',
              images: [getProductImageUrl(p)].filter(Boolean),
              stock: p.stock,
              rating: p.rating || 0,
              reviews: 0,
              featured: true,
              sku: p.sku,
            } as ShopProduct));
          if (!cancelled) setDynamicFeatured(normalized);
        } else {
          if (!cancelled) setDynamicFeatured([]);
        }
      } catch {
        if (!cancelled) setDynamicFeatured([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchFeatured();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-[#F8FAFC]">
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-[min(520px,90vw)] h-[min(520px,90vw)] rounded-full bg-[#2563EB]/10 blur-[100px]" />
        <div className="absolute top-1/4 right-0 w-[380px] h-[380px] rounded-full bg-[#3b82f6]/10 blur-[90px]" />
        <div className="absolute -bottom-32 -left-20 w-[min(560px,95vw)] h-[min(560px,95vw)] rounded-full bg-[#2563EB]/10 blur-[110px]" />
        <div className="absolute bottom-0 left-1/4 w-[320px] h-[320px] rounded-full bg-[#60a5fa]/10 blur-[80px]" />
      </div>

      <main className="mx-auto max-w-[88rem] px-4 py-16 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#2563EB]/10 border border-[#2563EB] text-[#2563EB] text-xs font-bold uppercase tracking-wider mb-4 shadow-sm">
            <Star className="w-3.5 h-3.5 text-[#2563EB]" />
            Featured Collection
          </div>
          <h1 className="text-[40px] sm:text-[48px] lg:text-[56px] font-extrabold tracking-tight text-[#0B1F3A] leading-tight">
            Our <span className="text-[#2563EB]">Products</span>
          </h1>
          <p className="mt-4 text-lg sm:text-xl font-medium text-[#0B1F3A]/70 max-w-2xl mx-auto">
            Discover our curated selection of premium products handpicked for you.
          </p>
        </div>

        {/* Products Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="w-10 h-10 text-[#2563EB] animate-spin mb-4" />
            <p className="text-[#0B1F3A]/70 font-semibold">Loading products...</p>
          </div>
        ) : dynamicFeatured.length > 0 ? (
          <>
            <div
              className="grid gap-6"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
            >
              {dynamicFeatured.map((product) => (
                <div
                  key={product.id}
                  className="group rounded-3xl border border-[#2563EB]/20 bg-white shadow-md shadow-[#2563EB]/5 transition-all duration-300 ease-out backdrop-blur-[10px] hover:border-[#2563EB] hover:scale-[1.02] hover:shadow-xl hover:shadow-[#2563EB]/10 overflow-hidden"
                >
                  <ProductCard
                    product={product as ShopProduct & { _id?: string }}
                    wishlistCandidates={dynamicFeatured as (ShopProduct & { _id?: string })[]}
                    wishlistKeySet={wishlistKeySet}
                    onWishlistUpdated={refreshWishlistKeys}
                  />
                </div>
              ))}
            </div>

            {/* View All CTA */}
            <div className="text-center mt-14">
              <Link
                to="/products/all"
                className="group inline-flex items-center gap-3 rounded-full bg-[#2563EB] hover:bg-[#1d4ed8] px-8 py-4 text-base font-bold text-[#F8FAFC] shadow-[0_8px_25px_rgba(37,99,235,0.3)] transition-all duration-300 hover:scale-105 hover:shadow-[0_12px_35px_rgba(37,99,235,0.4)] active:scale-[0.98]"
              >
                View All Products
                <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 sm:px-8">
            <div className="w-full max-w-md text-center rounded-[20px] p-10 border border-[#2563EB]/20 bg-white shadow-lg shadow-[#2563EB]/5">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#2563EB]/10 text-[#2563EB] border border-[#2563EB]/20 shadow-md">
                <Package className="w-10 h-10 text-[#2563EB]" strokeWidth={1.75} />
              </div>
              <h3 className="text-2xl font-bold text-[#0B1F3A] mb-2 tracking-tight">No products found</h3>
              <p className="text-[#0B1F3A]/70 text-base mb-8 max-w-sm mx-auto leading-relaxed">
                Add products from Inventory to see them here.
              </p>
              <Link
                to="/products/all"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-[#F8FAFC] bg-[#2563EB] hover:bg-[#1d4ed8] shadow-md shadow-[#2563EB]/20 transition-all duration-300 hover:scale-105"
              >
                Browse All Products
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
