import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  AlertTriangle,
  Layers,
  Search,
  TrendingUp,
  Loader2,
  ChevronDown,
  ShoppingCart,
  Eye,
  Star,
  ChevronLeft,
  ChevronRight,
  Tag,
  BarChart2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { inventoryApi, catalogApi, Product as DynamicProduct } from '../../api/products';
import { Product as ShopProduct } from '../../types/product';
import { ProductCard } from '../../components/ProductCard';
import { useAuth } from '../../context/AuthContext';
import { wishlistApi } from '../../api/wishlist';
import { slugifyProductName } from '../../utils/wishlistPayload';
import { formatINR } from '../../utils/formatINR';
import { getProductImageUrl } from '../../utils/imageUrl';
import { isCustomerAccountRole } from '../../utils/staffRoles';
import { useNavigate } from 'react-router';

const ITEMS_PER_PAGE = 12;

export function DashboardProducts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isUserRole = isCustomerAccountRole(user?.role);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Products');
  const [sortBy, setSortBy] = useState('featured');
  const [isLoading, setIsLoading] = useState(true);
  const [dynamicProducts, setDynamicProducts] = useState<ShopProduct[]>([]);
  const [wishlistKeySet, setWishlistKeySet] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

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
    const fetchProducts = async () => {
      try {
        setIsLoading(true);
        setError(null);

        let responseData: DynamicProduct[] = [];

        if (isUserRole) {
          // USER/CUSTOMER role: use the public product catalog endpoint
          // GET /api/products — returns all active/visible products, no permission restriction
          console.log('[DashboardProducts] USER role detected — fetching public catalog via GET /api/products');
          const response = await catalogApi.getAll();
          console.log('[DashboardProducts] Catalog API response:', response);

          if (response.success) {
            // /api/products returns { data: [...], products: [...] }
            const items = Array.isArray(response.data)
              ? response.data
              : Array.isArray((response as any).products)
                ? (response as any).products
                : [];
            responseData = items;
          }
        } else {
          // Staff/Client roles: use the inventory manage endpoint (existing behavior)
          console.log('[DashboardProducts] Staff/Client role — fetching inventory via GET /api/inventory/manage');
          const response = await inventoryApi.getManage();
          if (response.success && Array.isArray(response.data)) {
            responseData = response.data;
          }
        }

        const normalized: ShopProduct[] = responseData.map((p: DynamicProduct) => ({
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
          reviews: p.numReviews || 0,
          featured: p.isFeatured || false,
          sku: p.sku,
          isActive: p.isActive !== false,
          isOnSale: p.isOnSale || false,
          salePercentage: p.salePercentage || 0,
          brand: (p as any).brand || '',
        } as ShopProduct));

        setDynamicProducts(normalized);
        console.log(`[DashboardProducts] Loaded ${normalized.length} products`);
      } catch (err: any) {
        console.error('[DashboardProducts] API error:', err.message);
        setError(isUserRole
          ? 'Could not load the product catalog. Please try again.'
          : 'Dynamic inventory could not be loaded.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, [isUserRole]);

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

    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      result = result.filter((p) =>
        p.name.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        (p as any).sku?.toLowerCase().includes(query) ||
        (p as any).brand?.toLowerCase().includes(query)
      );
    }

    switch (sortBy) {
      case 'price-low':
        result.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price-high':
        result.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'rating':
        result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'newest':
        // Keep natural sort (already sorted by -createdAt from backend)
        break;
      default:
        result.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }

    return result;
  }, [allProducts, selectedCategory, searchTerm, sortBy]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const stats = useMemo(() => {
    const total = allProducts.length;
    const lowStock = allProducts.filter(p => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 10).length;
    const outOfStock = allProducts.filter(p => (p.stock ?? 0) === 0).length;
    const categoryCount = categories.length - 1; // Exclude 'All Products'

    return [
      { title: 'Total Products', value: total, icon: Package, color: 'blue', desc: 'Visible in catalog' },
      { title: 'Low Stock', value: lowStock, icon: AlertTriangle, color: 'orange', desc: 'Stock ≤ 10 units' },
      { title: 'Out of Stock', value: outOfStock, icon: BarChart2, color: 'rose', desc: 'Currently unavailable' },
      { title: 'Categories', value: categoryCount, icon: Layers, color: 'emerald', desc: 'Unique categories' },
    ];
  }, [allProducts, categories]);

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500',
    orange: 'bg-orange-500',
    rose: 'bg-rose-500',
    emerald: 'bg-emerald-500',
  };

  const textColorMap: Record<string, string> = {
    blue: 'text-blue-500',
    orange: 'text-orange-500',
    rose: 'text-rose-500',
    emerald: 'text-emerald-500',
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 px-4 sm:px-6 lg:px-8 pt-6">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Card className="border-none shadow-md bg-white dark:bg-zinc-900 overflow-hidden relative group hover:shadow-lg transition-shadow duration-300">
              <div className={`absolute top-0 left-0 w-1 h-full ${colorMap[stat.color]} opacity-70`} />
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`w-4 h-4 ${textColorMap[stat.color]}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black">
                  {isLoading ? (
                    <span className="inline-block w-8 h-6 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse" />
                  ) : stat.value}
                </div>
                <div className="flex items-center mt-1 text-[10px] text-muted-foreground font-medium">
                  <TrendingUp className="w-3 h-3 mr-1 text-emerald-500" />
                  <span>{stat.desc}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Toolbar & Grid */}
      <div className="px-4 sm:px-6 lg:px-8 space-y-6">
        <Card className="border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-bold">
                  {isUserRole ? 'Product Catalog' : 'Product Catalog'}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {isLoading
                    ? 'Loading catalog...'
                    : `Showing ${paginatedProducts.length} of ${filteredProducts.length} products${filteredProducts.length !== allProducts.length ? ` (filtered from ${allProducts.length} total)` : ''}`
                  }
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    id="catalog-search"
                    type="text"
                    placeholder="Search products..."
                    className="pl-10 pr-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all w-full md:w-56"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                {/* Category Filter */}
                <div className="relative">
                  <select
                    id="catalog-category"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="appearance-none pl-4 pr-10 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>

                {/* Sort */}
                <div className="relative">
                  <select
                    id="catalog-sort"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="appearance-none pl-4 pr-10 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                  >
                    <option value="featured">Featured</option>
                    <option value="newest">Newest</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="rating">Highest Rated</option>
                    <option value="name">Name: A to Z</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 sm:p-8">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-24"
                >
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                  <p className="text-muted-foreground font-medium">Loading catalog...</p>
                </motion.div>
              ) : error ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-24 text-center"
                >
                  <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mb-4">
                    <AlertTriangle className="w-8 h-8 text-rose-500" />
                  </div>
                  <h3 className="text-lg font-bold text-rose-600">Could not load catalog</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">{error}</p>
                  <Button
                    variant="outline"
                    onClick={() => window.location.reload()}
                    className="mt-4"
                  >
                    Try Again
                  </Button>
                </motion.div>
              ) : paginatedProducts.length > 0 ? (
                <motion.div
                  key="grid"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                >
                  {paginatedProducts.map((product) => (
                    isUserRole ? (
                      <UserProductCard
                        key={product.id || product._id}
                        product={product}
                        wishlistKeySet={wishlistKeySet}
                        onWishlistUpdated={refreshWishlistKeys}
                      />
                    ) : (
                      <div key={product.id || product._id} className="h-full">
                        <ProductCard
                          product={product}
                          wishlistCandidates={dynamicProducts}
                          wishlistKeySet={wishlistKeySet}
                          onWishlistUpdated={refreshWishlistKeys}
                        />
                      </div>
                    )
                  ))}
                </motion.div>
              ) : allProducts.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-24 text-center"
                >
                  <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <Package className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-bold">No products available</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">
                    {isUserRole
                      ? 'There are no products available in the catalog right now. Please check back later.'
                      : 'Add products from Inventory to see them here.'}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="no-match"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-24 text-center"
                >
                  <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <Search className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-bold">No products match your filters</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">
                    Try adjusting your search or filter criteria.
                  </p>
                  <Button
                    variant="link"
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedCategory('All Products');
                      setSortBy('featured');
                    }}
                    className="mt-4 text-blue-600"
                  >
                    Reset all filters
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pagination */}
            {!isLoading && filteredProducts.length > ITEMS_PER_PAGE && (
              <div className="mt-8 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages} &bull; {filteredProducts.length} products
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    id="catalog-prev-page"
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="rounded-lg"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (currentPage <= 3) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={page}
                        id={`catalog-page-${page}`}
                        variant={page === currentPage ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                        className="rounded-lg w-9"
                      >
                        {page}
                      </Button>
                    );
                  })}
                  <Button
                    id="catalog-next-page"
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="rounded-lg"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * A storefront-style product card for USER / customer role.
 * Displays: image, name, category, brand, price, stock badge, rating, and Add to Cart / View.
 */
function UserProductCard({
  product,
  wishlistKeySet,
  onWishlistUpdated,
}: {
  product: ShopProduct;
  wishlistKeySet: Set<string>;
  onWishlistUpdated: () => void;
}) {
  const navigate = useNavigate();
  const isOutOfStock = (product.stock ?? 0) === 0;
  const isLowStock = (product.stock ?? 0) > 0 && (product.stock ?? 0) <= 10;

  const handleViewProduct = () => {
    const slug = (product as any).slug || product._id;
    navigate(`/product/${slug}`);
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Dispatch add-to-cart event for cart context
    window.dispatchEvent(new CustomEvent('add-to-cart', { detail: product }));
    // Navigate to product page for full cart interaction
    handleViewProduct();
  };

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="group relative bg-white dark:bg-zinc-900 rounded-2xl shadow-md hover:shadow-xl border border-gray-100 dark:border-white/8 overflow-hidden flex flex-col cursor-pointer transition-all duration-300"
      onClick={handleViewProduct}
    >
      {/* Product Image */}
      <div className="relative aspect-square overflow-hidden bg-gray-50 dark:bg-zinc-800">
        <img
          src={
            product.image ||
            'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=600&auto=format&fit=crop'
          }
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=600&auto=format&fit=crop';
          }}
        />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {isOutOfStock && (
            <span className="px-2 py-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full">
              Out of Stock
            </span>
          )}
          {isLowStock && !isOutOfStock && (
            <span className="px-2 py-0.5 bg-orange-400 text-white text-[10px] font-bold rounded-full">
              Low Stock
            </span>
          )}
          {(product as any).isOnSale && (product as any).salePercentage > 0 && (
            <span className="px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full">
              {(product as any).salePercentage}% OFF
            </span>
          )}
          {product.featured && (
            <span className="px-2 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded-full">
              Featured
            </span>
          )}
        </div>
      </div>

      {/* Product Info */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        {/* Category & Brand */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-400 truncate">
            {product.category}
          </span>
          {(product as any).brand && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate ml-2">
              <Tag className="w-3 h-3" />
              {(product as any).brand}
            </span>
          )}
        </div>

        {/* Product Name */}
        <h3 className="text-sm font-bold leading-snug line-clamp-2 text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {product.name}
        </h3>

        {/* Rating */}
        {(product.rating ?? 0) > 0 && (
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(star => (
              <Star
                key={star}
                className={`w-3 h-3 ${star <= Math.round(product.rating || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-zinc-600'}`}
              />
            ))}
            <span className="text-[11px] text-muted-foreground ml-0.5">
              ({product.reviews ?? 0})
            </span>
          </div>
        )}

        {/* Price */}
        <div className="flex items-baseline gap-2 mt-auto pt-1">
          <span className="text-base font-black text-zinc-900 dark:text-zinc-100">
            {formatINR(product.price)}
          </span>
          {product.originalPrice && product.originalPrice > product.price && (
            <span className="text-xs text-muted-foreground line-through">
              {formatINR(product.originalPrice)}
            </span>
          )}
        </div>

        {/* Stock info */}
        <div className="text-[11px] text-muted-foreground">
          {isOutOfStock
            ? 'Currently unavailable'
            : isLowStock
              ? `Only ${product.stock} left in stock`
              : `${product.stock} in stock`}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-2">
          <Button
            id={`add-to-cart-${product._id || product.id}`}
            size="sm"
            disabled={isOutOfStock}
            onClick={handleAddToCart}
            className={`flex-1 text-xs font-bold rounded-xl h-9 ${
              isOutOfStock
                ? 'opacity-50 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
            {isOutOfStock ? 'Unavailable' : 'Add to Cart'}
          </Button>
          <Button
            id={`view-product-${product._id || product.id}`}
            size="sm"
            variant="outline"
            onClick={handleViewProduct}
            className="rounded-xl h-9 px-3 border-gray-200 dark:border-white/10"
          >
            <Eye className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
