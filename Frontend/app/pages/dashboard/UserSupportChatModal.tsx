import React, { useState, useEffect, useRef } from 'react';
import { X, MessageSquare, Send, Loader2, User, UserCircle, RefreshCcw, Clock, AlertCircle } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import ApiService from '../../api/apiService';

interface UserSupportChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: any; // The ticket object (SupportTicket from local DB)
}

export function UserSupportChatModal({ isOpen, onClose, ticket }: UserSupportChatModalProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && (ticket?._id || ticket?.zendeskTicketId)) {
      fetchMessages(false);
    }
  }, [isOpen, ticket]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async (showSilent = false) => {
    const ticketId = ticket?._id || ticket?.zendeskTicketId;
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
    const ticketId = ticket?._id || ticket?.zendeskTicketId;
    if (!cleanMessage || !ticketId) return;

    setSending(true);
    try {
      const res = await ApiService.post(`/support-tickets/zendesk/${ticketId}/comments`, { message: cleanMessage, isPublic: true });
      if (res && res.success) {
        setMessageInput('');
        await fetchMessages(true);
        toast.success('Message sent');
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
      <Card className="w-full max-w-4xl h-[85vh] flex flex-col bg-white dark:bg-zinc-900 shadow-2xl relative overflow-hidden rounded-[24px] border border-gray-200 dark:border-zinc-800">
        {/* Chat Header */}
        <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-gray-50/80 dark:bg-zinc-800/50 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/30">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-none truncate max-w-[200px] md:max-w-md">
                {ticket?.subject || 'Support Conversation'}
              </h2>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mt-1">
                {ticket?.userName || ticket?.customerName || ticket?.user?.name ? `${ticket?.userName || ticket?.customerName || ticket?.user?.name} • ` : ''}Ticket #{ticket?.zendeskTicketId || ticket?._id || '...'} • {ticket?.status || 'Open'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchMessages(messages.length > 0)}
              className="p-2.5 rounded-full bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700 shadow-sm transition"
              title="Refresh messages"
            >
              <RefreshCcw className={`w-4 h-4 ${loadingMessages ? 'animate-spin text-amber-500' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-full bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700 shadow-sm transition hover:rotate-90 duration-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col relative bg-gray-50/50 dark:bg-zinc-900/50">
          {!(ticket?.zendeskTicketId || ticket?._id) ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4 p-8 text-center">
              <AlertCircle className="w-16 h-16 opacity-20 text-rose-500" />
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Ticket Not Found</h3>
                <p className="text-sm max-w-xs mx-auto mt-1">
                  This ticket is not found or is still being processed. Please try again.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                {loadingMessages && messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-amber-500 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-sm font-medium">Loading conversation...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
                    <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                      <MessageSquare className="w-8 h-8 opacity-40" />
                    </div>
                    <p className="text-sm font-medium">No messages in this thread yet.</p>
                  </div>
                ) : (
                  (messages || []).map((msg: any, idx: number) => {
                    if (!msg) return null;
                    const authorRoleNormalized = String(msg.authorRole || '').toLowerCase().trim();
                    const isAdmin = authorRoleNormalized === 'admin' || authorRoleNormalized === 'agent' || authorRoleNormalized === 'super_admin';
                    return (
                      <div key={msg.id || idx} className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}>
                        <div className={`flex gap-3 max-w-[85%] md:max-w-[75%] ${isAdmin ? 'flex-row' : 'flex-row-reverse'}`}>
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
                          <div className={`flex flex-col ${isAdmin ? 'items-start' : 'items-end'}`}>
                            <span className="text-[11px] text-gray-500 font-semibold mb-1 px-1">
                              {msg.authorName || (isAdmin ? 'Support Agent' : 'You')}
                            </span>
                            <div
                              className={`px-4 py-3 rounded-2xl shadow-sm text-[15px] leading-relaxed whitespace-pre-wrap ${
                                isAdmin
                                  ? 'bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700 text-gray-800 dark:text-gray-200 rounded-bl-sm'
                                  : 'bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-br-sm shadow-amber-500/20'
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
                    placeholder="Type your reply here..."
                    className="flex-1 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3.5 pr-14 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition text-gray-900 dark:text-white"
                    disabled={sending || !(ticket?.zendeskTicketId || ticket?._id)}
                  />
                  <button
                    type="submit"
                    disabled={!messageInput.trim() || sending || !(ticket?.zendeskTicketId || ticket?._id)}
                    className="absolute right-2 top-2 bottom-2 aspect-square rounded-lg bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 disabled:dark:bg-zinc-700 text-white flex items-center justify-center transition shadow-md shadow-amber-500/20"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>
                <p className="text-[10px] text-gray-400 mt-2 text-center">
                  This conversation is ticket-based. Your messages are sent directly to our support team.
                </p>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
