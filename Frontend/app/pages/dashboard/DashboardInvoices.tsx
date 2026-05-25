import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Receipt,
  Search,
  Eye,
  FileText,
  DollarSign,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  RefreshCcw,
  Send,
  Check,
  X,
  ArrowRight,
  MessageSquare,
  CreditCard,
  Download,
  Printer,
  Trash2,
} from 'lucide-react';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { createRazorpayOrder, verifyRazorpayPayment } from '../../api/orders';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
import ApiService from '../../api/apiService';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { QuoteRequestDialog } from '../../components/QuoteRequestDialog';
import { CreateQuoteModal } from '../../components/CreateQuoteModal';
import { useNavigate } from 'react-router';

type TabType = 'invoices' | 'quotes';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export function DashboardInvoices() {
  const { user } = useAuth();
  const { cart } = useCart();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('invoices');
  const [viewInvoice, setViewInvoice] = useState<any | null>(null);
  const [viewQuote, setViewQuote] = useState<any | null>(null);
  const [isQuoteRequestOpen, setIsQuoteRequestOpen] = useState(false);
  const [isCreateQuoteOpen, setIsCreateQuoteOpen] = useState(false);

  // Bargaining states
  const [counterPrice, setCounterPrice] = useState<string>('');
  const [adminMessage, setAdminMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCounterInput, setShowCounterInput] = useState(false);
  const [isRazorpayLoading, setIsRazorpayLoading] = useState(false);
  const [isRazorpayOpen, setIsRazorpayOpen] = useState(false);

  // Refs to hold quote/invoice data while dialog is closed during Razorpay payment
  const paymentQuoteRef = useRef<any>(null);
  const paymentInvoiceRef = useRef<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  // DEV NOTE: Test mode credentials for Razorpay:
  // Card: 4111 1111 1111 1111 | Any future expiry | Any CVV | OTP: any 6 digits
  // UPI: success@razorpay
  // Netbanking: Select any test bank listed in the popup

  /**
   * Strips non-digit characters and returns last 10 digits.
   * Razorpay requires a 10-digit contact number without country code or spaces.
   */
  const cleanPhoneNumber = (phone: string): string => {
    if (!phone) return '';
    return String(phone).replace(/\D/g, '').slice(-10);
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayment = async () => {
    if (!viewQuote) return;

    console.log('[QUOTE PAY NOW CLICKED]', { quotation: viewQuote, invoice: viewInvoice });

    // ── 1. Snapshot quote/invoice data into refs BEFORE closing the dialog ──
    paymentQuoteRef.current = { ...viewQuote };
    paymentInvoiceRef.current = viewInvoice ? { ...viewInvoice } : null;

    const quote = paymentQuoteRef.current;
    const invoice = paymentInvoiceRef.current;

    setIsRazorpayLoading(true);

    try {
      // Amount source: use the final negotiated/accepted price, falling back through each field.
      // DEV NOTE: Do NOT multiply by 100 here — the backend does that.
      const amount =
        quote.finalAcceptedPrice ||
        quote.finalPrice ||
        invoice?.totalAmount ||
        invoice?.amount ||
        quote.requestedPrice;

      if (!amount || Number(amount) <= 0) {
        toast.error('Invalid payment amount. Please contact support.');
        setIsRazorpayLoading(false);
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast.error('Razorpay SDK failed to load. Are you online?');
        setIsRazorpayLoading(false);
        return;
      }

      // DEV NOTE (test mode): Card: 4111 1111 1111 1111 | Expiry: 12/30 | CVV: 123 | OTP: 123456
      // UPI: success@razorpay

      const rzpOrder = await createRazorpayOrder(amount, {
        quotationId: quote._id,
        invoiceId: invoice?._id,
      });

      console.log('[QUOTE RAZORPAY ORDER]', rzpOrder);

      if (!rzpOrder.success) {
        console.error('[QUOTE RAZORPAY] Order creation failed:', rzpOrder.message);
        toast.error(rzpOrder.message || 'Failed to create Razorpay order');
        setIsRazorpayLoading(false);
        return;
      }

      // ── 2. Clean contact exactly like working Orders flow ──
      const cleanContact = String(quote.customerPhone || quote.phone || '')
        .replace(/\D/g, '')
        .slice(-10);

      // ── 3. Build options — mirror working Checkout.tsx pattern exactly ──
      const options: Record<string, any> = {
        key: rzpOrder.key_id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency || 'INR',
        name: 'E-commerce Store',
        description: `Payment for quotation ${quote.quoteNumber || quote.reference || quote._id}`,
        order_id: rzpOrder.order_id,
        handler: async (response: any) => {
          console.log('[QUOTE RAZORPAY SUCCESS]', response);
          try {
            setIsRazorpayLoading(true);
            const verifyPayload = {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              quotationId: quote._id,
              invoiceId: invoice?._id,
              orderId: quote.quoteNumber || quote.reference || quote._id,
              internal_quote_id: quote._id,
            };

            const verifyRes = await verifyRazorpayPayment(verifyPayload);
            console.log('[QUOTE VERIFY RESPONSE]', verifyRes);

            if (verifyRes.success) {
              toast.success('Payment successful!');
              // Clear refs
              paymentQuoteRef.current = null;
              paymentInvoiceRef.current = null;
              void fetchData();
            } else {
              toast.error(verifyRes.message || 'Payment verification failed');
            }
          } catch (err: any) {
            console.error('[QUOTE RAZORPAY VERIFY ERROR]', err);
            toast.error(err.message || 'Payment verification failed');
          } finally {
            setIsRazorpayLoading(false);
            setIsRazorpayOpen(false);
          }
        },
        prefill: {
          name: quote.customerName || quote.preparedFor || '',
          email: quote.customerEmail || quote.email || '',
          ...(cleanContact.length === 10 ? { contact: cleanContact } : {}),
        },
        theme: {
          color: '#2563eb',
        },
        modal: {
          ondismiss: function () {
            console.log('[QUOTE RAZORPAY CLOSED]');
            setIsRazorpayLoading(false);
            setIsRazorpayOpen(false);
          },
        },
      };

      console.log('[QUOTE RAZORPAY OPTIONS]', {
        key: options.key,
        amount: options.amount,
        currency: options.currency,
        order_id: options.order_id,
        prefill: options.prefill,
      });

      // ── 4. CRITICAL FIX: Close the dialog BEFORE opening Razorpay ──
      // The Radix UI Dialog renders a `fixed inset-0 z-50` overlay that
      // intercepts all pointer events and blocks the Razorpay iframe.
      // We must close the dialog so the overlay is removed from the DOM.
      setViewQuote(null);
      setIsRazorpayOpen(true);

      // Small delay to let React unmount the dialog overlay before Razorpay opens
      await new Promise((resolve) => setTimeout(resolve, 150));

      const rzp = new (window as any).Razorpay(options);

      rzp.on('payment.failed', function (response: any) {
        console.error('[QUOTE RAZORPAY FAILED]', response.error);
        toast.error(response.error?.description || response.error?.reason || 'Payment failed');
        setIsRazorpayLoading(false);
        setIsRazorpayOpen(false);
      });

      console.log('[QUOTE RAZORPAY OPEN]');
      rzp.open();
    } catch (err: any) {
      console.error('[QUOTE RAZORPAY] Error in handlePayment:', err);
      toast.error(err.message || 'Payment failed to initialize');
      setIsRazorpayLoading(false);
      setIsRazorpayOpen(false);
    }
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [invoiceRes, quoteRes] = await Promise.allSettled([
        ApiService.get('/invoices', { pageName: 'Invoice' }),
        ApiService.get('/quotes', { pageName: 'Quote' })
      ]);

      if (invoiceRes.status === 'fulfilled' && invoiceRes.value.success) {
        setInvoices(invoiceRes.value.data || []);
      } else {
        console.error('Invoice fetch failed');
        setInvoices([]);
      }

      if (quoteRes.status === 'fulfilled' && quoteRes.value.success) {
        setQuotes(quoteRes.value.data || []);
      } else {
        console.error('Quote fetch failed');
        setQuotes([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch dashboard data', err);
      setError(err.message || 'Could not load data.');
      toast.error('Failed to load quotes and invoices.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleBargainAction = async (action: 'accept' | 'reject' | 'counter' | 'convert') => {
    if (!viewQuote) return;
    setIsSubmitting(true);
    try {
      let res;
      if (action === 'accept') {
        res = await ApiService.patch(`/quotes/${viewQuote._id}/accept`, {}, { pageName: 'Quote' });
      } else if (action === 'reject') {
        res = await ApiService.patch(`/quotes/${viewQuote._id}/reject`, {}, { pageName: 'Quote' });
      } else if (action === 'counter') {
        if (!counterPrice || isNaN(Number(counterPrice))) {
          toast.error('Please enter a valid counter price');
          setIsSubmitting(false);
          return;
        }
        res = await ApiService.patch(`/quotes/${viewQuote._id}/counter`, { 
          counterPrice: Number(counterPrice),
          adminMessage 
        }, { pageName: 'Quote' });
      } else if (action === 'convert') {
        res = await ApiService.post(`/quotes/${viewQuote._id}/convert-to-invoice`, {}, { pageName: 'Quote' });
      }

      if (res?.success) {
        toast.success(`Quote ${action}ed successfully`);
        setViewQuote(null);
        setShowCounterInput(false);
        setCounterPrice('');
        setAdminMessage('');
        void fetchData();
      } else {
        toast.error(res?.message || `Failed to ${action} quote`);
      }
    } catch (err: any) {
      toast.error(err.message || `An error occurred while ${action}ing quote`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteInvoice = async () => {
    const invoiceId = viewInvoice?._id || viewInvoice?.id;

    if (!invoiceId) {
      toast.error("Invoice ID not found");
      return;
    }

    const confirmed = window.confirm("Are you sure you want to delete this invoice?");
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      const res = await ApiService.delete(`/invoices/${invoiceId}`, { pageName: 'DashboardInvoices' });

      if (res.success) {
        toast.success("Invoice deleted successfully");
        setViewInvoice(null);
        setInvoices((prev) => prev.filter((item) => (item._id || item.id) !== invoiceId));
      } else {
        toast.error(res.message || "Failed to delete invoice");
      }
    } catch (error: any) {
      console.error("Delete invoice failed:", error);
      toast.error(error.message || "Failed to delete invoice");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setIsDownloading(true);

      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();

      const invoice = viewInvoice;

      const invoiceNo =
        invoice?.invoiceNumber ||
        invoice?.invoiceNo ||
        invoice?._id ||
        "invoice";

      const orderId = invoice?.orderId || "N/A";

      const customerName = invoice?.customerName || "N/A";
      const customerEmail = invoice?.customerEmail || "N/A";
      const paymentMethod = invoice?.paymentMethod || "N/A";
      const paymentStatus = invoice?.paymentStatus || "Paid";

      const items = invoice?.items || [];

      const subtotal =
        invoice?.subtotal ||
        items.reduce((sum: number, item: any) => {
          const qty = item.quantity || item.qty || 1;
          const price = item.price || item.unitPrice || 0;
          return sum + qty * price;
        }, 0);

      const tax = invoice?.tax || 0;

      const total =
        invoice?.total ||
        invoice?.totalAmount ||
        subtotal + tax;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("RETAIL VERSE", 14, 20);

      doc.setFontSize(18);
      doc.text("INVOICE", pageWidth - 14, 20, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Premium E-Commerce", 14, 27);
      doc.text("123 Business Avenue Suite 500", 14, 34);
      doc.text("New Delhi, India 110001", 14, 40);
      doc.text("contact@retailverse.com", 14, 46);

      doc.setFont("helvetica", "bold");
      doc.text(`Invoice No: ${invoiceNo}`, pageWidth - 14, 34, { align: "right" });
      doc.text(`Order ID: ${orderId}`, pageWidth - 14, 42, { align: "right" });

      doc.line(14, 55, pageWidth - 14, 55);

      doc.setFontSize(12);
      doc.text("Billed To", 14, 65);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(String(customerName), 14, 73);
      doc.text(String(customerEmail), 14, 80);

      doc.setFont("helvetica", "bold");
      doc.text("Payment Details", pageWidth - 14, 65, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.text(`Method: ${paymentMethod}`, pageWidth - 14, 73, { align: "right" });
      doc.text(`Status: ${paymentStatus}`, pageWidth - 14, 80, { align: "right" });

      const tableBody = items.map((item: any) => {
        const name =
          item.name ||
          item.productName ||
          item.title ||
          item.product?.name ||
          "Item";

        const qty = item.quantity || item.qty || 1;
        const price = item.price || item.unitPrice || item.product?.price || 0;
        const amount = qty * price;

        return [
          name,
          String(qty),
          `Rs. ${Number(price).toFixed(2)}`,
          `Rs. ${Number(amount).toFixed(2)}`
        ];
      });

      autoTable(doc, {
        startY: 92,
        head: [["Item", "Qty", "Price", "Amount"]],
        body: tableBody,
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 10,
          cellPadding: 4
        },
        headStyles: {
          fillColor: [245, 245, 245],
          textColor: [0, 0, 0]
        }
      });

      let finalY = (doc as any).lastAutoTable.finalY + 10;

      doc.setFont("helvetica", "bold");
      doc.text("Subtotal:", pageWidth - 60, finalY);
      doc.text(`Rs. ${Number(subtotal).toFixed(2)}`, pageWidth - 14, finalY, { align: "right" });

      finalY += 8;
      doc.text("Tax:", pageWidth - 60, finalY);
      doc.text(`Rs. ${Number(tax).toFixed(2)}`, pageWidth - 14, finalY, { align: "right" });

      finalY += 10;
      doc.setFontSize(14);
      doc.text("Total Amount:", pageWidth - 60, finalY);
      doc.text(`Rs. ${Number(total).toFixed(2)}`, pageWidth - 14, finalY, { align: "right" });

      doc.save(`receipt-${invoiceNo}.pdf`);

      toast.success("PDF downloaded successfully.");
    } catch (error: any) {
      console.error("PDF generation failed:", error);
      toast.error(error?.message || "Failed to generate PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  const currentData = activeTab === 'invoices' ? invoices : quotes;

  const filteredData = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    if (!t) return currentData;
    return currentData.filter((item: any) => {
      const id = String(item.invoiceNumber || item.quoteNumber || '').toLowerCase();
      const orderId = String(item.orderId || '').toLowerCase();
      const name = String(item.customerName || '').toLowerCase();
      const email = String(item.customerEmail || '').toLowerCase();
      return id.includes(t) || orderId.includes(t) || name.includes(t) || email.includes(t);
    });
  }, [currentData, searchTerm]);

  const stats = useMemo(() => {
    if (activeTab === 'invoices') {
      const total = invoices.length;
      const completed = invoices.filter((o) => 
        ['paid', 'completed'].includes(String(o.paymentStatus).toLowerCase())
      ).length;
      const pending = total - completed;
      const revenue = invoices.reduce((acc, o) => acc + (Number(o.totalAmount || o.subtotal) || 0), 0);
      return [
        { title: 'Total Invoices', value: total, icon: Receipt, color: 'blue' },
        { title: 'Paid / Completed', value: completed, icon: CheckCircle2, color: 'emerald' },
        { title: 'Pending Payment', value: pending, icon: Clock, color: 'amber' },
        { title: 'Total Revenue', value: `₹${revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'indigo' },
      ];
    } else {
      const total = quotes.length;
      const accepted = quotes.filter((o) => String(o.status).toLowerCase() === 'accepted').length;
      const pending = quotes.filter((o) => String(o.status).toLowerCase() === 'pending').length;
      const totalAmount = quotes.reduce((acc, o) => acc + (Number(o.finalPrice || o.requestedPrice) || 0), 0);
      return [
        { title: 'Total Quotes', value: total, icon: FileText, color: 'blue' },
        { title: 'Accepted', value: accepted, icon: CheckCircle2, color: 'emerald' },
        { title: 'Pending', value: pending, icon: Clock, color: 'amber' },
        { title: 'Total Value', value: `₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'indigo' },
      ];
    }
  }, [activeTab, invoices, quotes]);

  const getStatusColor = (status: string) => {
    const s = String(status).toLowerCase();
    if (['paid', 'completed', 'accepted'].includes(s)) return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800';
    if (['pending', 'countered'].includes(s)) return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800';
    if (['rejected', 'expired', 'failed'].includes(s)) return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800';
    return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-800';
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'client';

  return (
    <div className="relative min-h-screen bg-[linear-gradient(180deg,#fffdf8_0%,#fff8e8_45%,#fffdf7_100%)] dark:from-[#1a1510] dark:via-[#14120d] dark:to-[#1a1610]">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.08),transparent_60%)] pointer-events-none" />
      <div className="relative space-y-8 p-6 md:p-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#1F1F1F] dark:text-[#F9FAFB]">Quotes & Invoices</h1>
            <p className="text-muted-foreground mt-1">Manage and track all customer quotations and financial invoices.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchData} 
              disabled={isLoading}
              className="rounded-xl border-[#EADFBF] bg-white/50 dark:bg-[#1a1610]/50"
            >
              <RefreshCcw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <AnimatePresence>
              {activeTab === 'quotes' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, width: 0 }}
                  animate={{ opacity: 1, scale: 1, width: 'auto' }}
                  exit={{ opacity: 0, scale: 0.95, width: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Button 
                    size="sm" 
                    onClick={() => {
                      if (isAdmin) {
                        setIsCreateQuoteOpen(true);
                      } else {
                        if (cart.length === 0) {
                          toast.error('Your cart is empty. Please add items to your cart to request a quote.');
                          navigate('/shop');
                          return;
                        }
                        setIsQuoteRequestOpen(true);
                      }
                    }}
                    className="rounded-xl bg-[#1F1F1F] text-white hover:bg-[#333] dark:bg-[#D4AF37] dark:text-[#1a1610] dark:hover:bg-[#EADFBF] shadow-sm font-semibold whitespace-nowrap"
                  >
                    + Quote
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-[#F4E7C5]/30 dark:bg-[#2a2318] rounded-2xl w-fit border border-[#EADFBF]/50 dark:border-[#3d3522]">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'invoices' 
                ? 'bg-white text-[#D4AF37] shadow-md dark:bg-[#1a1610]' 
                : 'text-[#6B7280] hover:text-[#1F1F1F] dark:text-[#9CA3AF] dark:hover:text-[#F9FAFB]'
            }`}
          >
            Invoices
          </button>
          <button
            onClick={() => setActiveTab('quotes')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'quotes' 
                ? 'bg-white text-[#D4AF37] shadow-md dark:bg-[#1a1610]' 
                : 'text-[#6B7280] hover:text-[#1F1F1F] dark:text-[#9CA3AF] dark:hover:text-[#F9FAFB]'
            }`}
          >
            Quotes
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.title + activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="relative overflow-hidden rounded-3xl border border-[#F0E4C8] bg-[#FFFDF8]/95 shadow-[0_10px_30px_rgba(212,175,55,0.08)] dark:border-[#3d3522] dark:bg-[#1a1610]/95">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent opacity-60" />
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 pt-5">
                  <CardTitle className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-[#6B7280] dark:text-[#9CA3AF]">
                    {stat.title}
                  </CardTitle>
                  <div
                    className={`rounded-xl p-2.5 ${stat.color === 'blue'
                      ? 'bg-[#EFF6FF] text-[#3B82F6] dark:bg-[#1e3a5f] dark:text-[#60A5FA]'
                      : stat.color === 'amber'
                        ? 'bg-[#FFFBEB] text-[#D97706] dark:bg-[#451a03] dark:text-[#FBBF24]'
                        : stat.color === 'emerald'
                          ? 'bg-[#ECFDF5] text-[#059669] dark:bg-[#042f2e] dark:text-[#34D399]'
                          : 'bg-[#EEF2FF] text-[#4F46E5] dark:bg-[#1e1b4b] dark:text-[#818CF8]'
                      }`}
                  >
                    <stat.icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent className="pb-5">
                  <div className="text-3xl font-bold text-[#1F1F1F] dark:text-[#F9FAFB]">{stat.value}</div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Error State */}
        {error && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400"
          >
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
            <Button variant="ghost" size="sm" onClick={fetchData} className="ml-auto hover:bg-rose-100">Try Again</Button>
          </motion.div>
        )}

        {/* Data Table */}
        <Card className="overflow-hidden rounded-3xl border border-[#EADFBF] bg-[#FFFDF8] shadow-[0_20px_40px_rgba(212,175,55,0.1)] dark:border-[#3d3522] dark:bg-[#1a1610]">
          <CardHeader className="border-b border-[#EADFBF]/50 pb-6 pt-6 md:pt-8 dark:border-[#3d3522]">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
              <div>
                <CardTitle className="text-2xl font-bold text-[#1F1F1F] dark:text-[#F9FAFB]">
                  {activeTab === 'invoices' ? 'Invoice List' : 'Quotation List'}
                </CardTitle>
                <p className="mt-2 text-sm text-[#6B7280] dark:text-[#9CA3AF]">
                  {activeTab === 'invoices' 
                    ? 'Track financial records and payment statuses for completed orders.' 
                    : 'Manage price quotations sent to potential customers.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                  <input
                    type="text"
                    placeholder={`Search ${activeTab}...`}
                    className="w-full rounded-xl border border-[#EADFBF] bg-[#FFFCF4] py-2.5 pr-4 pl-10 text-sm text-[#1F1F1F] placeholder:text-[#9CA3AF] transition-all focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 focus:outline-none dark:border-[#3d3522] dark:bg-[#252117] dark:text-[#F9FAFB] dark:placeholder:text-[#6B7280] md:w-64"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#F4E7C5]/30 text-[11px] font-semibold tracking-[0.1em] text-[#6B7280] uppercase dark:bg-[#2a2318] dark:text-[#9CA3AF]">
                  <tr>
                    <th className="px-6 py-4">{activeTab === 'invoices' ? 'Invoice No' : 'Quote No'}</th>
                    {activeTab === 'invoices' && <th className="px-6 py-4">Order ID</th>}
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EADFBF]/50 dark:divide-[#3d3522]">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-sm text-[#6B7280]">
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCcw className="h-4 w-4 animate-spin text-[#D4AF37]" />
                          <span>Loading data…</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-sm text-[#6B7280]">
                        No {activeTab} match your search.
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((item, idx) => (
                      <motion.tr
                        key={item._id || idx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.03 }}
                        className="group transition-all duration-200 hover:bg-[#F4E7C5]/20 dark:hover:bg-[#2a2318]"
                      >
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm font-semibold text-[#D4AF37] dark:text-[#D4AF37]">
                            {item.invoiceNumber || item.quoteNumber}
                          </span>
                        </td>
                        {activeTab === 'invoices' && (
                          <td className="px-6 py-4">
                            <span className="font-mono text-xs text-[#6B7280]">
                              {item.orderId}
                            </span>
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-[#1F1F1F] dark:text-[#F9FAFB]">
                              {item.customerName || 'Unknown'}
                            </span>
                            <span className="text-[10px] text-[#9CA3AF]">
                              {item.createdAt
                                ? new Date(item.createdAt).toISOString().split('T')[0]
                                : '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold text-[#1F1F1F] dark:text-[#F9FAFB]">
                            ₹{(item.totalAmount || item.finalPrice || item.requestedPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold tracking-wide capitalize ${getStatusColor(item.paymentStatus || item.status)}`}
                          >
                            {item.paymentStatus || item.status || 'Pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-full border-[#EADFBF] bg-transparent text-[#1F1F1F] hover:border-[#D4AF37] hover:bg-[#FFFDF8] hover:shadow-md hover:shadow-[#D4AF37]/10 dark:border-[#3d3522] dark:text-[#F9FAFB] dark:hover:border-[#D4AF37] dark:hover:bg-[#252117]"
                              onClick={() => {
                                if (activeTab === 'invoices') setViewInvoice(item);
                                else setViewQuote(item);
                              }}
                            >
                              <Eye className="mr-1.5 h-3.5 w-3.5" />
                              View
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Invoice Detail Dialog */}
        <Dialog open={!!viewInvoice} onOpenChange={(open) => !open && setViewInvoice(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl border-stone-200 w-[95vw] sm:max-w-2xl bg-white dark:bg-zinc-950 p-0 pb-4">
            <div className="p-4 sm:p-8">
              <DialogHeader className="mb-6 flex flex-row items-center justify-between pr-10">
                <DialogTitle className="flex flex-col sm:flex-row items-start sm:items-center gap-3 text-2xl sm:text-3xl font-black text-[#1F1F1F] dark:text-[#F9FAFB]">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
                    <Receipt className="h-6 w-6 sm:h-7 sm:w-7 text-blue-600 dark:text-blue-400" />
                  </div>
                  Invoice Details
                </DialogTitle>
                {viewInvoice && (user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'client') && (
                  <button
                    type="button"
                    title="Delete Invoice"
                    onClick={handleDeleteInvoice}
                    disabled={isDeleting}
                    className="p-2 rounded-full text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                  >
                    {isDeleting ? (
                      <RefreshCcw className="h-5 w-5 animate-spin" />
                    ) : (
                      <Trash2 size={22} />
                    )}
                  </button>
                )}
              </DialogHeader>

              {viewInvoice && (
                <div ref={invoiceRef} className="invoice-pdf-content space-y-8 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 p-4 sm:p-6 bg-gray-50/50 dark:bg-white/5 rounded-3xl border border-gray-100 dark:border-white/5">
                    <div className="space-y-2">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Billed To</p>
                      <p className="font-bold text-base sm:text-lg text-[#1F1F1F] dark:text-[#F9FAFB] break-words">{viewInvoice.customerName}</p>
                      <p className="text-muted-foreground break-words">{viewInvoice.customerEmail}</p>
                    </div>
                    <div className="space-y-2 sm:text-right">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Reference</p>
                      <p className="font-bold text-base sm:text-lg text-blue-600 dark:text-blue-400 break-words">{viewInvoice.invoiceNumber}</p>
                      <p className="text-muted-foreground break-words">Order: {viewInvoice.orderId}</p>
                      <p className="text-muted-foreground">{new Date(viewInvoice.createdAt).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="border border-gray-100 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[500px]">
                        <thead className="bg-gray-50 dark:bg-white/5 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                          <tr>
                            <th className="px-4 sm:px-6 py-4">Item</th>
                            <th className="px-4 sm:px-6 py-4 text-center">Qty</th>
                            <th className="px-4 sm:px-6 py-4 text-right">Price</th>
                            <th className="px-4 sm:px-6 py-4 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                          {viewInvoice.items?.map((item: any, i: number) => (
                            <tr key={i}>
                              <td className="px-4 sm:px-6 py-4 font-semibold text-[#1F1F1F] dark:text-[#F9FAFB] break-words">{item.name}</td>
                              <td className="px-4 sm:px-6 py-4 text-center text-[#6B7280]">{item.quantity}</td>
                              <td className="px-4 sm:px-6 py-4 text-right text-[#6B7280]">₹{Number(item.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="px-4 sm:px-6 py-4 text-right font-bold text-[#1F1F1F] dark:text-[#F9FAFB]">₹{Number(item.subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50/30 dark:bg-white/2 font-bold border-t border-gray-100 dark:border-white/5">
                          <tr>
                            <td colSpan={3} className="px-4 sm:px-6 py-3 text-right text-muted-foreground">Subtotal</td>
                            <td className="px-4 sm:px-6 py-3 text-right text-[#1F1F1F] dark:text-[#F9FAFB]">₹{Number(viewInvoice.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                          <tr>
                            <td colSpan={3} className="px-4 sm:px-6 py-3 text-right text-muted-foreground">Tax</td>
                            <td className="px-4 sm:px-6 py-3 text-right text-[#1F1F1F] dark:text-[#F9FAFB]">₹{Number(viewInvoice.tax || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                          <tr className="text-base sm:text-lg bg-blue-50/50 dark:bg-blue-900/10">
                            <td colSpan={3} className="px-4 sm:px-6 py-5 text-right font-black text-blue-700 dark:text-blue-400">Total Amount</td>
                            <td className="px-4 sm:px-6 py-5 text-right font-black text-blue-700 dark:text-blue-400">₹{Number(viewInvoice.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 sm:p-5 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">Payment Method</p>
                      <p className="font-bold text-[#1F1F1F] dark:text-[#F9FAFB] capitalize">{viewInvoice.paymentMethod || 'N/A'}</p>
                    </div>
                    <div className="p-4 sm:p-5 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">Payment Status</p>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black capitalize ${getStatusColor(viewInvoice.paymentStatus)}`}>
                        {viewInvoice.paymentStatus || 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter className="mt-10 flex flex-col sm:flex-row gap-3 border-t border-gray-100 dark:border-white/5 pt-6">
                <Button type="button" variant="ghost" onClick={() => setViewInvoice(null)} className="rounded-xl px-6 w-full sm:w-auto">
                  Close
                </Button>
                <Button 
                  type="button" 
                  disabled={isDownloading}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6 w-full sm:w-auto disabled:opacity-70" 
                  onClick={handleDownloadPDF}
                >
                  {isDownloading ? (
                    <>
                      <RefreshCcw className="h-4 w-4 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download PDF
                    </>
                  )}
                </Button>
                <Button type="button" className="gap-2 bg-[#1F1F1F] hover:bg-[#333] text-white dark:bg-blue-600 dark:hover:bg-blue-700 rounded-xl px-6 w-full sm:w-auto" onClick={() => window.print()}>
                  <Printer className="w-4 h-4" /> Print Receipt
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Quote Detail Dialog */}
        <Dialog open={!!viewQuote} onOpenChange={(open) => {
          if (!open) {
            setViewQuote(null);
            setShowCounterInput(false);
            setCounterPrice('');
            setAdminMessage('');
          }
        }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl border-stone-200 w-[95vw] sm:max-w-3xl bg-white dark:bg-zinc-950 p-0 pb-4">
            <div className="p-4 sm:p-8">
              <DialogHeader className="mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <DialogTitle className="flex items-center gap-3 text-2xl sm:text-3xl font-black text-[#1F1F1F] dark:text-[#F9FAFB]">
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-2xl">
                      <FileText className="h-6 w-6 sm:h-7 sm:w-7 text-amber-600 dark:text-amber-400" />
                    </div>
                    Quotation Details
                  </DialogTitle>
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center rounded-full px-3 sm:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-black uppercase border ${getStatusColor(viewQuote?.status)}`}>
                      {viewQuote?.status || 'Pending'}
                    </span>
                    {viewQuote?.paymentStatus && viewQuote.paymentStatus !== 'pending' && (
                      <span className={`inline-flex items-center rounded-full px-3 sm:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-black uppercase border ${getStatusColor(viewQuote.paymentStatus)}`}>
                        {viewQuote.paymentStatus}
                      </span>
                    )}
                  </div>
                </div>
              </DialogHeader>

              {viewQuote && (
                <div className="space-y-6 text-sm">
                  {/* Info Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 sm:p-6 bg-gray-50/50 dark:bg-white/5 rounded-3xl border border-gray-100 dark:border-white/5">
                    <div className="space-y-2">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Prepared For</p>
                      <p className="font-bold text-base sm:text-lg text-[#1F1F1F] dark:text-[#F9FAFB] break-words">{viewQuote.customerName}</p>
                      <p className="text-muted-foreground break-words">{viewQuote.customerEmail}</p>
                    </div>
                    <div className="space-y-2 sm:text-right">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Reference</p>
                      <p className="font-bold text-base sm:text-lg text-amber-600 dark:text-amber-400 break-words">{viewQuote.quoteNumber}</p>
                      <p className="text-muted-foreground break-words">Valid Until: {viewQuote.validUntil ? new Date(viewQuote.validUntil).toLocaleDateString() : 'N/A'}</p>
                      <p className="text-muted-foreground">{new Date(viewQuote.createdAt).toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Messages */}
                  {(viewQuote.message || viewQuote.adminMessage) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {viewQuote.message && (
                        <div className="p-4 bg-blue-50/30 dark:bg-blue-900/10 rounded-2xl border border-blue-100/50 dark:border-blue-900/20">
                          <div className="flex items-center gap-2 mb-2">
                            <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Customer Message</span>
                          </div>
                          <p className="italic text-[#4B5563] dark:text-gray-300">"{viewQuote.message}"</p>
                        </div>
                      )}
                      {viewQuote.adminMessage && (
                        <div className="p-4 bg-amber-50/30 dark:bg-amber-900/10 rounded-2xl border border-amber-100/50 dark:border-amber-900/20">
                          <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Admin Response</span>
                          </div>
                          <p className="italic text-[#4B5563] dark:text-gray-300">"{viewQuote.adminMessage}"</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payment Status Info */}
                  {viewQuote.paymentStatus === 'paid' && (
                    <div className="p-5 bg-emerald-50/30 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100/50 dark:border-emerald-900/20 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-1">Payment Status</p>
                        <p className="font-bold text-emerald-800 dark:text-emerald-300">Successfully Paid via Razorpay</p>
                      </div>
                      <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  )}

                  {/* Products Table */}
                  <div className="border border-gray-100 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[550px]">
                        <thead className="bg-gray-50 dark:bg-white/5 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                          <tr>
                            <th className="px-4 sm:px-6 py-4">Product</th>
                            <th className="px-4 sm:px-6 py-4 text-center">Qty</th>
                            <th className="px-4 sm:px-6 py-4 text-right">Original Price</th>
                            <th className="px-4 sm:px-6 py-4 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                          {viewQuote.products?.map((item: any, i: number) => (
                            <tr key={i}>
                              <td className="px-4 sm:px-6 py-4 font-semibold text-[#1F1F1F] dark:text-[#F9FAFB] break-words">{item.name}</td>
                              <td className="px-4 sm:px-6 py-4 text-center text-[#6B7280]">{item.quantity}</td>
                              <td className="px-4 sm:px-6 py-4 text-right text-[#6B7280]">₹{Number(item.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="px-4 sm:px-6 py-4 text-right font-bold text-[#1F1F1F] dark:text-[#F9FAFB]">₹{Number(item.price * item.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50/30 dark:bg-white/2 font-bold border-t border-gray-100 dark:border-white/5">
                          <tr className="bg-gray-50/50 dark:bg-white/5">
                            <td colSpan={3} className="px-4 sm:px-6 py-4 text-right text-muted-foreground uppercase tracking-wider text-[10px]">Requested Price</td>
                            <td className="px-4 sm:px-6 py-4 text-right text-blue-600 dark:text-blue-400 font-black text-base sm:text-lg">₹{Number(viewQuote.requestedPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                          {viewQuote.counterPrice && (
                            <tr className="bg-amber-50/50 dark:bg-amber-900/10">
                              <td colSpan={3} className="px-4 sm:px-6 py-4 text-right text-amber-700 dark:text-amber-400 uppercase tracking-wider text-[10px]">Counter Offer</td>
                              <td className="px-4 sm:px-6 py-4 text-right text-amber-700 dark:text-amber-400 font-black text-base sm:text-lg">₹{Number(viewQuote.counterPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          )}
                          {viewQuote.finalPrice && (
                            <tr className="bg-emerald-50/50 dark:bg-emerald-900/10">
                              <td colSpan={3} className="px-4 sm:px-6 py-5 text-right text-emerald-700 dark:text-emerald-400 uppercase tracking-wider text-[10px]">Final Accepted Price</td>
                              <td className="px-4 sm:px-6 py-5 text-right text-emerald-700 dark:text-emerald-400 font-black text-xl sm:text-2xl">₹{Number(viewQuote.finalPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          )}
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Bargaining Input (Admin only) */}
                  <AnimatePresence>
                    {showCounterInput && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 p-6 bg-amber-50/50 dark:bg-amber-900/10 rounded-3xl border border-amber-200 dark:border-amber-900/30"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">Counter Price (₹)</label>
                            <input
                              type="number"
                              value={counterPrice}
                              onChange={(e) => setCounterPrice(e.target.value)}
                              placeholder="Enter your offer..."
                              className="w-full px-4 py-2.5 rounded-xl border border-amber-200 bg-white dark:bg-zinc-900 dark:border-amber-900/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">Admin Message</label>
                            <input
                              type="text"
                              value={adminMessage}
                              onChange={(e) => setAdminMessage(e.target.value)}
                              placeholder="Reason for counter..."
                              className="w-full px-4 py-2.5 rounded-xl border border-amber-200 bg-white dark:bg-zinc-900 dark:border-amber-900/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => setShowCounterInput(false)} className="rounded-xl">Cancel</Button>
                          <Button 
                            className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl px-6"
                            onClick={() => handleBargainAction('counter')}
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                            Send Counter Offer
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              <DialogFooter className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 border-t border-gray-100 dark:border-white/5 pt-6">
                <div className="flex gap-2 justify-between sm:justify-start w-full sm:w-auto">
                  <Button type="button" variant="ghost" onClick={() => setViewQuote(null)} className="rounded-xl px-4 flex-1 sm:flex-none">
                    Close
                  </Button>
                  <Button type="button" variant="outline" className="gap-2 rounded-xl border-stone-200 dark:border-white/10 flex-1 sm:flex-none" onClick={() => window.print()}>
                    <FileText className="w-4 h-4" /> Print
                  </Button>
                </div>
 
                {viewQuote && !showCounterInput && (
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    {/* User Actions */}
                    {!isAdmin && viewQuote.status === 'countered' && (
                      <>
                        <Button 
                          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6 gap-2 w-full sm:w-auto"
                          onClick={() => handleBargainAction('accept')}
                          disabled={isSubmitting}
                        >
                          <Check className="w-4 h-4" /> Accept Counter
                        </Button>
                        <Button 
                          variant="outline"
                          className="border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl px-6 gap-2 w-full sm:w-auto"
                          onClick={() => handleBargainAction('reject')}
                          disabled={isSubmitting}
                        >
                          <X className="w-4 h-4" /> Reject Counter
                        </Button>
                      </>
                    )}
 
                    {/* Pay Now Button */}
                    {viewQuote.status === 'accepted' && viewQuote.paymentStatus !== 'paid' && (
                      <Button 
                        className="bg-[#D4AF37] hover:bg-[#B8962E] text-white rounded-xl px-6 gap-2 shadow-lg shadow-[#D4AF37]/20 w-full sm:w-auto"
                        onClick={handlePayment}
                        disabled={isRazorpayLoading || isSubmitting}
                      >
                        {isRazorpayLoading ? (
                          <RefreshCcw className="w-4 h-4 animate-spin" />
                        ) : (
                          <CreditCard className="w-4 h-4" />
                        )}
                        Pay Now
                      </Button>
                    )}
 
                    {/* Admin Actions */}
                    {isAdmin && (
                      <>
                        {viewQuote.status === 'pending' && (
                          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            <Button 
                              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6 gap-2 w-full sm:w-auto"
                              onClick={() => handleBargainAction('accept')}
                              disabled={isSubmitting}
                            >
                              <Check className="w-4 h-4" /> Accept
                            </Button>
                            <Button 
                              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl px-6 gap-2 w-full sm:w-auto"
                              onClick={() => setShowCounterInput(true)}
                              disabled={isSubmitting}
                            >
                              <ArrowRight className="w-4 h-4" /> Counter
                            </Button>
                            <Button 
                              variant="outline"
                              className="border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl px-6 gap-2 w-full sm:w-auto"
                              onClick={() => handleBargainAction('reject')}
                              disabled={isSubmitting}
                            >
                              <X className="w-4 h-4" /> Reject
                            </Button>
                          </div>
                        )}
                        {viewQuote.status === 'accepted' && (
                          <Button 
                            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-6 gap-2 w-full sm:w-auto"
                            onClick={() => handleBargainAction('convert')}
                            disabled={isSubmitting}
                          >
                            <Receipt className="w-4 h-4" /> Convert to Invoice
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

      </div>
      {/* Quote Request Dialog */}
      <QuoteRequestDialog
        isOpen={isQuoteRequestOpen}
        onClose={() => setIsQuoteRequestOpen(false)}
        products={cart.map(item => ({
          productId: item._id || item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.salePrice || item.price,
          clientId: item.clientId
        }))}
        onSuccess={() => {
          void fetchData(); // Refresh quotes list
        }}
      />

      {/* Admin Create Quote Modal */}
      <CreateQuoteModal
        isOpen={isCreateQuoteOpen}
        onClose={() => setIsCreateQuoteOpen(false)}
        onSuccess={() => {
          void fetchData(); // Refresh quotes list
        }}
      />
    </div>
  );
}

