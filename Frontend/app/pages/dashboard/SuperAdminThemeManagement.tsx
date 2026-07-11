import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Palette,
  Check,
  X,
  Search,
  Users,
  ChevronRight,
  Eye,
  RefreshCw,
  Globe,
  Monitor,
  Tablet,
  Smartphone,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { themesApi, type ThemeData, type ThemeUsageData, type ClientAssignmentData } from '../../api/themes';
import { useAuth } from '../../context/AuthContext';

const MOCK_PRODUCTS = Array.from({ length: 8 }, (_, i) => ({
  _id: `mock-${i}`,
  name: ['Premium Leather Bag', 'Silk Evening Gown', 'Artisan Watch', 'Designer Sunglasses', 'Cashmere Scarf', 'Gold Earrings', 'Signature Fragrance', 'Leather Wallet'][i % 8],
  price: [245, 1890, 595, 320, 180, 450, 120, 85][i % 8],
  originalPrice: i % 3 === 0 ? [295, 2490, 795, 420][i % 4] : undefined,
  image: `https://images.unsplash.com/photo-${[1496181133206, 1523381210434, 1505740420928, 1445205170230, 1596462502278, 1605100804763, 1483985988355, 1542291026][i % 8]}?q=80&w=400&auto=format&fit=crop`,
  category: ['Accessories', 'Fashion', 'Watches', 'Sunglasses', 'Scarves', 'Jewelry', 'Fragrance', 'Accessories'][i % 8],
  rating: 4.5,
  isOnSale: i % 3 === 0,
}));

const NOVA_PRODUCTS = Array.from({ length: 10 }, (_, i) => ({
  _id: `nm-${i}`,
  name: ['Wireless Headphones', 'Smart Watch Pro', 'Organic Green Tea', 'Running Shoes', 'Bluetooth Speaker', 'Desk Lamp', 'Yoga Mat', 'Protein Powder', 'Phone Case', 'USB Hub'][i % 10],
  price: [79, 249, 22, 129, 59, 45, 35, 49, 19, 29][i % 10],
  originalPrice: i % 2 === 0 ? [99, 299, 29, 159, 79, 59, 45, 65, 29, 39][i % 10] : undefined,
  image: `https://images.unsplash.com/photo-${[1505740420928, 1523275335684, 1546868871, 1542291026, 1483985988355, 1513504935903, 1506157780, 1491553895911, 1496181133206, 1556228578][i % 10]}?q=80&w=400&auto=format&fit=crop`,
  category: ['Electronics', 'Wearables', 'Groceries', 'Sports', 'Electronics', 'Home', 'Sports', 'Health', 'Accessories', 'Electronics'][i % 10],
  rating: [4.2, 4.7, 4.0, 4.5, 4.3, 4.1, 4.6, 4.4, 3.9, 4.2][i % 10],
  stock: i % 5 === 0 ? 0 : 15,
  isOnSale: i % 2 === 0,
  numReviews: [234, 512, 89, 345, 178, 67, 423, 256, 145, 98][i % 10],
}));

