import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  AlertTriangle,
  Layers,
  Search,
  Filter,
  TrendingUp,
  Loader2,
  ChevronDown,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { productApi, Product as DynamicProduct } from '../../api/products';
import { products as staticProducts } from '../../data/products';
import { Product as ShopProduct } from '../../types/product';
import { ProductCard } from '../../components/ProductCard';
import { useAuth } from '../../context/AuthContext';
import { wishlistApi } from '../../api/wishlist';
import { slugifyProductName } from '../../utils/wishlistPayload';
import { formatINR } from '../../utils/formatINR';
import { getProductImageUrl } from '../../utils/imageUrl';

export function DashboardProducts() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Products');
  const [sortBy, setSortBy] = useState('featured');
  const [isLoading, setIsLoading] = useState(true);
  const [dynamicProducts, setDynamicProducts] = useState<ShopProduct[]>([]);
  const [wishlistKeySet, setWishlistKeySet] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

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
    const fetchDynamicProducts = async () => {
      try {
        setIsLoading(true);
        const response = await productApi.getAll();
        if (response.success && Array.isArray(response.data)) {
          const normalized = response.data.map((p: DynamicProduct) => ({
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
          } as ShopProduct));
          setDynamicProducts(normalized);
        }
      } catch (err: any) {
        console.error('[DashboardProducts] API error:', err.message);
        setError('Dynamic inventory could not be loaded.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDynamicProducts();
  }, []);

  const allProducts = useMemo(() => {
    const merged = [...dynamicProducts, ...staticProducts];
    const unique: ShopProduct[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();

    merged.forEach(p => {
      const id = (p._id || p.id)?.toString() || '';
      const name = p.name?.toLowerCase().trim() || '';
      
      if (id && !seenIds.has(id) && name && !seenNames.has(name)) {
        unique.push(p);
        seenIds.add(id);
        seenNames.add(name);
      }
    });

    return unique;
  }, [dynamicProducts]);

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
        (p as any).sku?.toLowerCase().includes(query)
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
      default:
        result.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }

    return result;
  }, [allProducts, selectedCategory, searchTerm, sortBy]);

  const stats = useMemo(() => {
    const total = allProducts.length;
    const lowStock = allProducts.filter(p => p.stock > 0 && p.stock <= 10).length;
    const outOfStock = allProducts.filter(p => p.stock === 0).length;
    const categoryCount = categories.length - 1; // Exclude 'All Products'

    return [
      { title: "Total Products", value: total, icon: Package, color: "blue" },
      { title: "Low Stock", value: lowStock, icon: AlertTriangle, color: "orange" },
      { title: "Out of Stock", value: outOfStock, icon: AlertTriangle, color: "rose" },
      { title: "Categories", value: categoryCount, icon: Layers, color: "emerald" },
    ];
  }, [allProducts, categories]);

  return (
    <div className="space-y-6 pb-12">
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 px-4 sm:px-6 lg:px-8 pt-6">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="border-none shadow-md bg-white dark:bg-zinc-900 overflow-hidden relative group">
              <div className={`absolute top-0 left-0 w-1 h-full bg-${stat.color}-500 opacity-70`} />
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`w-4 h-4 text-${stat.color}-500`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black">{stat.value}</div>
                <div className="flex items-center mt-1 text-[10px] text-muted-foreground font-medium">
                  <TrendingUp className="w-3 h-3 mr-1 text-emerald-500" />
                  <span>Real-time catalog data</span>
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
                <CardTitle className="text-xl font-bold">Product Catalog</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Showing {filteredProducts.length} of {allProducts.length} products
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    className="pl-10 pr-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all w-full md:w-64"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <div className="relative">
                  <select
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

                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="appearance-none pl-4 pr-10 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                  >
                    <option value="featured">Featured</option>
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
              ) : filteredProducts.length > 0 ? (
                <motion.div
                  key="grid"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                >
                  {filteredProducts.map((product) => (
                    <div key={product.id || product._id} className="h-full">
                      <ProductCard
                        product={product}
                        wishlistCandidates={dynamicProducts}
                        wishlistKeySet={wishlistKeySet}
                        onWishlistUpdated={refreshWishlistKeys}
                      />
                    </div>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-24 text-center"
                >
                  <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <Package className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-bold">No products found</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">
                    We couldn't find any products matching your current filters or search terms.
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
