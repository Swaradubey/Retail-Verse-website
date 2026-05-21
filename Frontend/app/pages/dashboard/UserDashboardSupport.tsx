import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router';
import { 
  Headphones, 
  Ticket, 
  Eye, 
  AlertCircle, 
  Package, 
  Mail,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Plus,
  LifeBuoy,
  X,
  Loader2,
  Send,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { useAuth } from '../../context/AuthContext';
import { UserSupportChatModal } from './UserSupportChatModal';
import ApiService from '../../api/apiService';

export function UserDashboardSupport() {
  const { user } = useAuth();
  const location = useLocation();
  const [stats, setStats] = useState({ total: 0, open: 0, resolved: 0, pending: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({ 
    subject: '', 
    description: '', 
    name: user?.name || '', 
    email: user?.email || '', 
    category: 'Customer Queries', 
    priority: 'normal' 
  });
  const [systemTickets, setSystemTickets] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingSystemTickets, setLoadingSystemTickets] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [chatTicket, setChatTicket] = useState<any>(null);

  useEffect(() => {
    fetchStats();
    fetchMyTickets();

    const handleInvalidate = () => {
      console.log('[DEBUG] Invalidating and refetching user support tickets...');
      fetchStats();
      fetchMyTickets();
    };

    window.addEventListener('invalidate-support-tickets', handleInvalidate);
    return () => {
      window.removeEventListener('invalidate-support-tickets', handleInvalidate);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ticketId = params.get('ticketId');
    if (ticketId && systemTickets.length > 0) {
      const found = systemTickets.find((t: any) => t._id === ticketId);
      if (found) {
        setSelectedTicket(found);
        setIsDetailModalOpen(true);
      }
    }
  }, [location.search, systemTickets]);

  useEffect(() => {
    let result = systemTickets;

    // Filter by status
    if (statusFilter !== "all") {
      result = result.filter((t: any) => String(t.status).toLowerCase() === statusFilter.toLowerCase());
    }

    // Filter by search query
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      result = result.filter((t: any) => 
        (t.subject && t.subject.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.status && t.status.toLowerCase().includes(q)) ||
        (t.issueType && t.issueType.toLowerCase().includes(q))
      );
    }

    setFilteredTickets(result);
  }, [searchQuery, statusFilter, systemTickets]);

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await ApiService.get('/support-tickets/my/stats');
      if (res.success && res.data) {
        setStats(res.data);
      }
    } catch(err) {
      console.error("[User Support Stats Error]", err);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchMyTickets = async () => {
    setLoadingSystemTickets(true);
    try {
      const res = await ApiService.get('/support-tickets/my');
      if (res.success && res.data) {
        setSystemTickets(res.data);
        setFilteredTickets(res.data);
      }
    } catch (err) {
      console.error("[User Tickets Error]", err);
    } finally {
      setLoadingSystemTickets(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingTicket(true);
    try {
      const categoryToIssueType: Record<string, string> = {
        'Customer Queries': 'other',
        'Reported Issues': 'payment_issue',
        'Order Support': 'order_tracking_issue'
      };

      const payload = {
        subject: ticketForm.subject,
        description: ticketForm.description,
        issueType: categoryToIssueType[ticketForm.category] || 'other',
        priority: ticketForm.priority
      };

      const res = await ApiService.post('/support-tickets', payload);
      if (res.success) {
        toast.success("Support ticket submitted successfully.");
        setIsModalOpen(false);
        setTicketForm({ 
          subject: '', 
          description: '', 
          name: user?.name || '', 
          email: user?.email || '', 
          category: 'Customer Queries', 
          priority: 'normal' 
        });
        fetchStats();
        fetchMyTickets();
      } else {
        toast.error(res.message || "Failed to create ticket.");
      }
    } catch(err: any) {
       toast.error(err.message || "Network error.");
    } finally {
       setCreatingTicket(false);
    }
  };

  const openLatestChat = () => {
    if (systemTickets.length > 0) {
      const latest = systemTickets[0];
      setChatTicket(latest);
      setIsChatModalOpen(true);
    } else {
      toast.info("You don't have any tickets yet. Please create a new ticket first.");
    }
  };

  const openTicketChat = (t: any) => {
    setChatTicket(t);
    setIsChatModalOpen(true);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-gray-900 via-gray-700 to-gray-800 dark:from-white dark:via-gray-200 dark:to-gray-300 bg-clip-text text-transparent">
              My Support Center
            </h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-xl">
            Track your support requests, view resolutions, and get help with your orders all in one place.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <button 
            onClick={openLatestChat}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 font-semibold hover:bg-gray-50 dark:hover:bg-zinc-700 transition-all duration-300 ease-out hover:scale-[1.05] shadow-sm">
            <MessageSquare className="w-4 h-4 text-amber-500" />
            Open Chat
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold transition-all duration-300 ease-out hover:scale-[1.05] shadow-[0_4px_14px_0_rgba(245,158,11,0.39)] hover:shadow-[0_6px_20px_rgba(245,158,11,0.23)] border-none">
            <Ticket className="w-4 h-4" />
            New Ticket
          </button>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "My Total Tickets", value: loadingStats ? "..." : (stats.total || "0"), icon: Ticket, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-500/20" },
          { label: "Open", value: loadingStats ? "..." : (stats.open || "0"), icon: AlertCircle, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-500/20" },
          { label: "Resolved", value: loadingStats ? "..." : (stats.resolved || "0"), icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-500/20" },
          { label: "Pending", value: loadingStats ? "..." : (stats.pending || "0"), icon: Clock, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-500/20" },
        ].map((stat, idx) => (
          <Card key={idx} className="border border-gray-100 dark:border-white/5 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 rounded-2xl overflow-hidden group">
            <div className="p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white group-hover:scale-105 transition-transform origin-left">{stat.value}</h3>
              </div>
              <div className={`w-12 h-12 rounded-full ${stat.bg} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Action Bar (Search & Filter) */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-sm p-2 md:p-3 rounded-2xl border border-gray-100 dark:border-zinc-800/80 shadow-sm mt-2">
        <div className="relative w-full sm:w-96 pl-2">
          <Search className="w-4 h-4 text-gray-400 absolute left-5 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search your tickets..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-none rounded-xl pl-10 pr-4 py-2 text-sm outline-none placeholder:text-gray-400 text-gray-800 dark:text-gray-200 focus:ring-0"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto pr-2 pb-2 sm:pb-0">
          <div className="relative flex items-center bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 transition-colors w-full sm:w-auto">
            <Filter className="w-4 h-4 mr-2 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent border-none p-0 outline-none text-sm font-semibold text-gray-700 dark:text-gray-200 focus:ring-0 cursor-pointer pr-8"
            >
              <option value="all" className="bg-white dark:bg-zinc-800 text-gray-900 dark:text-white">Status: All</option>
              <option value="open" className="bg-white dark:bg-zinc-800 text-gray-900 dark:text-white">Status: Open</option>
              <option value="pending" className="bg-white dark:bg-zinc-800 text-gray-900 dark:text-white">Status: Pending</option>
              <option value="resolved" className="bg-white dark:bg-zinc-800 text-gray-900 dark:text-white">Status: Resolved</option>
            </select>
          </div>
        </div>
      </div>

      {/* Categories Cards */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white px-1">How can we help?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button onClick={() => { setIsModalOpen(true); setTicketForm(p => ({...p, category: 'Customer Queries'})); }} className="text-left w-full group">
            <Card className="group relative border border-gray-100/80 bg-gradient-to-br from-white to-gray-50/80 shadow-sm dark:border-white/5 dark:from-zinc-900/80 dark:to-zinc-900/40 rounded-[20px] transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/5">
              <CardHeader className="flex flex-row items-center gap-4 pb-2 pt-6">
                <div className="w-12 h-12 rounded-[14px] bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:bg-blue-100 dark:group-hover:bg-blue-500/20">
                  <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors" />
                </div>
                <CardTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">Customer Queries</CardTitle>
              </CardHeader>
              <CardContent className="pb-6 relative z-10">
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed pr-2">
                  General questions about products, accounts, or our premium services.
                </p>
              </CardContent>
            </Card>
          </button>

          <button onClick={() => { setIsModalOpen(true); setTicketForm(p => ({...p, category: 'Reported Issues'})); }} className="text-left w-full group">
            <Card className="group relative border border-gray-100/80 bg-gradient-to-br from-white to-gray-50/80 shadow-sm dark:border-white/5 dark:from-zinc-900/80 dark:to-zinc-900/40 rounded-[20px] transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-500/5">
              <CardHeader className="flex flex-row items-center gap-4 pb-2 pt-6">
                <div className="w-12 h-12 rounded-[14px] bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:bg-rose-100 dark:group-hover:bg-rose-500/20">
                  <AlertCircle className="w-6 h-6 text-rose-600 dark:text-rose-400 group-hover:text-rose-700 dark:group-hover:text-rose-300 transition-colors" />
                </div>
                <CardTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">Reported Issues</CardTitle>
              </CardHeader>
              <CardContent className="pb-6 relative z-10">
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed pr-2">
                  Technical difficulties, bugs, or problems with the checkout process.
                </p>
              </CardContent>
            </Card>
          </button>

          <button onClick={() => { setIsModalOpen(true); setTicketForm(p => ({...p, category: 'Order Support'})); }} className="text-left w-full group">
            <Card className="group relative border border-gray-100/80 bg-gradient-to-br from-white to-gray-50/80 shadow-sm dark:border-white/5 dark:from-zinc-900/80 dark:to-zinc-900/40 rounded-[20px] transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-500/5">
              <CardHeader className="flex flex-row items-center gap-4 pb-2 pt-6">
                <div className="w-12 h-12 rounded-[14px] bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/20">
                  <Package className="w-6 h-6 text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors" />
                </div>
                <CardTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">Order Support</CardTitle>
              </CardHeader>
              <CardContent className="pb-6 relative z-10">
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed pr-2">
                  Assistance with delivery, tracking, refunds, or cancellations.
                </p>
              </CardContent>
            </Card>
          </button>
        </div>
      </div>

      {/* My Tickets Area */}
      <div className="pt-2">
        <div className="flex items-center justify-between px-1 mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">My Support History</h2>
          <button 
            onClick={fetchMyTickets}
            className="text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors flex items-center gap-1"
          >
            <Clock className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
        
        {loadingSystemTickets ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-500 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm font-medium">Loading your tickets...</p>
          </div>
        ) : systemTickets.length === 0 ? (
          <Card className="border border-dashed border-gray-300 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/20 shadow-none rounded-[24px] overflow-hidden">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center relative">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="relative w-24 h-24 mb-6 group">
                <div className="bg-white dark:bg-zinc-800 rounded-full w-full h-full flex items-center justify-center shadow-lg border border-gray-100 dark:border-zinc-700 relative z-10">
                   <Headphones className="w-10 h-10 text-amber-500" />
                </div>
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">No Support Requests</h3>
              <p className="text-gray-500 dark:text-gray-400 text-[15px] max-w-sm mb-8 leading-relaxed">
                Need help? Raise a ticket or select a category above and our team will assist you.
              </p>
              
              <button 
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-zinc-900 font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-all duration-300 ease-out hover:scale-[1.03] shadow-md hover:shadow-lg">
                <Plus className="w-4 h-4" />
                Create First Ticket
              </button>
            </CardContent>
          </Card>
        ) : filteredTickets.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-500 gap-3 text-center">
            <Ticket className="w-10 h-10 text-gray-400 opacity-60" />
            <p className="text-base font-bold text-gray-800 dark:text-gray-200">No matching tickets found</p>
            <p className="text-sm text-gray-500">Try adjusting your filters or search query.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredTickets.map((t: any) => (
              <Card key={t._id} className="border border-gray-100 dark:border-white/5 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 rounded-2xl overflow-hidden group">
                <div className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 items-center mb-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                        {t.issueType?.replace(/_/g, ' ')}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        t.status === 'open' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' :
                        t.status === 'resolved' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' :
                        'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                      }`}>
                        {t.status}
                      </span>
                      {t.priority && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                          {t.priority}
                        </span>
                      )}
                      {t.orderRef && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          #{t.orderRef}
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-gray-900 dark:text-white text-lg mb-1 truncate group-hover:text-amber-600 transition-colors">
                      {t.subject}
                    </h4>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Submitted: {new Date(t.createdAt).toLocaleDateString()}
                      </div>
                      {t.adminResponse && (
                        <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Reply Received
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button 
                      onClick={() => openTicketChat(t)}
                      className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white transition-all duration-300 font-semibold shadow-sm flex items-center justify-center gap-2"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Chat
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedTicket(t);
                        setIsDetailModalOpen(true);
                      }}
                      className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 hover:bg-gray-900 hover:text-white dark:hover:bg-white dark:hover:text-zinc-900 transition-all duration-300 font-semibold shadow-sm flex items-center justify-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      Details
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      }
      </div>

      {/* Modals implementation */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-lg bg-white dark:bg-zinc-900 p-6 shadow-2xl relative rounded-2xl">
             <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition">
                <X className="w-5 h-5" />
             </button>
             <h2 className="text-2xl font-bold mb-6 dark:text-white">Submit Support Ticket</h2>
             <form onSubmit={handleCreateTicket} className="space-y-4">
                <div className="flex flex-col gap-1">
                   <label className="text-sm font-semibold dark:text-gray-300">Subject</label>
                   <input required type="text" className="w-full px-3 py-2 rounded-lg border dark:border-zinc-700 dark:bg-zinc-800 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none" value={ticketForm.subject} onChange={e => setTicketForm({...ticketForm, subject: e.target.value})} placeholder="What's the issue?" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1">
                      <label className="text-sm font-semibold dark:text-gray-300">Category</label>
                      <select className="w-full px-3 py-2 rounded-lg border dark:border-zinc-700 dark:bg-zinc-800 dark:text-white outline-none" value={ticketForm.category} onChange={e => setTicketForm({...ticketForm, category: e.target.value})}>
                         <option value="Customer Queries">Customer Queries</option>
                         <option value="Reported Issues">Reported Issues</option>
                         <option value="Order Support">Order Support</option>
                      </select>
                   </div>
                   <div className="flex flex-col gap-1">
                      <label className="text-sm font-semibold dark:text-gray-300">Priority</label>
                      <select className="w-full px-3 py-2 rounded-lg border dark:border-zinc-700 dark:bg-zinc-800 dark:text-white outline-none" value={ticketForm.priority} onChange={e => setTicketForm({...ticketForm, priority: e.target.value as any})}>
                         <option value="low">Low</option>
                         <option value="normal">Normal</option>
                         <option value="high">High</option>
                         <option value="urgent">Urgent</option>
                      </select>
                   </div>
                </div>
                <div className="flex flex-col gap-1">
                   <label className="text-sm font-semibold dark:text-gray-300">Detailed Description</label>
                   <textarea required rows={4} className="w-full px-3 py-2 rounded-lg border dark:border-zinc-700 dark:bg-zinc-800 dark:text-white outline-none focus:ring-2 focus:ring-amber-500" value={ticketForm.description} onChange={e => setTicketForm({...ticketForm, description: e.target.value})} placeholder="Tell us more about the issue..."></textarea>
                </div>
                <button type="submit" disabled={creatingTicket} className="w-full flex items-center justify-center gap-2 py-3 mt-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold transition disabled:opacity-50 shadow-lg shadow-amber-500/30">
                  {creatingTicket ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5" />}
                  {creatingTicket ? "Sending..." : "Submit to Zendesk Support"}
                </button>
             </form>
          </Card>
        </div>
      )}

      {/* Detail Modal */}
      {isDetailModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <Card className="w-full max-w-2xl bg-white dark:bg-zinc-900 shadow-2xl relative overflow-hidden rounded-[24px] border-none">
            <div className="p-6 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-gray-50/50 dark:bg-zinc-800/30 relative z-10">
              <div>
                <h2 className="text-2xl font-bold dark:text-white flex items-center gap-2">
                  <Ticket className="w-6 h-6 text-amber-500" /> 
                  Support Ticket Record
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ref ID: {selectedTicket._id}</p>
              </div>
              <button 
                onClick={() => setIsDetailModalOpen(false)} 
                className="p-2.5 rounded-full bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700 shadow-sm transition hover:rotate-90 duration-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 max-h-[70vh] overflow-y-auto relative z-10">
              <div className="flex flex-wrap gap-3 mb-6">
                <div className={`px-4 py-2 rounded-xl text-sm font-bold capitalize flex items-center gap-2 ${
                  selectedTicket.status === 'open' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' :
                  selectedTicket.status === 'resolved' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' :
                  'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                }`}>
                   <div className={`w-2 h-2 rounded-full ${
                     selectedTicket.status === 'open' ? 'bg-rose-500' :
                     selectedTicket.status === 'resolved' ? 'bg-emerald-500' :
                     'bg-blue-500'
                   } animate-pulse`} />
                   {selectedTicket.status}
                </div>
                <div className="px-4 py-2 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 text-sm font-bold">
                  {selectedTicket.priority || 'Normal'} Priority
                </div>
                {selectedTicket.orderRef && (
                  <div className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 text-sm font-bold">
                    Order #{selectedTicket.orderRef}
                  </div>
                )}
              </div>
              
              <div className="mb-6">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Subject</h4>
                <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{selectedTicket.subject}</p>
              </div>
              
              <div className="mb-6">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">My Message</h4>
                <div className="bg-gray-50 dark:bg-zinc-800/30 rounded-2xl p-6 text-gray-700 dark:text-gray-300 leading-relaxed text-sm whitespace-pre-wrap border border-gray-100 dark:border-zinc-800">
                  {selectedTicket.description}
                </div>
              </div>

              {selectedTicket.adminResponse && (
                <div className="mb-6">
                  <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-2">Admin Response</h4>
                  <div className="bg-emerald-50/50 dark:bg-emerald-900/10 rounded-2xl p-6 text-emerald-900 dark:text-emerald-100 leading-relaxed text-sm whitespace-pre-wrap border border-emerald-100 dark:border-emerald-900/30">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        {selectedTicket.adminResponse}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-8 pt-6 border-t border-gray-100 dark:border-zinc-800 text-xs text-gray-500 dark:text-gray-400 flex flex-col gap-2">
                <p>Synced with Zendesk: <span className="font-mono text-amber-600">{selectedTicket.zendeskTicketId || "Processing"}</span></p>
                <p>Date Submitted: {new Date(selectedTicket.createdAt).toLocaleString()}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Chat Modal Integration */}
      <UserSupportChatModal 
        isOpen={isChatModalOpen}
        onClose={() => setIsChatModalOpen(false)}
        ticket={chatTicket}
      />

    </div>
  );
}
