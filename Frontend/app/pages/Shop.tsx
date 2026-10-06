import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { ProductCard } from '../components/ProductCard';
import { 
  Search, 
  SlidersHorizontal, 
  Loader2, 
  AlertCircle,
  X,
  ChevronDown,
  Package,
  Headphones,
  Smartphone,
  Laptop,
  Watch,
  Camera,
  Gamepad2,
  TabletSmartphone
} from 'lucide-react';
import { productApi, Product as DynamicProduct } from '../api/products';
import { Product as ShopProduct } from '../types/product';
 import { useAuth } from '../context/AuthContext';
 import { wishlistApi } from '../api/wishlist';
 import { slugifyProductName } from '../utils/wishlistPayload';
 import { formatINR } from '../utils/formatINR';
import { getProductImageUrl } from '../utils/imageUrl';

const categoryIcons: Record<string, React.ElementType> = {
  'Audio': Headphones,
  'Gaming': Gamepad2,
  'Computers': Laptop,
  'Mobile': Smartphone,
  'Wearables': Watch,
  'Cameras': Camera,
  'Tablets': TabletSmartphone,
};

export function Shop() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 50000]);
  const [sortBy, setSortBy] = useState('featured');
  const [showFilters, setShowFilters] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [dynamicProducts, setDynamicProducts] = useState<ShopProduct[]>([]);
  const [backendTotal, setBackendTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      (res.data.productIds || []).forEach((id) => next.add(`mongo:${id}`));
      (res.data.items || []).forEach((row) => {
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

  const selectedCategory = searchParams.get('category') || 'All Products';
  const showSaleOnly = searchParams.get('sale') === 'true';

  useEffect(() => {
    let cancelled = false;

    const fetchDynamicProducts = async () => {
      try {
        setIsLoading(true);
        const apiUrl = "/api/products";
        const clientId = user?.clientId || user?.linkedClientId || localStorage.getItem("retail_verse_client_id");
        console.log("User shop API URL:", apiUrl);
        console.log("Logged in user:", user);
        console.log("clientId sent:", clientId);

        const response = await productApi.getAll(clientId || undefined);
        if (cancelled) return; // Ignore stale responses from previous auth state

        if (response.success && Array.isArray(response.data)) {
          const normalized = response.data
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
              featured: p.isFeatured || false,
              sku: p.sku
            } as ShopProduct))
            .filter((p) => {
              const hasValidId = Boolean(p._id || p.id);
              const hasValidName = typeof p.name === 'string' && p.name.trim().length > 0;
              const hasValidPrice = typeof p.price === 'number' && p.price > 0;
              return hasValidId && hasValidName && hasValidPrice;
            });
          if (cancelled) return;
          setDynamicProducts(normalized);
          setBackendTotal(response.totalProducts || normalized.length);
          
          console.log("role:", user?.role);
          console.log("clientId sent:", clientId);
          console.log("dynamicProducts length:", normalized.length);
        } else {
          if (cancelled) return;
          console.log('[Shop] No dynamic products returned or success false');
          console.log("role:", user?.role);
          console.log("dynamicProducts length: 0");
        }
      } catch (err: any) {
        if (cancelled) return;
        console.error('[Shop] API error fetching dynamic products:', err.message);
        console.log("dynamicProducts length: 0 (error)");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchDynamicProducts();
    
    return () => {
      cancelled = true;
    };
  }, [user]);

  const allProducts = useMemo(() => dynamicProducts, [dynamicProducts]);

  const categories = useMemo(() => {
    const cats = new Set(['All Products']);
    allProducts.forEach(p => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [allProducts]);

  const filteredProducts = useMemo(() => {
    let result = [...allProducts];

    if (selectedCategory !== 'All Products') {
      result = result.filter((p) => p.category === selectedCategory);
    }

    if (showSaleOnly) {
      result = result.filter((p) => 
        (p.salePrice && p.salePrice < p.price) || 
        (p.originalPrice && p.originalPrice > p.price) || 
        p.isOnSale || 
        (p.salePercentage && p.salePercentage > 0)
      );
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((p) => {
        const product = p as ShopProduct & { sku?: string };
        return (
          product.name.toLowerCase().includes(query) ||
          product.description.toLowerCase().includes(query) ||
          (product.sku && product.sku.toLowerCase().includes(query)) ||
          product.category.toLowerCase().includes(query)
        );
      });
    }

    result = result.filter((p) => {
      const price = p.salePrice || p.price;
      return price >= priceRange[0] && price <= priceRange[1];
    });

    switch (sortBy) {
      case 'price-low':
        result.sort((a, b) => (a.salePrice || a.price) - (b.salePrice || b.price));
        break;
      case 'price-high':
        result.sort((a, b) => (b.salePrice || b.price) - (a.salePrice || a.price));
        break;
      case 'rating':
        result.sort((a, b) => b.rating - a.rating);
        break;
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        result.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }

    console.log("filteredProducts length:", result.length);
    if (error) console.log("api error:", error);
    return result;
  }, [allProducts, selectedCategory, showSaleOnly, searchQuery, priceRange, sortBy, error]);

  const handleCategoryChange = (category: string) => {
    const params = new URLSearchParams(searchParams);
    if (category === 'All Products') {
      params.delete('category');
    } else {
      params.set('category', category);
    }
    setSearchParams(params);
    setIsSidebarOpen(false);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setPriceRange([0, 50000]);
    setSortBy('featured');
    setSearchParams({});
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-[#F8FAFC]">
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-[min(520px,90vw)] h-[min(520px,90vw)] rounded-full bg-[#2563EB]/10 blur-[100px]" />
        <div className="absolute top-1/4 right-0 w-[380px] h-[380px] rounded-full bg-[#3b82f6]/10 blur-[90px]" />
        <div className="absolute -bottom-32 -left-20 w-[min(560px,95vw)] h-[min(560px,95vw)] rounded-full bg-[#2563EB]/10 blur-[110px]" />
        <div className="absolute bottom-0 left-1/4 w-[320px] h-[320px] rounded-full bg-[#60a5fa]/10 blur-[80px]" />
      </div>

      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 transition-all duration-300 ease-out">
        {/* Header Section */}
        <div className="mb-10 sm:mb-12">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="space-y-3">
              <h1 className="text-[36px] sm:text-[40px] lg:text-[44px] font-extrabold tracking-tight text-[#0B1F3A]">
                Shop All <span className="text-[#2563EB]">Products</span>
              </h1>
              <p className="text-base sm:text-lg font-medium text-[#0B1F3A]/70">
                {isLoading ? 'Loading products...' : `${allProducts.length} products found`}
              </p>
            </div>
            
            {error && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-700 rounded-2xl text-sm border border-red-200 shadow-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
          {/* Mobile Filter Toggle */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden flex items-center justify-center gap-2 px-5 py-3 rounded-full font-semibold text-[#F8FAFC] shadow-md bg-[#2563EB] hover:bg-[#1d4ed8] transition-all duration-300 ease-out hover:scale-[1.02]"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
          </button>

          {/* Sidebar Overlay */}
          {isSidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          {/* Sidebar */}
          <aside className={`
            lg:w-72 flex-shrink-0 
            ${isSidebarOpen ? 'fixed inset-y-0 left-0 z-50 w-80 bg-white/95 backdrop-blur-xl shadow-2xl shadow-[#2563EB]/10 border-r border-[#2563EB]/20 transform transition-all duration-300 ease-out lg:relative lg:border-0 lg:bg-transparent lg:backdrop-blur-none lg:shadow-none' : 'hidden lg:block'}
          `}>
            <div className="h-full overflow-y-auto p-6 lg:p-0">
              {/* Mobile Sidebar Header */}
              <div className="flex items-center justify-between mb-6 lg:hidden">
                <h2 className="text-lg font-bold text-[#0B1F3A]">Filters</h2>
                <button 
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-all duration-300 ease-out"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <div className="rounded-2xl p-5 shadow-lg shadow-[#2563EB]/5 border border-[#2563EB]/20 bg-white transition-all duration-300 ease-out">
                {/* Search */}
                <div className="mb-6">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0B1F3A]/70 mb-3">
                    Search
                  </label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2563EB]" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-[#F8FAFC] border border-[#0B1F3A]/15 rounded-full text-sm text-[#0B1F3A] placeholder:text-[#0B1F3A]/40 shadow-sm transition-all duration-300 ease-out focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                    />
                  </div>
                </div>

                {/* Categories */}
                <div className="mb-6">
                  <h3 className="block text-xs font-bold uppercase tracking-wider text-[#0B1F3A]/70 mb-3">
                    Categories
                  </h3>
                  <div className="space-y-1.5">
                    {categories.map((category) => {
                      const Icon = categoryIcons[category];
                      const isActive = selectedCategory === category;
                      
                      return (
                        <button
                          type="button"
                          key={category}
                          onClick={() => handleCategoryChange(category)}
                          className={`
                            w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all duration-300 ease-out
                            ${isActive 
                              ? 'font-bold text-[#F8FAFC] bg-[#2563EB] shadow-sm shadow-[#2563EB]/20' 
                              : 'font-medium text-[#0B1F3A]/80 hover:bg-[#2563EB]/10 hover:text-[#2563EB]'
                            }
                          `}
                        >
                          {Icon && <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#F8FAFC]' : 'text-[#0B1F3A]/50'}`} />}
                          {category}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Price Range */}
                <div className="mb-6">
                  <h3 className="block text-xs font-bold uppercase tracking-wider text-[#0B1F3A]/70 mb-3">
                    Price Range
                  </h3>
                  <div className="space-y-4">
                    <input
                      type="range"
                      min="0"
                      max="50000"
                      step="500"
                      value={priceRange[1]}
                      onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
                      className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-[#2563EB]"
                    />
                    <div className="flex items-center justify-between text-sm">
                      <span className="px-3 py-1.5 bg-[#F8FAFC] rounded-lg text-[#0B1F3A] font-semibold border border-[#0B1F3A]/10">
                        {formatINR(priceRange[0])}
                      </span>
                      <span className="text-[#0B1F3A]/30">—</span>
                      <span className="px-3 py-1.5 bg-[#F8FAFC] rounded-lg text-[#0B1F3A] font-semibold border border-[#0B1F3A]/10">
                        {formatINR(priceRange[1])}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sale Only */}
                <div>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={showSaleOnly}
                        onChange={(e) => {
                          const params = new URLSearchParams(searchParams);
                          if (e.target.checked) {
                            params.set('sale', 'true');
                          } else {
                            params.delete('sale');
                          }
                          setSearchParams(params);
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-[#2563EB] transition-colors duration-300 ease-out" />
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-4 transition-transform duration-300 ease-out" />
                    </div>
                    <span className="text-sm font-medium text-[#0B1F3A]/80 group-hover:text-[#2563EB] transition-colors duration-300 ease-out">
                      Sale items only
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </aside>

          {/* Products Grid */}
          <div className="flex-1 min-w-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6 rounded-2xl border border-[#2563EB]/20 p-4 shadow-lg shadow-[#2563EB]/5 bg-white transition-all duration-300 ease-out">
              <div className="hidden lg:flex items-center gap-2 text-sm text-[#0B1F3A]/70">
                <Package className="w-4 h-4 text-[#2563EB]" />
                Showing <span className="font-bold text-[#0B1F3A]">{filteredProducts.length}</span> products
              </div>

              <div className="flex items-center gap-3 ml-auto w-full sm:w-auto justify-end">
                <label className="text-sm font-semibold text-[#0B1F3A]/70 hidden sm:block">Sort by:</label>
                <div className="relative min-w-0 flex-1 sm:flex-initial sm:min-w-[200px]">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full appearance-none pl-4 pr-10 py-2.5 bg-[#F8FAFC] border border-[#0B1F3A]/15 rounded-full text-sm font-semibold text-[#0B1F3A] shadow-sm transition-all duration-300 ease-out focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 cursor-pointer"
                  >
                    <option value="featured">Featured</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="rating">Highest Rated</option>
                    <option value="name">Name: A to Z</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2563EB] pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Products Grid */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 rounded-[20px] border border-[#2563EB]/20 bg-white shadow-lg shadow-[#2563EB]/5">
                <Loader2 className="w-10 h-10 text-[#2563EB] animate-spin mb-4" />
                <p className="text-[#0B1F3A]/70 font-semibold">Loading your products...</p>
              </div>
            ) : filteredProducts.length > 0 ? (
              <div
                className="grid gap-6"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
              >
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className="group rounded-3xl border border-[#2563EB]/20 bg-white shadow-md shadow-[#2563EB]/5 transition-all duration-300 ease-out backdrop-blur-[10px] hover:border-[#2563EB] hover:scale-[1.02] hover:shadow-xl hover:shadow-[#2563EB]/10 overflow-hidden"
                  >
                    <ProductCard
                      product={product as ShopProduct & { _id?: string }}
                      wishlistCandidates={dynamicProducts as (ShopProduct & { _id?: string })[]}
                      wishlistKeySet={wishlistKeySet}
                      onWishlistUpdated={refreshWishlistKeys}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-4 sm:px-8">
                <div className="w-full max-w-md text-center rounded-[20px] p-10 border border-[#2563EB]/20 bg-white shadow-lg shadow-[#2563EB]/5">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#2563EB]/10 text-[#2563EB] border border-[#2563EB]/20 shadow-md">
                    <Package className="w-10 h-10 text-[#2563EB]" strokeWidth={1.75} />
                  </div>
                  <h3 className="text-2xl font-bold text-[#0B1F3A] mb-2 tracking-tight">No products found</h3>
                  <p className="text-[#0B1F3A]/70 text-base mb-8 max-w-sm mx-auto leading-relaxed">
                    No products available at the moment.
                  </p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-bold text-[#F8FAFC] bg-[#2563EB] hover:bg-[#1d4ed8] shadow-md shadow-[#2563EB]/20 transition-all duration-300 hover:scale-105"
                  >
                    Clear all filters
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
