import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Send,
  Paperclip,
  Smile,
  CheckCheck,
  Inbox,
  Star,
  Archive,
  Trash2,
  AlertCircle,
  Plus,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import { useAuth } from '../../context/AuthContext';
import {
  inboxApi,
  type InboxConversationListItem,
  type InboxConversationDetail,
  type InboxMessage,
} from '../../api/inbox';

function avatarUrlForConversation(id: string) {
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(id)}`;
}

function formatMessageTime(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'Yesterday';
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / (86400 * 1000));
  if (days >= 2 && days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function listTimeLabel(item: InboxConversationListItem) {
  return formatMessageTime(item.lastMessageAt || item.updatedAt);
}

export function DashboardInbox() {
  const { user, token, isLoading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<InboxConversationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InboxConversationDetail | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newFirstMessage, setNewFirstMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [showConversations, setShowConversations] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchList = useCallback(async () => {
    if (!token) {
      setConversations([]);
      return;
    }
    setListLoading(true);
    setLoadError(null);
    try {
      const res = await inboxApi.list(debouncedSearch || undefined);
      console.log('[Inbox Page] GET /api/inbox', res);
      if (res.success && Array.isArray(res.data)) {
        setConversations(res.data);
      } else {
        throw new Error((res as { message?: string }).message || 'Invalid inbox response');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load inbox';
      console.error('[Inbox Page] list error', e);
      setLoadError(msg);
      toast.error(msg);
      setConversations([]);
    } finally {
      setListLoading(false);
    }
  }, [token, debouncedSearch]);

  useEffect(() => {
    if (authLoading) return;
    fetchList();
  }, [authLoading, fetchList]);

  const fetchDetail = useCallback(
    async (id: string) => {
      if (!token || !id) return;
      setDetailLoading(true);
      try {
        const res = await inboxApi.getById(id);
        console.log('[Inbox Page] GET /api/inbox/:id', res);
        if (res.success && res.data) {
          const d = res.data as InboxConversationDetail;
          setDetail(d);
          try {
            const readRes = await inboxApi.markRead(id);
            console.log('[Inbox Page] PATCH /api/inbox/:id/read', readRes);
            if (readRes.success && readRes.data) {
              const u = readRes.data;
              setDetail((prev) =>
                prev && prev.id === id ? { ...prev, unreadCount: u.unreadCount } : prev
              );
              setConversations((prev) =>
                prev.map((c) => (c.id === id ? { ...c, unreadCount: u.unreadCount } : c))
              );
            }
          } catch (markErr) {
            console.error('[Inbox Page] markRead error', markErr);
          }
          await fetchList();
        } else {
          throw new Error((res as { message?: string }).message || 'Failed to load conversation');
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load conversation';
        console.error('[Inbox Page] detail error', e);
        toast.error(msg);
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [token, fetchList]
  );

  useEffect(() => {
    if (authLoading || !token) return;
    if (conversations.length === 0) {
      setSelectedId(null);
      setDetail(null);
      return;
    }
    if (selectedId && conversations.some((c) => c.id === selectedId)) return;
    const first = conversations[0];
    setSelectedId(first.id);
  }, [authLoading, token, conversations, selectedId]);

  useEffect(() => {
    if (!selectedId || !token) {
      setDetail(null);
      return;
    }
    fetchDetail(selectedId);
  }, [selectedId, token, fetchDetail]);

  const selectedSummary = conversations.find((c) => c.id === selectedId) || null;

  const newCount = conversations.filter((c) => c.unreadCount > 0).length;

  const sendReply = async () => {
    const text = replyText.trim();
    if (!selectedId || !text || !token) return;
    setSending(true);
    try {
      const res = await inboxApi.appendMessage(selectedId, {
        text,
        senderType: 'admin',
        senderName: user?.name,
        senderEmail: user?.email,
      });
      console.log('[Inbox Page] POST /api/inbox/:id/messages', res);
      if (res.success && res.data) {
        setDetail(res.data as InboxConversationDetail);
        setReplyText('');
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId
              ? {
                  ...c,
                  lastMessage: (res.data as InboxConversationDetail).lastMessage,
                  lastMessageAt: (res.data as InboxConversationDetail).lastMessageAt,
                  unreadCount: (res.data as InboxConversationDetail).unreadCount,
                }
              : c
          )
        );
        await fetchList();
        toast.success('Message sent');
      } else {
        throw new Error((res as { message?: string }).message || 'Send failed');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to send';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const resetNewConversationForm = () => {
    setNewCustomerName('');
    setNewCustomerEmail('');
    setNewSubject('');
    setNewFirstMessage('');
  };

  const createConversation = async () => {
    const name = newCustomerName.trim();
    const subject = newSubject.trim();
    const text = newFirstMessage.trim();
    if (!token || !name || !subject || !text) {
      toast.error('Name, subject, and first message are required.');
      return;
    }
    setCreating(true);
    try {
      const res = await inboxApi.create({
        customerName: name,
        customerEmail: newCustomerEmail.trim() || undefined,
        subject,
        text,
      });
      console.log('[Inbox Page] POST /api/inbox', res);
      if (res.success && res.data) {
        const created = res.data as InboxConversationDetail;
        toast.success('Conversation created');
        setNewOpen(false);
        resetNewConversationForm();
        await fetchList();
        setSelectedId(created.id);
        setDetail(created);
      } else {
        throw new Error((res as { message?: string }).message || 'Create failed');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create conversation';
      console.error('[Inbox Page] create error', e);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const adminInitial =
    user?.name?.trim()?.charAt(0)?.toUpperCase() ||
    user?.email?.trim()?.charAt(0)?.toUpperCase() ||
    'E';

  return (
    <div className="h-[calc(100vh-280px)] flex gap-6 overflow-hidden flex-col md:flex-row">
      <Card className={`w-full md:w-1/3 border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-2xl overflow-hidden flex flex-col ${showConversations ? 'flex' : 'hidden'} md:flex`}>
        <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-4">
          <div className="flex items-center justify-between mb-4 gap-2">
            <CardTitle className="text-xl font-bold">Inbox</CardTitle>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg text-xs font-semibold gap-1"
                disabled={!token || authLoading}
                onClick={() => {
                  resetNewConversationForm();
                  setNewOpen(true);
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                New
              </Button>
              <div className="flex items-center gap-1.5 p-1 px-2 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 text-[10px] font-black uppercase tracking-wider">
                {newCount} New
              </div>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
            />
          </div>
          {!token && !authLoading && (
            <p className="text-xs text-muted-foreground mt-2">Sign in to load your inbox from the server.</p>
          )}
          {loadError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">{loadError}</p>
          )}
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="divide-y divide-gray-100 dark:divide-white/5">
            {listLoading && conversations.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Loading conversations…</div>
            )}
            {!listLoading && token && conversations.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">
                No conversations yet. Use <span className="font-semibold text-foreground">New</span> to start
                one.
              </div>
            )}
            {conversations.map((msg) => {
              const unread = msg.unreadCount > 0;
              const av = avatarUrlForConversation(msg.id);
              return (
                <motion.div
                  key={msg.id}
                  onClick={() => {
                    setSelectedId(msg.id);
                    setShowConversations(false);
                  }}
                  className={`p-4 cursor-pointer relative group flex items-start gap-3 transition-all duration-300 ${
                    selectedId === msg.id
                      ? 'bg-blue-50/50 dark:bg-blue-500/5'
                      : 'hover:bg-gray-50/50 dark:hover:bg-white/[0.02]'
                  }`}
                >
                  {selectedId === msg.id && (
                    <div className="absolute left-0 top-0 w-1 h-full bg-blue-500" />
                  )}

                  <div className="w-10 h-10 rounded-full border border-gray-100 dark:border-white/10 overflow-hidden shrink-0">
                    <img src={av} alt={msg.customerName} className="w-full h-full object-cover" />
                  </div>

                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-sm tracking-tight ${unread ? 'font-black text-foreground' : 'font-semibold text-muted-foreground'}`}
                      >
                        {msg.customerName}
                      </span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {listTimeLabel(msg)}
                      </span>
                    </div>
                    <h4
                      className={`text-xs truncate mb-1 ${unread ? 'font-bold' : 'font-medium opacity-70'}`}
                    >
                      {msg.subject}
                    </h4>
                    <p className="text-[10px] text-muted-foreground truncate opacity-80">
                      {msg.preview || msg.lastMessage}
                    </p>
                  </div>

                  {unread && (
                    <div className="w-2 h-2 rounded-full bg-blue-600 mt-2 shrink-0 animate-pulse shadow-sm shadow-blue-500/50" />
                  )}
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className={`flex-1 border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-2xl overflow-hidden flex flex-col ${!showConversations ? 'flex' : 'hidden'} md:flex`}>
        <AnimatePresence mode="wait">
          {selectedSummary && selectedId ? (
            <motion.div
              key={selectedId}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col h-full"
            >
              <CardHeader className="border-b border-gray-100 dark:border-white/5 flex flex-row items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowConversations(true)}
                    className="md:hidden p-2 -ml-2 text-gray-500 hover:text-gray-800 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="w-10 h-10 rounded-full border border-gray-200 dark:border-white/10 overflow-hidden">
                    <img
                      src={avatarUrlForConversation(selectedId)}
                      alt={selectedSummary.customerName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <CardTitle className="text-base font-bold truncate">
                      {selectedSummary.customerName}
                    </CardTitle>
                    <CardDescription className="text-[10px] truncate">
                      {selectedSummary.subject}
                      {selectedSummary.customerEmail
                        ? ` · ${selectedSummary.customerEmail}`
                        : ''}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl opacity-60 hover:opacity-100">
                    <Star className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl opacity-60 hover:opacity-100">
                    <Archive className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl opacity-60 hover:opacity-100 text-rose-500">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl opacity-60 hover:opacity-100 text-amber-500">
                    <AlertCircle className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="flex-1 p-6 overflow-y-auto bg-gray-50/10 dark:bg-black/5 custom-scrollbar">
                {detailLoading && (
                  <div className="text-sm text-muted-foreground text-center py-8">Loading messages…</div>
                )}
                {!detailLoading && detail && (
                  <div className="max-w-3xl mx-auto space-y-6 flex flex-col">
                    {(detail.messages || []).map((m: InboxMessage) => {
                      const isAdmin = m.senderType === 'admin';
                      const sideClass = isAdmin ? 'flex-row-reverse' : '';
                      return (
                        <div key={m.id} className={`flex items-start gap-4 ${sideClass}`}>
                          {isAdmin ? (
                            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mt-1 shadow-lg shadow-blue-500/20">
                              <span className="text-[10px] font-black text-white">{adminInitial}</span>
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full border border-gray-200 dark:border-white/10 overflow-hidden shrink-0 mt-1">
                              <img
                                src={avatarUrlForConversation(selectedId)}
                                alt={m.senderName || detail.customerName}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div
                            className={
                              isAdmin
                                ? 'bg-blue-600 text-white p-4 rounded-2xl rounded-tr-none shadow-lg shadow-blue-500/10 max-w-[80%]'
                                : 'bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 p-4 rounded-2xl rounded-tl-none shadow-sm max-w-[80%]'
                            }
                          >
                            <p
                              className={`text-sm leading-relaxed ${isAdmin ? 'font-semibold' : 'font-medium'}`}
                            >
                              {m.text}
                            </p>
                            <div
                              className={`flex items-center gap-1 mt-2 ${isAdmin ? 'justify-end' : ''}`}
                            >
                              <span
                                className={`text-[10px] font-mono ${isAdmin ? 'opacity-80' : 'text-muted-foreground'}`}
                              >
                                {formatMessageTime(m.createdAt)}
                              </span>
                              {isAdmin && <CheckCheck className="w-3 h-3 opacity-80" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>

              <div className="p-4 border-t border-gray-100 dark:border-white/5 bg-white/50 dark:bg-black/50 shrink-0">
                <div className="relative bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-2 flex items-end gap-2">
                  <div className="flex-1 px-3 py-1">
                    <textarea
                      ref={textareaRef}
                      placeholder="Type your reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      disabled={!token || sending}
                      className="w-full bg-transparent border-none focus:outline-none text-sm font-medium resize-none min-h-[40px] max-h-[120px] custom-scrollbar"
                    />
                  </div>
                  <div className="flex items-center gap-1 pb-1">
                    <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl opacity-60 hover:opacity-100">
                      <Paperclip className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl opacity-60 hover:opacity-100">
                      <Smile className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void sendReply()}
                      disabled={!token || sending || !replyText.trim()}
                      className="w-9 h-9 rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25 shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-20 h-20 rounded-3xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-6">
                <Inbox className="w-10 h-10 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold">Select a message</h3>
              <p className="text-sm text-muted-foreground max-w-xs mt-2">
                Choose a conversation from the list to view the full message history and reply.
              </p>
            </div>
          )}
        </AnimatePresence>
      </Card>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-[440px] rounded-2xl border border-gray-100 dark:border-white/10 shadow-xl bg-white dark:bg-zinc-950">
          <DialogHeader>
            <DialogTitle>New conversation</DialogTitle>
            <DialogDescription>
              Starts a thread as the customer&apos;s first message. You can reply from the main view.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Customer name</label>
              <Input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Jane Customer"
                className="rounded-xl"
                disabled={creating}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Customer email (optional)</label>
              <Input
                type="email"
                value={newCustomerEmail}
                onChange={(e) => setNewCustomerEmail(e.target.value)}
                placeholder="jane@example.com"
                className="rounded-xl"
                disabled={creating}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Subject</label>
              <Input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Order question"
                className="rounded-xl"
                disabled={creating}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">First message</label>
              <textarea
                value={newFirstMessage}
                onChange={(e) => setNewFirstMessage(e.target.value)}
                placeholder="Initial message from customer…"
                disabled={creating}
                rows={4}
                className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={creating}
              onClick={() => {
                setNewOpen(false);
                resetNewConversationForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl bg-blue-600 hover:bg-blue-700"
              disabled={creating || !newCustomerName.trim() || !newSubject.trim() || !newFirstMessage.trim()}
              onClick={() => void createConversation()}
            >
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(155,155,155, 0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(155,155,155, 0.4); }
      `,
        }}
      />
    </div>
  );
}