export function SuperAdminThemeManagement() {
  const { user } = useAuth();
  const [themes, setThemes] = useState<ThemeData[]>([]);
  const [usage, setUsage] = useState<ThemeUsageData[]>([]);
  const [clients, setClients] = useState<ClientAssignmentData[]>([]);
  const [clientsPagination, setClientsPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [themeFilter, setThemeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [previewTheme, setPreviewTheme] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [themesRes, usageRes] = await Promise.all([
        themesApi.getAll(),
        themesApi.getUsage(),
      ]);
      if (themesRes.success) setThemes(themesRes.data || []);
      if (usageRes.success) setUsage(usageRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load theme data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const res = await themesApi.getClientAssignments({
        search: searchQuery || undefined,
        themeKey: themeFilter || undefined,
        page,
        limit: 10,
      });
      if (res.success) {
        setClients(res.data?.data || []);
        setClientsPagination(res.data?.pagination || null);
      }
    } catch {
      // ignore
    }
  }, [searchQuery, themeFilter, page]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadClients(); }, [loadClients]);

  const handleSetDefault = async (key: string) => {
    setSaving(`default-${key}`);
    try {
      const res = await themesApi.setDefault(key);
      if (res.success) {
        toast.success(res.message || 'Default theme updated');
        loadData();
      } else throw new Error(res.message);
    } catch (e: any) {
      toast.error(e.message || 'Failed to set default theme');
    } finally {
      setSaving(null);
    }
  };

  const handleToggle = async (key: string) => {
    setSaving(`toggle-${key}`);
    try {
      const res = await themesApi.toggle(key);
      if (res.success) {
        toast.success(res.message || 'Theme toggled');
        loadData();
      } else throw new Error(res.message);
    } catch (e: any) {
      toast.error(e.message || 'Failed to toggle theme');
    } finally {
      setSaving(null);
    }
  };

  const handleAssign = async (clientId: string, themeKey: string) => {
    setSaving(`assign-${clientId}`);
    try {
      const res = await themesApi.assignToClient(clientId, themeKey);
      if (res.success) {
        toast.success(res.message || 'Theme assigned');
        loadClients();
        loadData();
      } else throw new Error(res.message);
    } catch (e: any) {
      toast.error(e.message || 'Failed to assign theme');
    } finally {
      setSaving(null);
    }
  };

  const handleResetClient = async (clientId: string) => {
    setSaving(`reset-${clientId}`);
    try {
      const res = await themesApi.resetClient(clientId);
      if (res.success) {
        toast.success(res.message || 'Client theme reset');
        loadClients();
        loadData();
      } else throw new Error(res.message);
    } catch (e: any) {
      toast.error(e.message || 'Failed to reset client theme');
    } finally {
      setSaving(null);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadClients();
  };

  const defaultTheme = themes.find((t) => t.isDefault);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Theme Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {themes.map((theme) => {
          const themeUsage = usage.find((u) => u.themeKey === theme.key);

          return (
            <Card key={theme.key} className={`border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden ${!theme.isEnabled ? 'opacity-70' : ''}`}>
              <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-6">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center" style={{
                      background: `linear-gradient(135deg, ${theme.colorPalette?.primary || '#1a1a2e'}, ${theme.colorPalette?.secondary || '#c9a96e'})`
                    }}>
                      <Palette className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold flex items-center gap-2">
                        {theme.name}
                        {theme.isDefault && (
                          <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Default</span>
                        )}
                        {!theme.isEnabled && (
                          <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Disabled</span>
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">{theme.layoutStyle}</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-5">
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{theme.description}</p>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Typography</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{theme.typographyStyle}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Clients Using</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{themeUsage?.clientCount || 0} stores</span>
                  </div>
                </div>

                {/* Color palette */}
                {theme.colorPalette && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-2">Color Palette</span>
                    <div className="flex gap-2">
                      {Object.entries(theme.colorPalette).map(([name, color]) => (
                        <div key={name} className="flex flex-col items-center gap-1">
                          <div className="w-8 h-8 rounded-lg border border-gray-200" style={{ backgroundColor: color || '#ccc' }} />
                          <span className="text-[8px] text-gray-400 capitalize">{name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Features */}
                {theme.features && theme.features.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-2">Features</span>
                    <div className="flex flex-wrap gap-1.5">
                      {theme.features.map((f: string) => (
                        <span key={f} className="text-[10px] bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">{f}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview + Actions */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-gray-200 dark:border-white/10 h-9"
                    onClick={() => setPreviewTheme(previewTheme === theme.key ? null : theme.key)}
                  >
                    <Eye className="w-4 h-4 mr-1.5" />
                    {previewTheme === theme.key ? 'Close Preview' : 'Preview'}
                  </Button>
                  {!theme.isDefault && theme.isEnabled && (
                    <Button
                      size="sm"
                      className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 h-9"
                      onClick={() => handleSetDefault(theme.key)}
                      disabled={saving === `default-${theme.key}`}
                    >
                      {saving === `default-${theme.key}` ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Globe className="w-4 h-4 mr-1.5" />}
                      Set as Default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={theme.isEnabled ? 'destructive' : 'outline'}
                    className={`rounded-xl h-9 ${theme.isEnabled ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'border-gray-200 dark:border-white/10'}`}
                    onClick={() => handleToggle(theme.key)}
                    disabled={saving === `toggle-${theme.key}`}
                  >
                    {saving === `toggle-${theme.key}` ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                    {theme.isEnabled ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Preview */}
      {previewTheme && (
        <Card className="border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden">
          <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-lg font-bold">Preview: {themes.find((t) => t.key === previewTheme)?.name}</CardTitle>
              </div>
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-white/5 rounded-xl p-1">
                {[
                  { id: 'desktop', icon: Monitor },
                  { id: 'tablet', icon: Tablet },
                  { id: 'mobile', icon: Smartphone },
                ].map((dev) => (
                  <button
                    key={dev.id}
                    onClick={() => setPreviewDevice(dev.id as any)}
                    className={`p-2 rounded-lg transition-colors ${previewDevice === dev.id ? 'bg-white dark:bg-gray-700 shadow-sm' : 'hover:bg-white/50'}`}
                    aria-label={dev.id}
                  >
                    <dev.icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className={`mx-auto border border-gray-200 rounded-xl overflow-hidden bg-white transition-all duration-300 ${
              previewDevice === 'mobile' ? 'max-w-[375px]' : previewDevice === 'tablet' ? 'max-w-[768px]' : 'max-w-full'
            }`}>
              <div className="bg-gray-50 p-6">
                <div className="grid grid-cols-2 gap-3">
                  {(previewTheme === 'luxe-commerce' ? MOCK_PRODUCTS.slice(0, 4) : NOVA_PRODUCTS.slice(0, 4)).map((p: any) => (
                    <div key={p._id} className="bg-white rounded-xl overflow-hidden border border-gray-100">
                      <div className="aspect-square bg-gray-100">
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-3">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase">{p.category}</p>
                        <p className="text-xs font-semibold mt-0.5 line-clamp-1">{p.name}</p>
                        <p className="text-sm font-bold mt-1">${p.price}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center mt-4">This is a preview. No changes are saved.</p>
          </CardContent>
        </Card>
      )}

      {/* Client Assignments */}
      <Card className="border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-blue-600" />
              <div>
                <CardTitle className="text-lg font-bold">Client Theme Assignments</CardTitle>
                <CardDescription className="text-xs mt-0.5">Assign or reset themes for individual stores</CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-5">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, or store..."
                className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              value={themeFilter}
              onChange={(e) => { setThemeFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Themes</option>
              {themes.map((t) => (
                <option key={t.key} value={t.key}>{t.name}</option>
              ))}
              <option value="__none__">No theme set</option>
            </select>
            <Button type="submit" className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 h-10">
              <Search className="w-4 h-4 mr-1.5" /> Search
            </Button>
          </form>

          {clients.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No clients found</p>
              <p className="text-xs mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/5">
                    <th className="text-left py-3 px-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Client</th>
                    <th className="text-left py-3 px-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Email</th>
                    <th className="text-left py-3 px-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Current Theme</th>
                    <th className="text-right py-3 px-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    const clientTheme = themes.find((t) => t.key === client.selectedThemeKey);
                    return (
                      <tr key={client._id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                        <td className="py-3 px-2">
                          <span className="font-semibold text-gray-800 dark:text-gray-200">{client.companyName || client.shopName || 'Unnamed'}</span>
                        </td>
                        <td className="py-3 px-2 text-gray-500">{client.email}</td>
                        <td className="py-3 px-2">
                          {clientTheme ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: clientTheme.colorPalette?.primary || '#ccc' }} />
                              {clientTheme.name}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">
                              Default ({defaultTheme?.name || 'Luxe Commerce'})
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <select
                              className="text-xs bg-gray-50/50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              value=""
                              onChange={(e) => {
                                if (e.target.value) handleAssign(client._id, e.target.value);
                                e.target.value = '';
                              }}
                              disabled={saving === `assign-${client._id}`}
                            >
                              <option value="">Assign theme...</option>
                              {themes.filter((t) => t.isEnabled).map((t) => (
                                <option key={t.key} value={t.key}>{t.name}</option>
                              ))}
                            </select>
                            {client.selectedThemeKey && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                onClick={() => handleResetClient(client._id)}
                                disabled={saving === `reset-${client._id}`}
                              >
                                <RefreshCw className="w-3 h-3 mr-1" /> Reset
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {clientsPagination && clientsPagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg h-8 text-xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-gray-500 px-2">
                Page {clientsPagination.page} of {clientsPagination.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg h-8 text-xs"
                disabled={page >= clientsPagination.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
