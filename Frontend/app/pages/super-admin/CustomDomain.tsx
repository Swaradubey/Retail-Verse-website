import React, { useState, useEffect } from 'react';
import { Globe, Plus, CheckCircle2, AlertCircle, Trash2, ExternalLink, Loader2, RefreshCw, Info, Lock, ShieldCheck, Calendar, ShieldAlert } from 'lucide-react';
import { customDomainApi, CustomDomainData } from '../../api/customDomains';
import { clientsApi, ClientRow } from '../../api/clients';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdminRole, hasFullAdminPrivileges, normalizeRole, isClientRole } from '../../utils/staffRoles';
import { toast } from 'sonner';

export function CustomDomain() {
  const { user } = useAuth();
  const isSuper = isSuperAdminRole(user?.role) || normalizeRole(user?.role) === 'admin';
  const [domains, setDomains] = useState<CustomDomainData[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [showInstructions, setShowInstructions] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [domainsRes, clientsRes] = await Promise.all([
        customDomainApi.getAll({ pageName: 'Custom Domain' }),
        isSuper ? clientsApi.list() : Promise.resolve({ success: true, data: [] as ClientRow[] })
      ]);

      if (domainsRes.success && domainsRes.data) {
        setDomains(domainsRes.data);
      }
      if (clientsRes.success && clientsRes.data) {
        setClients(clientsRes.data);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    // For super admins, a client must be selected. For clients, their own ID is used automatically.
    if (!domainInput.trim()) return;
    if (isSuper && !selectedClientId) return;

    try {
      setAdding(true);
      const response = await customDomainApi.create({
        domainName: domainInput.trim(),
        clientId: isSuper ? selectedClientId : (user?.clientId || '')
      }, { pageName: 'Custom Domain' });
      
      if (response.success) {
        toast.success(response.message || 'Domain added successfully');
        setDomainInput('');
        if (isSuper) setSelectedClientId('');
        // Optimistic update: immediately show the new domain from API response
        if (response.data) {
          setDomains(prev => {
            // Avoid duplicate if already present
            const exists = prev.some(d => d._id === response.data!._id);
            return exists ? prev : [response.data!, ...prev];
          });
        }
        // Then re-fetch to ensure latest data from backend
        fetchData();
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to add domain';
      toast.error(
        errorMessage.includes('E11000') || errorMessage.includes('duplicate')
          ? 'Domain already exists'
          : errorMessage
      );
    } finally {
      setAdding(false);
    }
  };

  const handleCheckStatus = async (id: string) => {
    try {
      setCheckingStatus(id);
      const response = await customDomainApi.checkStatus(id, { pageName: 'Custom Domain' });
      if (response.success) {
        toast.success(`Status updated: ${response.status}`);
        // Refresh domains list to show updated status
        fetchData();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to check status');
    } finally {
      setCheckingStatus(null);
    }
  };

  const handleDeleteDomain = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this domain from our system and Vercel?')) return;

    try {
      const response = await customDomainApi.delete(id, { pageName: 'Custom Domain' });
      if (response.success) {
        toast.success('Domain removed successfully');
        fetchData();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete domain');
    }
  };

  const handleOpenDomain = (domain: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const openUrl = `https://${cleanDomain}`;
    console.log("Clicked domain:", domain);
    console.log("Final openUrl:", openUrl);
    console.log("Current hostname:", window.location.hostname);
    window.open(openUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden"
      style={{
        background: 'linear-gradient(135deg, #fffaf0 0%, #f8f4e6 40%, #f3ead2 100%)',
        minHeight: '100vh'
      }}
    >
      <div className="max-w-7xl mx-auto space-y-6 p-4 md:p-8 w-full">
        {/* Header Section */}
        <div className="rounded-2xl border border-slate-200" style={{
          background: 'rgba(255, 255, 255, 0.85)',
          boxShadow: '0 10px 30px rgba(212, 175, 55, 0.15)',
          padding: '24px',
        }}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 border border-amber-200">
              <Globe className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight">Custom Domain</h1>
              <p className="text-sm sm:text-base text-black-500 mt-0.5">Manage and connect custom domains for client websites via Vercel.</p>
            </div>
          </div>
        </div>

        {/* Add Domain Section */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 transition-all duration-300" style={{
          background: 'rgba(255, 255, 255, 0.85)',
          boxShadow: '0 10px 30px rgba(212, 175, 55, 0.15)',
        }}>
          <div className="relative p-6">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-4">Add New Domain</h2>

            <form onSubmit={handleAddDomain} className="flex flex-col lg:flex-row items-end gap-4">
              {isSuper && (
                <div className="flex-[2] space-y-2 w-full">
                  <label className="block text-lg font-medium text-slate-700">
                    Select Client
                  </label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    disabled={adding}
                    className="w-full px-4 py-3 rounded-xl border transition-all duration-300 disabled:opacity-50"
                    style={{
                      background: '#ffffff',
                      borderColor: 'rgba(212, 175, 55, 0.25)',
                      color: '#1e293b',
                    }}
                  >
                    <option value="">Select a Client</option>
                    {clients.map(client => (
                      <option key={client._id} value={client._id}>
                        {client.companyName} ({client.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex-[3] space-y-2 w-full">
                <label className="block text-lg font-medium text-slate-700">
                    Domain Name
                  </label>
                  <input
                    type="text"
                    placeholder="laxmi.com"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    disabled={adding}
                    className="w-full px-5 py-3 rounded-xl border transition-all duration-300 disabled:opacity-50"
                    style={{
                      background: '#ffffff',
                      borderColor: 'rgba(212, 175, 55, 0.25)',
                      color: '#1e293b',
                    }}
                  />
                </div>

                <div className="w-full lg:w-auto">
                  <button
                    type="submit"
                    disabled={adding || !domainInput.trim() || (isSuper && !selectedClientId)}
                    className="w-full lg:w-auto px-8 py-3 rounded-xl font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{
                      background: 'linear-gradient(135deg, #d4af37 0%, #f5d76e 100%)',
                      color: '#111827',
                      border: '1px solid rgba(212, 175, 55, 0.4)',
                      boxShadow: '0 4px 14px rgba(212, 175, 55, 0.3)',
                    }}
                  >
                    {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add Domain
                  </button>
                </div>
              </form>
            </div>
          </div>


        {/* Connected Domains Section */}
        <div className="relative overflow-hidden rounded-2xl border transition-all duration-300" style={{
          background: 'rgba(255, 255, 255, 0.85)',
          border: '1px solid rgba(212, 175, 55, 0.25)',
          boxShadow: '0 10px 30px rgba(212, 175, 55, 0.15)',
        }}>
          <div className="px-6 py-4 border-b flex justify-between items-center" style={{ borderColor: 'rgba(212, 175, 55, 0.25)' }}>
            <h2 className="font-semibold text-slate-800 text-lg sm:text-xl tracking-tight">Connected Domains</h2>
            <button
              onClick={fetchData}
              className="p-2 hover:bg-amber-100 rounded-full transition-colors text-amber-600"
              title="Refresh List"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="p-12 flex flex-col items-center justify-center text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mb-3 text-amber-500" />
                <p className="text-sm">Loading domains...</p>
              </div>
            ) : domains.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                  <Globe className="w-8 h-8 text-amber-500" />
                </div>
                <p className="text-slate-500 text-sm">No custom domains connected yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full min-w-[850px] border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="text-left py-3 pl-12 pr-4 text-sm font-semibold text-slate-600 uppercase tracking-wider border-b" style={{ borderColor: 'rgba(212, 175, 55, 0.25)' }}>
                        Domain
                      </th>
                      {isSuper && (
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 uppercase tracking-wider border-b" style={{ borderColor: 'rgba(212, 175, 55, 0.25)' }}>
                          Client
                        </th>
                      )}
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 uppercase tracking-wider border-b" style={{ borderColor: 'rgba(212, 175, 55, 0.25)' }}>
                        Created
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 uppercase tracking-wider border-b" style={{ borderColor: 'rgba(212, 175, 55, 0.25)' }}>
                        Status
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 uppercase tracking-wider border-b" style={{ borderColor: 'rgba(212, 175, 55, 0.25)' }}>
                        SSL
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 uppercase tracking-wider border-b" style={{ borderColor: 'rgba(212, 175, 55, 0.25)' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.map((item) => (
                      <tr key={item._id} className="group hover:bg-amber-50/50 transition-colors duration-150">
                        <td className="py-4 px-4 pl-12">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400/10 to-amber-600/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shrink-0">
                              <Globe className="w-4 h-4" />
                            </div>
                            <span className="font-medium text-slate-800 text-sm break-all">{item.domainName}</span>
                            <button
                              onClick={(e) => handleOpenDomain(item.domainName, e)}
                              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-500/10 transition-all duration-200"
                              title={`Open ${item.domainName}`}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        {isSuper && (
                          <td className="py-4 px-4">
                            <span className="text-slate-600 text-sm font-medium">{item.clientName}</span>
                          </td>
                        )}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-1.5 text-slate-500 text-sm">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(item.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${item.status === 'Verified'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : item.status === 'Error'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                              {item.status === 'Verified' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                              <span>{item.status}</span>
                            </div>
                            <button
                              onClick={() => handleCheckStatus(item._id)}
                              disabled={checkingStatus === item._id}
                              className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                              title="Refresh Status"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${checkingStatus === item._id ? 'animate-spin' : ''}`} />
                            </button>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${item.sslStatus === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : item.sslStatus === 'Error'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                            {item.sslStatus === 'Active' ? <ShieldCheck className="w-3.5 h-3.5" /> : item.sslStatus === 'Error' ? <ShieldAlert className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            <span>{item.sslStatus || 'Pending'}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-left">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setShowInstructions(showInstructions === item._id ? null : item._id)}
                              className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 transition-all duration-200 rounded-lg border border-transparent hover:border-amber-200"
                              title="DNS Instructions"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteDomain(item._id)}
                              className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition-all duration-200 rounded-lg border border-transparent hover:border-rose-200"
                              aria-label="Delete domain"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        
        {/* Domain Specific DNS Instructions Modal/Overlay */}
        {showInstructions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-amber-50/30">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-amber-600" />
                  DNS Instructions for {domains.find(d => d._id === showInstructions)?.domainName}
                </h3>
                <button 
                  onClick={() => setShowInstructions(null)}
                  className="p-2 hover:bg-amber-100 rounded-full transition-colors text-amber-600"
                >
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </div>
              <div className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center text-amber-700 text-xs">1</div>
                      Root Domain (A Record)
                    </h4>
                    <p className="text-sm text-slate-500">Add an A record pointing your root domain (@) to your server IP.</p>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono text-sm space-y-2">
                      <div className="flex justify-between"><span className="text-slate-400">Type:</span> <span className="font-bold">A</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Name:</span> <span className="font-bold">@</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Value:</span> <span className="font-bold">{domains.find(d => d._id === showInstructions)?.dnsInstructions?.root?.value || 'Server IP'}</span></div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center text-amber-700 text-xs">2</div>
                      WWW Subdomain (CNAME)
                    </h4>
                    <p className="text-sm text-slate-500">Add a CNAME record to point your www subdomain to your root domain.</p>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono text-sm space-y-2">
                      <div className="flex justify-between"><span className="text-slate-400">Type:</span> <span className="font-bold">CNAME</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Name:</span> <span className="font-bold">www</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Value:</span> <span className="font-bold">{domains.find(d => d._id === showInstructions)?.dnsInstructions?.subdomain?.value || domains.find(d => d._id === showInstructions)?.domainName || '@'}</span></div>
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
                  <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    DNS changes can take up to 48 hours to propagate globally, but usually happen within minutes. Once updated, click "Refresh Status" in the domain list.
                  </p>
                </div>
              </div>
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                <button 
                  onClick={() => setShowInstructions(null)}
                  className="px-6 py-2.5 rounded-xl font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
