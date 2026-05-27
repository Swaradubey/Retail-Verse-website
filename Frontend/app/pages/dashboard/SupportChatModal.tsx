import React, { useState, useEffect, useRef } from 'react';
import { X, MessageSquare, Send, Loader2, User, UserCircle, RefreshCcw, Clock, ArrowLeft } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import ApiService from '../../api/apiService';

export function SupportChatModal({ isOpen, onClose, tickets, onRefreshTickets }: any) {
  const { user } = useAuth();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showConversations, setShowConversations] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && tickets.length > 0 && !selectedTicketId) {
      // Auto-select first open ticket or just the first ticket
      const firstTicket = tickets.find((t: any) => t.status !== 'closed' && t.status !== 'solved') || tickets[0];
      if (firstTicket) {
        setSelectedTicketId(firstTicket._id || firstTicket.zendeskTicketId || firstTicket.id);
      }
    }
  }, [isOpen, tickets, selectedTicketId]);

  useEffect(() => {
    if (selectedTicketId) {
      fetchMessages(selectedTicketId, false);
    }
  }, [selectedTicketId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async (ticketId: string, showSilent = false) => {
    if (!ticketId) return;
    if (!showSilent) {
      setLoadingMessages(true);
    }
    try {
      const res = await ApiService.get(`/support-tickets/zendesk/${ticketId}/comments?_t=${Date.now()}`);
      if (res && res.success) {
        setMessages(Array.isArray(res.data) ? res.data : []);
      } else {
        toast.error(res?.message || 'Failed to load chat messages');
      }
    } catch (err: any) {
      console.error("[Chat] Error:", err);
      toast.error(err?.message || 'Network error while loading messages');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMessage = messageInput.trim();
    if (!cleanMessage || !selectedTicketId) return;

    setSending(true);
    try {
      const res = await ApiService.post(`/support-tickets/zendesk/${selectedTicketId}/comments`, { message: cleanMessage, isPublic: true });
      if (res && res.success) {
        setMessageInput('');
        await fetchMessages(selectedTicketId, true);
        toast.success('Message sent');
        if (onRefreshTickets) onRefreshTickets();
      } else {
        toast.error(res?.message || 'Failed to send message');
      }
    } catch (err: any) {
      console.error("[Chat] Send Error:", err);
      toast.error(err?.message || 'Network error while sending message');
    } finally {
      setSending(false);
    }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <Card className="w-full max-w-6xl h-[85vh] flex flex-col bg-white dark:bg-zinc-900 shadow-2xl relative overflow-hidden rounded-[24px] border border-gray-200 dark:border-zinc-800">
        <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-gray-50/80 dark:bg-zinc-800/50 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/30">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-none">Support Chat</h2>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mt-1">
                Live Messaging
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-full bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700 shadow-sm transition hover:rotate-90 duration-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          {/* Sidebar - Conversation List */}
          <div className={`w-full md:w-1/3 md:min-w-[250px] border-r border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto ${showConversations ? 'flex' : 'hidden'} md:flex flex-col`}>
            <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center sticky top-0 bg-white dark:bg-zinc-900 z-10">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">Conversations</h3>
              <button onClick={onRefreshTickets} className="p-1.5 text-gray-400 hover:text-amber-500 transition">
                <RefreshCcw className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col">
              {tickets.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">No tickets found</div>
              ) : (
                tickets.map((t: any) => {
                  const tId = t._id || t.zendeskTicketId || t.id;
                  return (
                    <button
                      key={tId}
                      onClick={() => {
                        setSelectedTicketId(tId);
                        setShowConversations(false);
                      }}
                      className={`text-left p-4 border-b border-gray-50 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition ${
                        selectedTicketId === tId ? 'bg-amber-50 dark:bg-amber-500/10 border-l-4 border-l-amber-500' : 'border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-semibold text-gray-900 dark:text-white truncate max-w-[150px]">
                          {t.requesterName || t.userName}
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {new Date(t.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate mb-1">
                        {t.subject}
                      </div>
                      <div className="flex gap-2 items-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            t.status === 'open'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'
                              : t.status === 'solved' || t.status === 'closed' || t.status === 'resolved'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Main Chat Area */}
          <div className={`flex-1 flex flex-col bg-gray-50/50 dark:bg-zinc-900/50 relative ${!showConversations ? 'flex' : 'hidden'} md:flex`}>
            {!selectedTicketId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4">
                <MessageSquare className="w-16 h-16 opacity-20" />
                <p>Select a conversation to start chatting</p>
              </div>
            ) : (
              <>
                {/* Chat Header */}
                {(() => {
                  const selectedTicket = tickets.find((t: any) => 
                    String(t._id || '') === String(selectedTicketId) ||
                    String(t.zendeskTicketId || '') === String(selectedTicketId) ||
                    String(t.id || '') === String(selectedTicketId)
                  );
                  return (
                    <>
                      <div className="p-4 bg-white dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between shadow-sm z-10">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setShowConversations(true)}
                            className="md:hidden p-2 -ml-2 text-gray-500 hover:text-gray-800 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
                          >
                            <ArrowLeft className="w-5 h-5" />
                          </button>
                          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold uppercase">
                            {selectedTicket?.requesterName?.charAt(0) || selectedTicket?.userName?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 dark:text-white truncate max-w-[200px] md:max-w-md">
                              {selectedTicket?.subject || 'Support Conversation'}
                            </h3>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              Ticket #{selectedTicketId} • {selectedTicket?.requesterName || selectedTicket?.userName || 'N/A'}
                            </p>
                          </div>
                        </div>
                        <button onClick={() => fetchMessages(selectedTicketId, messages.length > 0)} className="p-2 text-gray-400 hover:text-amber-500 bg-gray-50 dark:bg-zinc-800 rounded-lg transition">
                          <RefreshCcw className={`w-4 h-4 ${loadingMessages ? 'animate-spin text-amber-500' : ''}`} />
                        </button>
                      </div>

                      {/* Zendesk Sync Failed Alert Banner */}
                      {selectedTicket?.zendeskSyncStatus === 'failed' && (
                        <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-900/50 px-4 py-2.5 flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-300">
                          <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          <span>This invoice receipt ticket failed to sync with the Zendesk support system. You are viewing a local copy, and replies may not be received by our agents.</span>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                  {loadingMessages && messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-amber-500 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <span className="text-sm font-medium">Loading conversation...</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                      No messages yet
                    </div>
                  ) : (
                    (messages || []).map((msg: any, idx: number) => {
                      if (!msg) return null;
                      const authorRoleNormalized = String(msg.authorRole || '').toLowerCase().trim();
                      const isAdmin = authorRoleNormalized === 'admin' || authorRoleNormalized === 'agent' || authorRoleNormalized === 'super_admin';
                      return (
                        <div key={msg.id || idx} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                          <div className={`flex gap-3 max-w-[85%] md:max-w-[70%] ${isAdmin ? 'flex-row-reverse' : 'flex-row'}`}>
                            <div className="flex-shrink-0 mt-auto">
                              {isAdmin ? (
                                <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-white shadow-md">
                                  <User className="w-4 h-4" />
                                </div>
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                  <UserCircle className="w-5 h-5" />
                                </div>
                              )}
                            </div>
                            <div className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                              <span className="text-[11px] text-gray-500 font-semibold mb-1 px-1">
                                {msg.authorName || (isAdmin ? 'Support Agent' : 'User')}
                              </span>
                              <div
                                className={`px-4 py-3 rounded-2xl shadow-sm text-[15px] leading-relaxed whitespace-pre-wrap ${
                                  isAdmin
                                    ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-br-sm'
                                    : 'bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700 text-gray-800 dark:text-gray-200 rounded-bl-sm'
                                }`}
                              >
                                {msg.body}
                              </div>
                              <span className="text-[10px] text-gray-400 mt-1 px-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800">
                  <form onSubmit={handleSendMessage} className="flex gap-3 relative">
                    <input
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3.5 pr-14 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition text-gray-900 dark:text-white"
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      disabled={!messageInput.trim() || sending}
                      className="absolute right-2 top-2 bottom-2 aspect-square rounded-lg bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 disabled:dark:bg-zinc-700 text-white flex items-center justify-center transition"
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
