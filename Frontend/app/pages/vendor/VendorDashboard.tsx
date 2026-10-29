import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Package,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  LogOut,
  Mail,
  Phone,
  Building,
  ShieldCheck,
  Search,
  RefreshCw,
  DollarSign,
  User,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { useNavigate } from 'react-router';
import ApiService from '../../api/apiService';
import { formatINR } from '../../utils/formatINR';

interface RequirementItem {
  id: string;
  title: string;
  category: string;
  quantity: string | number;
  urgency: string;
  status: string;
  dueDate: string;
  totalAmount?: number;
}

export function VendorDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'requirements' | 'profile'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [requirements, setRequirements] = useState<RequirementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const loadVendorData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await ApiService.get<any[]>('/quotes');
      if (res && res.success && Array.isArray(res.data)) {
        const mapped: RequirementItem[] = res.data.map((q: any) => {
          const productList = Array.isArray(q.products) ? q.products : [];
          const totalUnits = productList.reduce((sum: number, p: any) => sum + (Number(p.quantity) || 1), 0);
          const firstProduct = productList[0];
          const titles = productList.map((p: any) => p.name).filter(Boolean).join(', ');
          
          let formattedDate = '—';
          if (q.validUntil) {
            formattedDate = new Date(q.validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          } else if (q.createdAt) {
            formattedDate = new Date(q.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          }

          return {
            id: q.quoteNumber || q._id,
            title: titles || q.message || 'Procurement Requirement',
            category: firstProduct?.category || 'General',
            quantity: totalUnits > 0 ? `${totalUnits} Units` : '1 Unit',
            urgency: q.status === 'pending' ? 'Normal' : 'Standard',
            status: q.status || 'pending',
            dueDate: formattedDate,
            totalAmount: q.finalPrice ?? q.requestedPrice ?? q.originalTotal ?? 0,
          };
        });
        setRequirements(mapped);
      } else {
        setRequirements([]);
      }
    } catch {
      setRequirements([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadVendorData();
  }, [loadVendorData]);

  const activeCount = requirements.filter(r => r.status === 'pending' || r.status === 'countered').length;
  const pendingQuotesCount = requirements.filter(r => r.status === 'pending').length;
  const completedCount = requirements.filter(r => r.status === 'accepted' || r.status === 'approved').length;
  const fulfillmentRate = requirements.length > 0
    ? Math.round((completedCount / requirements.length) * 100)
    : 0;

  const filteredRequirements = requirements.filter((req) =>
    req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    req.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    req.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    req.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 transition-colors">
      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                Vendor Portal
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Welcome back, {user?.name || 'Partner'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your client procurement requirements, quotes, and fulfillment milestones.
            </p>
          </div>

          {/* Navigation Pill Tabs */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-200/80 dark:bg-zinc-900 p-1 rounded-2xl w-fit">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'overview'
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('requirements')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'requirements'
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Requirements ({requirements.length})
              </button>
              <button
                onClick={() => setActiveTab('profile')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'profile'
                    ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Vendor Profile
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadVendorData(true)}
              disabled={refreshing || loading}
              className="h-9 w-9 p-0 rounded-xl border-slate-200 dark:border-zinc-800"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <Card className="rounded-2xl border-slate-200 dark:border-zinc-800/80 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Active Requirements
                  </CardTitle>
                  <FileText className="w-4 h-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black">
                    {loading ? <span className="inline-block w-8 h-7 bg-slate-200 dark:bg-zinc-800 rounded animate-pulse" /> : activeCount}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeCount === 1 ? '1 requirement active' : `${activeCount} requirements active`}
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-slate-200 dark:border-zinc-800/80 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Pending Quotes
                  </CardTitle>
                  <Clock className="w-4 h-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black">
                    {loading ? <span className="inline-block w-8 h-7 bg-slate-200 dark:bg-zinc-800 rounded animate-pulse" /> : pendingQuotesCount}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {pendingQuotesCount === 0 ? 'No quotes pending review' : `${pendingQuotesCount} awaiting quote response`}
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-slate-200 dark:border-zinc-800/80 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Fulfillment Rate
                  </CardTitle>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black">
                    {loading ? <span className="inline-block w-12 h-7 bg-slate-200 dark:bg-zinc-800 rounded animate-pulse" /> : `${fulfillmentRate}%`}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    {requirements.length > 0 ? `${completedCount} of ${requirements.length} accepted` : 'No orders yet'}
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-slate-200 dark:border-zinc-800/80 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Settlement Status
                  </CardTitle>
                  <DollarSign className="w-4 h-4 text-violet-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black">
                    {loading ? <span className="inline-block w-16 h-7 bg-slate-200 dark:bg-zinc-800 rounded animate-pulse" /> : 'Cleared'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Zero pending disputes
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Latest Requirements List View */}
            <Card className="rounded-3xl border-slate-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <CardHeader className="border-b border-slate-100 dark:border-zinc-800/60 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold">Latest Client Requirements</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Procurement requests published by your client organization
                    </CardDescription>
                  </div>
                  {requirements.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTab('requirements')}
                      className="text-xs rounded-xl"
                    >
                      View All ({requirements.length})
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 space-y-3">
                    <div className="h-6 bg-slate-100 dark:bg-zinc-800/60 rounded animate-pulse" />
                    <div className="h-6 bg-slate-100 dark:bg-zinc-800/60 rounded animate-pulse" />
                    <div className="h-6 bg-slate-100 dark:bg-zinc-800/60 rounded animate-pulse" />
                  </div>
                ) : requirements.length === 0 ? (
                  <div className="py-16 px-4 flex flex-col items-center justify-center text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-zinc-900 border border-blue-100 dark:border-zinc-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
                      <Package className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200">No Requirements Found</h3>
                      <p className="text-xs text-muted-foreground max-w-sm">
                        No procurement requirements or quotes have been published by your client organization yet. Any new requests will appear here automatically.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-zinc-900/60 text-muted-foreground uppercase tracking-wider text-[10px] font-bold border-b border-slate-100 dark:border-zinc-800/60">
                        <tr>
                          <th className="px-6 py-3.5">Req ID</th>
                          <th className="px-6 py-3.5">Requirement Details</th>
                          <th className="px-6 py-3.5">Category</th>
                          <th className="px-6 py-3.5">Quantity</th>
                          <th className="px-6 py-3.5">Due Date</th>
                          <th className="px-6 py-3.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/40 font-medium">
                        {requirements.slice(0, 5).map((req) => (
                          <tr key={req.id} className="hover:bg-slate-50/70 dark:hover:bg-zinc-900/30 transition-colors">
                            <td className="px-6 py-4 font-mono font-bold text-blue-600 dark:text-blue-400">{req.id}</td>
                            <td className="px-6 py-4 font-semibold text-slate-800 dark:text-zinc-200">{req.title}</td>
                            <td className="px-6 py-4 text-muted-foreground">{req.category}</td>
                            <td className="px-6 py-4 text-slate-700 dark:text-zinc-300">{req.quantity}</td>
                            <td className="px-6 py-4 text-muted-foreground">{req.dueDate}</td>
                            <td className="px-6 py-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${
                                  req.status === 'accepted' || req.status === 'approved'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : req.status === 'pending'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                }`}
                              >
                                {req.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Requirements Tab */}
        {activeTab === 'requirements' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-11 rounded-xl text-xs bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800"
                  placeholder="Search requirements, products, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-48 rounded-2xl bg-slate-100 dark:bg-zinc-900 animate-pulse border border-slate-200 dark:border-zinc-800" />
                ))}
              </div>
            ) : filteredRequirements.length === 0 ? (
              <div className="py-20 px-4 flex flex-col items-center justify-center text-center space-y-3 bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-400">
                  <FileText className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-800 dark:text-zinc-200">
                    {searchQuery ? 'No Matching Requirements' : 'No Procurement Requirements Found'}
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-md">
                    {searchQuery
                      ? `No records found matching "${searchQuery}". Clear your search query to see all items.`
                      : 'Your client organization has not created any procurement requests or quotation requirements yet.'}
                  </p>
                </div>
                {searchQuery && (
                  <Button variant="outline" size="sm" onClick={() => setSearchQuery('')} className="rounded-xl text-xs mt-2">
                    Clear Search
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredRequirements.map((req) => (
                  <Card key={req.id} className="rounded-2xl border-slate-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{req.id}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                            req.status === 'accepted' || req.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : req.status === 'pending'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                      <CardTitle className="text-base font-bold line-clamp-2">{req.title}</CardTitle>
                      <CardDescription className="text-xs">Category: {req.category}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-0">
                      <div className="bg-slate-50 dark:bg-zinc-900/50 p-3 rounded-xl space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Target Volume:</span>
                          <span className="font-semibold">{req.quantity}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Date:</span>
                          <span className="font-semibold">{req.dueDate}</span>
                        </div>
                        {req.totalAmount != null && req.totalAmount > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Value:</span>
                            <span className="font-semibold">{formatINR(req.totalAmount)}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto"
          >
            <Card className="rounded-3xl border-slate-200 dark:border-zinc-800 shadow-sm p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-4 border-b border-slate-100 dark:border-zinc-800/80 pb-6">
                <div className="h-14 w-14 rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 flex items-center justify-center font-bold text-xl">
                  {user?.name?.[0]?.toUpperCase() || 'V'}
                </div>
                <div>
                  <h2 className="text-lg font-bold">{user?.name || 'Authorized Vendor'}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Verified Vendor
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">Role: {user?.role || 'VENDOR'}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 text-xs font-medium">
                <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Email Address</p>
                    <p className="text-sm font-semibold mt-0.5">{user?.email || '—'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Contact Phone</p>
                    <p className="text-sm font-semibold mt-0.5">{user?.phone || 'Not configured'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60">
                  <Building className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Client Organization ID</p>
                    <p className="text-sm font-mono font-semibold mt-0.5">{user?.clientId || 'Linked Organization'}</p>
                  </div>
                </div>

                {user?.lastLoginAt && (
                  <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60">
                    <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Last Login Session</p>
                      <p className="text-sm font-semibold mt-0.5">
                        {new Date(user.lastLoginAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-zinc-800/80 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Credentials managed by organization admin.</span>
                <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-xl text-xs gap-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                  <LogOut className="w-3.5 h-3.5" /> Logout
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </main>
    </div>
  );
}
export default VendorDashboard;
