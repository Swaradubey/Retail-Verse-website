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
import { formatINR, formatINRForPDF } from '../../utils/formatINR';
import { getFullImageUrl } from '../../utils/imageUrl';

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

    paymentQuoteRef.current = { ...viewQuote };
    paymentInvoiceRef.current = viewInvoice ? { ...viewInvoice } : null;

    const quote = paymentQuoteRef.current;
    const invoice = paymentInvoiceRef.current;

    setIsRazorpayLoading(true);

    try {
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

      const rzpOrder = await createRazorpayOrder(amount, {
        quotationId: quote._id,
        invoiceId: invoice?._id,
      });

      if (!rzpOrder.success) {
        toast.error(rzpOrder.message || 'Failed to create Razorpay order');
        setIsRazorpayLoading(false);
        return;
      }

      const cleanContact = String(quote.customerPhone || quote.phone || '')
        .replace(/\D/g, '')
        .slice(-10);

      const options: Record<string, any> = {
        key: rzpOrder.key_id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency || 'INR',
        name: 'Retail Verse',
        description: `Payment for quotation ${quote.quoteNumber || quote.reference || quote._id}`,
        order_id: rzpOrder.order_id,
        handler: async (response: any) => {
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

            if (verifyRes.success) {
              toast.success('Payment successful!');
              paymentQuoteRef.current = null;
              paymentInvoiceRef.current = null;
              void fetchData();
            } else {
              toast.error(verifyRes.message || 'Payment verification failed');
            }
          } catch (err: any) {
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
          color: '#2563EB',
        },
        modal: {
          ondismiss: function () {
            setIsRazorpayLoading(false);
            setIsRazorpayOpen(false);
          },
        },
      };

      setViewQuote(null);
      setIsRazorpayOpen(true);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const rzp = new (window as any).Razorpay(options);

      rzp.on('payment.failed', function (response: any) {
        toast.error(response.error?.description || response.error?.reason || 'Payment failed');
        setIsRazorpayLoading(false);
        setIsRazorpayOpen(false);
      });

      rzp.open();
    } catch (err: any) {
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
        setInvoices([]);
      }

      if (quoteRes.status === 'fulfilled' && quoteRes.value.success) {
        setQuotes(quoteRes.value.data || []);
      } else {
        setQuotes([]);
      }
    } catch (err: any) {
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

      const business = invoice?.business || {};

      const businessName = business.name || "";
      const businessTagline = business.tagline || "";
      const businessAddress = business.address || "";
      const businessEmail = business.email || "";
      const businessPhone = business.phone || "";
      const businessLogoUrl = getFullImageUrl(business.logo);

      let yCursor = 20;

      if (businessLogoUrl) {
        try {
          const logoExt = businessLogoUrl.split('.').pop()?.toLowerCase();
          const logoFormat = logoExt === 'png' ? 'PNG' : 'JPEG';
          doc.addImage(businessLogoUrl, logoFormat, 14, yCursor - 5, 30, 10);
        } catch {
          // logo fallback
        }
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      const nameStr = businessName ? businessName.toUpperCase() : "INVOICE";
      doc.text(nameStr, 14, yCursor);

      yCursor += 7;
      if (businessTagline) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.text(businessTagline, 14, yCursor);
        yCursor += 6;
        doc.setFont("helvetica", "normal");
      }

      if (businessAddress) {
        doc.setFontSize(9);
        doc.text(businessAddress, 14, yCursor);
        yCursor += 5;
      }
      if (businessPhone) {
        doc.setFontSize(9);
        doc.text(`Phone: ${businessPhone}`, 14, yCursor);
        yCursor += 5;
      }
      if (businessEmail) {
        doc.setFontSize(9);
        doc.text(businessEmail, 14, yCursor);
        yCursor += 5;
      }

      if (!businessName) {
        yCursor = 27;
      }

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("INVOICE", pageWidth - 14, 20, { align: "right" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`Invoice No: ${invoiceNo}`, pageWidth - 14, 34, { align: "right" });
      doc.text(`Order ID: ${orderId}`, pageWidth - 14, 42, { align: "right" });

      const headerEndY = Math.max(yCursor + 8, 55);
      doc.line(14, headerEndY, pageWidth - 14, headerEndY);

      const billToY = headerEndY + 10;
      doc.setFontSize(12);
      doc.text("Billed To", 14, billToY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(String(customerName), 14, billToY + 8);
      doc.text(String(customerEmail), 14, billToY + 15);

      doc.setFont("helvetica", "bold");
      doc.text("Payment Details", pageWidth - 14, billToY, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.text(`Method: ${paymentMethod}`, pageWidth - 14, billToY + 8, { align: "right" });
      doc.text(`Status: ${paymentStatus}`, pageWidth - 14, billToY + 15, { align: "right" });

      const tableStartY = billToY + 27;

      const tableBody = items.map((item: any) => {
        const name =
          item.name ||
          item.productName ||
          item.title ||
          item.product?.name ||
          "Item";

        const qty = item.quantity || item.qty || 1;
        const price = item.price || item.unitPrice || item.product?.price || 0;
        const rate = item.gstRate || 0;
        const itemTax = item.gstAmount || ((price * qty * rate) / 100);
        const sub = item.subtotal || item.total || (qty * price);

        return [
          name,
          String(qty),
          formatINRForPDF(price),
          `${rate}%`,
          formatINRForPDF(itemTax),
          formatINRForPDF(sub + itemTax)
        ];
      });

      autoTable(doc, {
        startY: tableStartY,
        head: [["Item", "Qty", "Price", "GST Rate", "Tax", "Amount"]],
        body: tableBody,
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 9,
          cellPadding: 3
        },
        headStyles: {
          fillColor: [11, 31, 58],
          textColor: [248, 250, 252]
        }
      });

      let finalY = (doc as any).lastAutoTable.finalY + 8;

      const pageHeight = doc.internal.pageSize.getHeight();
      const bottomMargin = 20;

      if (finalY + 40 > pageHeight - bottomMargin) {
        doc.addPage();
        finalY = 20;
      }

      const calcTotalTax = tax || items.reduce((s: number, i: any) => s + (i.gstAmount || ((i.price * (i.quantity || 1) * (i.gstRate || 0)) / 100)), 0);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Subtotal:", pageWidth - 70, finalY);
      doc.text(formatINRForPDF(subtotal), pageWidth - 14, finalY, { align: "right" });

      if (calcTotalTax > 0) {
        finalY += 6;
        doc.setFont("helvetica", "bold");
        doc.text("Total GST Tax:", pageWidth - 70, finalY);
        doc.text(formatINRForPDF(calcTotalTax), pageWidth - 14, finalY, { align: "right" });
      } else {
        finalY += 6;
        doc.setFont("helvetica", "normal");
        doc.text("Total GST Tax:", pageWidth - 70, finalY);
        doc.text(formatINRForPDF(0), pageWidth - 14, finalY, { align: "right" });
      }

      finalY += 10;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Total Amount:", pageWidth - 70, finalY);
      doc.text(formatINRForPDF(total), pageWidth - 14, finalY, { align: "right" });

      doc.save(`receipt-${invoiceNo}.pdf`);

      toast.success("PDF downloaded successfully.");
    } catch (error: any) {
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
        { title: 'Total Invoices', value: total, icon: Receipt, iconBg: 'bg-[#2563EB] text-[#F8FAFC]' },
        { title: 'Paid / Completed', value: completed, icon: CheckCircle2, iconBg: 'bg-[#2563EB] text-[#F8FAFC]' },
        { title: 'Pending Payment', value: pending, icon: Clock, iconBg: 'bg-[#FF6B00] text-[#F8FAFC]' },
        { title: 'Total Revenue', value: `₹${revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, icon: DollarSign, iconBg: 'bg-[#0B1F3A] text-[#F8FAFC]' },
      ];
    } else {
      const total = quotes.length;
      const accepted = quotes.filter((o) => String(o.status).toLowerCase() === 'accepted').length;
      const pending = quotes.filter((o) => {
        const ps = String(o.paymentStatus || '').toLowerCase();
        const s = String(o.status || '').toLowerCase();
        return s === 'pending' || s === 'countered' || (ps === 'pending' && s !== 'accepted' && s !== 'rejected');
      }).length;
      const paid = quotes.filter((o) => String(o.paymentStatus || '').toLowerCase() === 'paid').length;
      const totalAmount = quotes.reduce((acc, o) => acc + (Number(o.finalPrice || o.requestedPrice) || 0), 0);
      return [
        { title: 'Total Quotes', value: total, icon: FileText, iconBg: 'bg-[#2563EB] text-[#F8FAFC]' },
        { title: 'Accepted', value: accepted, icon: CheckCircle2, iconBg: 'bg-[#2563EB] text-[#F8FAFC]' },
        { title: 'Pending', value: pending, icon: Clock, iconBg: 'bg-[#FF6B00] text-[#F8FAFC]' },
        { title: 'Paid', value: paid, icon: CheckCircle2, iconBg: 'bg-[#2563EB] text-[#F8FAFC]' },
        { title: 'Total Value', value: `₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, icon: DollarSign, iconBg: 'bg-[#0B1F3A] text-[#F8FAFC]' },
      ];
    }
  }, [activeTab, invoices, quotes]);

  const getStatusColor = (status: string) => {
    const s = String(status).toLowerCase();
    if (['paid', 'completed', 'accepted'].includes(s)) return 'bg-[#2563EB] text-[#F8FAFC] border-[#2563EB]';
    if (['pending', 'countered'].includes(s)) return 'bg-[#FF6B00] text-[#F8FAFC] border-[#FF6B00]';
    if (['rejected', 'expired', 'failed'].includes(s)) return 'bg-[#0B1F3A] text-[#F8FAFC] border-[#0B1F3A]';
    return 'bg-[#0B1F3A] text-[#F8FAFC] border-[#0B1F3A]';
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'client';

  return (
    <div className="relative min-h-screen bg-[#F8FAFC] text-[#0B1F3A]">
      <div className="relative space-y-8 p-6 md:p-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#0B1F3A]">Quotes & Invoices</h1>
            <p className="text-[#0B1F3A]/70 mt-1">Manage and track all customer quotations and financial invoices.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchData} 
              disabled={isLoading}
              className="rounded-xl border-[#0B1F3A]/20 bg-[#F8FAFC] text-[#0B1F3A] hover:bg-[#2563EB] hover:text-[#F8FAFC] hover:border-[#2563EB] transition-colors"
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
                    className="rounded-xl bg-[#FF6B00] text-[#F8FAFC] hover:bg-[#2563EB] shadow-sm font-semibold whitespace-nowrap transition-colors"
                  >
                    + Quote
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-[#0B1F3A]/5 rounded-2xl w-fit border border-[#0B1F3A]/20">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'invoices' 
                ? 'bg-[#2563EB] text-[#F8FAFC] shadow-md' 
                : 'text-[#0B1F3A]/70 hover:text-[#0B1F3A]'
            }`}
          >
            Invoices
          </button>
          <button
            onClick={() => setActiveTab('quotes')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'quotes' 
                ? 'bg-[#2563EB] text-[#F8FAFC] shadow-md' 
                : 'text-[#0B1F3A]/70 hover:text-[#0B1F3A]'
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
              <Card className="relative overflow-hidden rounded-3xl border border-[#0B1F3A]/20 bg-[#F8FAFC] shadow-md hover:border-[#2563EB] transition-all">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#2563EB]" />
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 pt-5">
                  <CardTitle className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-[#0B1F3A]/70">
                    {stat.title}
                  </CardTitle>
                  <div className={`rounded-xl p-2.5 shadow-sm ${stat.iconBg}`}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent className="pb-5">
                  <div className="text-3xl font-bold text-[#0B1F3A]">{stat.value}</div>
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
            className="flex items-center gap-3 p-4 rounded-2xl bg-[#FF6B00]/10 border border-[#FF6B00] text-[#0B1F3A]"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-[#FF6B00]" />
            <p className="text-sm font-medium">{error}</p>
            <Button variant="ghost" size="sm" onClick={fetchData} className="ml-auto text-[#FF6B00] hover:bg-[#FF6B00] hover:text-[#F8FAFC]">Try Again</Button>
          </motion.div>
        )}

        {/* Data Table */}
        <Card className="overflow-hidden rounded-3xl border border-[#0B1F3A]/20 bg-[#F8FAFC] shadow-md">
          <CardHeader className="border-b border-[#0B1F3A]/10 pb-6 pt-6 md:pt-8">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
              <div>
                <CardTitle className="text-2xl font-bold text-[#0B1F3A]">
                  {activeTab === 'invoices' ? 'Invoice List' : 'Quotation List'}
                </CardTitle>
                <p className="mt-2 text-sm text-[#0B1F3A]/70">
                  {activeTab === 'invoices' 
                    ? 'Track financial records and payment statuses for completed orders.' 
                    : 'Manage price quotations sent to potential customers.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#2563EB]" />
                  <input
                    type="text"
                    placeholder={`Search ${activeTab}...`}
                    className="w-full rounded-xl border border-[#2563EB] bg-[#F8FAFC] py-2.5 pr-4 pl-10 text-sm text-[#0B1F3A] placeholder:text-[#0B1F3A]/50 transition-all focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 focus:outline-none md:w-64"
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
                <thead className="bg-[#0B1F3A] text-[11px] font-semibold tracking-[0.1em] text-[#F8FAFC] uppercase">
                  <tr>
                    <th className="px-6 py-4">{activeTab === 'invoices' ? 'Invoice No' : 'Quote No'}</th>
                    {activeTab === 'invoices' && <th className="px-6 py-4">Order ID</th>}
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0B1F3A]/10">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-sm text-[#0B1F3A]/70">
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCcw className="h-4 w-4 animate-spin text-[#2563EB]" />
                          <span>Loading data…</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-sm text-[#0B1F3A]/70">
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
                        className="group transition-all duration-200 hover:bg-[#2563EB]/5"
                      >
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm font-bold text-[#2563EB]">
                            {item.invoiceNumber || item.quoteNumber}
                          </span>
                        </td>
                        {activeTab === 'invoices' && (
                          <td className="px-6 py-4">
                            <span className="font-mono text-xs text-[#0B1F3A]/70">
                              {item.orderId}
                            </span>
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-[#0B1F3A]">
                              {item.customerName || 'Unknown'}
                            </span>
                            <span className="text-[10px] text-[#0B1F3A]/60">
                              {item.createdAt
                                ? new Date(item.createdAt).toISOString().split('T')[0]
                                : '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold text-[#0B1F3A]">
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
                              className="rounded-full border-[#0B1F3A]/20 bg-[#F8FAFC] text-[#0B1F3A] hover:border-[#2563EB] hover:bg-[#2563EB] hover:text-[#F8FAFC] transition-colors cursor-pointer"
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
          <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl border border-[#0B1F3A] w-[95vw] sm:max-w-2xl bg-[#F8FAFC] text-[#0B1F3A] p-0 pb-4">
            <div className="p-4 sm:p-8">
              <DialogHeader className="mb-6 flex flex-row items-center justify-between pr-10">
                <DialogTitle className="flex flex-col sm:flex-row items-start sm:items-center gap-3 text-2xl sm:text-3xl font-black text-[#0B1F3A]">
                  <div className="p-3 bg-[#2563EB]/10 rounded-2xl text-[#2563EB]">
                    <Receipt className="h-6 w-6 sm:h-7 sm:w-7" />
                  </div>
                  Invoice Details
                </DialogTitle>
                {viewInvoice && (user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'client') && (
                  <button
                    type="button"
                    title="Delete Invoice"
                    onClick={handleDeleteInvoice}
                    disabled={isDeleting}
                    className="p-2 rounded-full text-[#FF6B00] hover:bg-[#FF6B00]/10 disabled:opacity-50 transition-colors cursor-pointer"
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 p-4 sm:p-6 bg-[#F8FAFC] rounded-3xl border border-[#0B1F3A]/20">
                    <div className="space-y-2">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#0B1F3A]/70">Billed To</p>
                      <p className="font-bold text-base sm:text-lg text-[#0B1F3A] break-words">{viewInvoice.customerName}</p>
                      <p className="text-[#0B1F3A]/70 break-words">{viewInvoice.customerEmail}</p>
                    </div>
                    <div className="space-y-2 sm:text-right">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#0B1F3A]/70">Reference</p>
                      <p className="font-bold text-base sm:text-lg text-[#2563EB] break-words">{viewInvoice.invoiceNumber}</p>
                      <p className="text-[#0B1F3A]/70 break-words">Order: {viewInvoice.orderId}</p>
                      <p className="text-[#0B1F3A]/70">{new Date(viewInvoice.createdAt).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="border border-[#0B1F3A]/20 rounded-3xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[500px]">
                        <thead className="bg-[#0B1F3A] text-[10px] font-extrabold uppercase tracking-widest text-[#F8FAFC]">
                          <tr>
                            <th className="px-4 sm:px-6 py-4">Item</th>
                            <th className="px-4 py-4 text-center">Qty</th>
                            <th className="px-4 py-4 text-right">Price</th>
                            <th className="px-4 py-4 text-center">GST Rate</th>
                            <th className="px-4 py-4 text-right">Tax</th>
                            <th className="px-4 sm:px-6 py-4 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#0B1F3A]/10">
                          {viewInvoice.items?.map((item: any, i: number) => {
                            const qty = item.quantity || item.qty || 1;
                            const price = item.price || item.unitPrice || item.product?.price || 0;
                            const rate = item.gstRate || 0;
                            const itemTax = item.gstAmount || ((price * qty * rate) / 100);
                            const sub = item.subtotal || item.total || (qty * price);
                            return (
                              <tr key={i}>
                                <td className="px-4 sm:px-6 py-4 font-semibold text-[#0B1F3A] break-words">{item.name || item.productName || "Item"}</td>
                                <td className="px-4 py-4 text-center text-[#0B1F3A]/70">{qty}</td>
                                <td className="px-4 py-4 text-right text-[#0B1F3A]/70">{formatINR(price)}</td>
                                <td className="px-4 py-4 text-center text-[#0B1F3A]/70">{rate}%</td>
                                <td className="px-4 py-4 text-right text-[#2563EB] font-medium">{formatINR(itemTax)}</td>
                                <td className="px-4 sm:px-6 py-4 text-right font-bold text-[#0B1F3A]">{formatINR(sub + itemTax)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-[#F8FAFC] font-bold border-t border-[#0B1F3A]/20">
                          <tr>
                            <td colSpan={5} className="px-4 sm:px-6 py-3 text-right text-[#0B1F3A]/70">Subtotal</td>
                            <td className="px-4 sm:px-6 py-3 text-right text-[#0B1F3A]">{formatINR(viewInvoice.subtotal || 0)}</td>
                          </tr>
                          {(viewInvoice.tax || 0) > 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 sm:px-6 py-2.5 text-right text-xs text-[#2563EB] font-bold">Total GST Tax</td>
                              <td className="px-4 sm:px-6 py-2.5 text-right text-xs text-[#2563EB] font-bold">{formatINR(viewInvoice.tax || 0)}</td>
                            </tr>
                          ) : (
                            <tr>
                              <td colSpan={5} className="px-4 sm:px-6 py-3 text-right text-[#0B1F3A]/70">Total GST Tax</td>
                              <td className="px-4 sm:px-6 py-3 text-right text-[#0B1F3A]">{formatINR(0)}</td>
                            </tr>
                          )}
                          <tr className="text-base sm:text-lg bg-[#2563EB] text-[#F8FAFC]">
                            <td colSpan={5} className="px-4 sm:px-6 py-5 text-right font-black">Total Amount</td>
                            <td className="px-4 sm:px-6 py-5 text-right font-black">{formatINR(viewInvoice.totalAmount || viewInvoice.total || 0)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 sm:p-5 bg-[#F8FAFC] rounded-2xl border border-[#0B1F3A]/20">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#0B1F3A]/70 mb-1">Payment Method</p>
                      <p className="font-bold text-[#0B1F3A] capitalize">{viewInvoice.paymentMethod || 'N/A'}</p>
                    </div>
                    <div className="p-4 sm:p-5 bg-[#F8FAFC] rounded-2xl border border-[#0B1F3A]/20">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#0B1F3A]/70 mb-1">Payment Status</p>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black capitalize ${getStatusColor(viewInvoice.paymentStatus)}`}>
                        {viewInvoice.paymentStatus || 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter className="mt-10 flex flex-col sm:flex-row gap-3 border-t border-[#0B1F3A]/10 pt-6">
                <Button type="button" variant="ghost" onClick={() => setViewInvoice(null)} className="rounded-xl px-6 w-full sm:w-auto border border-[#0B1F3A]/20 text-[#0B1F3A] hover:bg-[#2563EB] hover:text-[#F8FAFC]">
                  Close
                </Button>
                <Button 
                  type="button" 
                  disabled={isDownloading}
                  className="gap-2 bg-[#FF6B00] hover:bg-[#2563EB] text-[#F8FAFC] rounded-xl px-6 w-full sm:w-auto disabled:opacity-70 transition-colors" 
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
                <Button type="button" className="gap-2 bg-[#0B1F3A] hover:bg-[#2563EB] text-[#F8FAFC] rounded-xl px-6 w-full sm:w-auto transition-colors" onClick={() => window.print()}>
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
          <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl border border-[#0B1F3A] w-[95vw] sm:max-w-3xl bg-[#F8FAFC] text-[#0B1F3A] p-0 pb-4">
            <div className="p-4 sm:p-8">
              <DialogHeader className="mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <DialogTitle className="flex items-center gap-3 text-2xl sm:text-3xl font-black text-[#0B1F3A]">
                    <div className="p-3 bg-[#2563EB]/10 rounded-2xl text-[#2563EB]">
                      <FileText className="h-6 w-6 sm:h-7 sm:w-7" />
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 sm:p-6 bg-[#F8FAFC] rounded-3xl border border-[#0B1F3A]/20">
                    <div className="space-y-2">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#0B1F3A]/70">Prepared For</p>
                      <p className="font-bold text-base sm:text-lg text-[#0B1F3A] break-words">{viewQuote.customerName}</p>
                      <p className="text-[#0B1F3A]/70 break-words">{viewQuote.customerEmail}</p>
                    </div>
                    <div className="space-y-2 sm:text-right">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#0B1F3A]/70">Reference</p>
                      <p className="font-bold text-base sm:text-lg text-[#2563EB] break-words">{viewQuote.quoteNumber}</p>
                      <p className="text-[#0B1F3A]/70 break-words">Valid Until: {viewQuote.validUntil ? new Date(viewQuote.validUntil).toLocaleDateString() : 'N/A'}</p>
                      <p className="text-[#0B1F3A]/70">{new Date(viewQuote.createdAt).toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Messages */}
                  {(viewQuote.message || viewQuote.adminMessage) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {viewQuote.message && (
                        <div className="p-4 bg-[#F8FAFC] rounded-2xl border border-[#2563EB]">
                          <div className="flex items-center gap-2 mb-2">
                            <MessageSquare className="w-3.5 h-3.5 text-[#2563EB]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB]">Customer Message</span>
                          </div>
                          <p className="italic text-[#0B1F3A]">"{viewQuote.message}"</p>
                        </div>
                      )}
                      {viewQuote.adminMessage && (
                        <div className="p-4 bg-[#F8FAFC] rounded-2xl border border-[#FF6B00]">
                          <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-3.5 h-3.5 text-[#FF6B00]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF6B00]">Admin Response</span>
                          </div>
                          <p className="italic text-[#0B1F3A]">"{viewQuote.adminMessage}"</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payment Status Info */}
                  {viewQuote.paymentStatus === 'paid' && (
                    <div className="p-5 bg-[#2563EB]/10 rounded-2xl border border-[#2563EB] flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#2563EB] mb-1">Payment Status</p>
                        <p className="font-bold text-[#0B1F3A]">Successfully Paid via Razorpay</p>
                      </div>
                      <CheckCircle2 className="h-6 w-6 text-[#2563EB]" />
                    </div>
                  )}

                  {/* Products Table */}
                  <div className="border border-[#0B1F3A]/20 rounded-3xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[550px]">
                        <thead className="bg-[#0B1F3A] text-[10px] font-extrabold uppercase tracking-widest text-[#F8FAFC]">
                          <tr>
                            <th className="px-4 sm:px-6 py-4">Product</th>
                            <th className="px-4 sm:px-6 py-4 text-center">Qty</th>
                            <th className="px-4 sm:px-6 py-4 text-right">Original Price</th>
                            <th className="px-4 sm:px-6 py-4 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#0B1F3A]/10">
                          {viewQuote.products?.map((item: any, i: number) => (
                            <tr key={i}>
                              <td className="px-4 sm:px-6 py-4 font-semibold text-[#0B1F3A] break-words">{item.name}</td>
                              <td className="px-4 sm:px-6 py-4 text-center text-[#0B1F3A]/70">{item.quantity}</td>
                              <td className="px-4 sm:px-6 py-4 text-right text-[#0B1F3A]/70">₹{Number(item.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="px-4 sm:px-6 py-4 text-right font-bold text-[#0B1F3A]">₹{Number(item.price * item.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-[#F8FAFC] font-bold border-t border-[#0B1F3A]/20">
                          <tr className="bg-[#F8FAFC]">
                            <td colSpan={3} className="px-4 sm:px-6 py-4 text-right text-[#0B1F3A]/70 uppercase tracking-wider text-[10px]">Requested Price</td>
                            <td className="px-4 sm:px-6 py-4 text-right text-[#2563EB] font-black text-base sm:text-lg">₹{Number(viewQuote.requestedPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                          {viewQuote.counterPrice && (
                            <tr className="bg-[#FF6B00]/10">
                              <td colSpan={3} className="px-4 sm:px-6 py-4 text-right text-[#FF6B00] uppercase tracking-wider text-[10px]">Counter Offer</td>
                              <td className="px-4 sm:px-6 py-4 text-right text-[#FF6B00] font-black text-base sm:text-lg">₹{Number(viewQuote.counterPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          )}
                          {viewQuote.finalPrice && (
                            <tr className="bg-[#2563EB]/10">
                              <td colSpan={3} className="px-4 sm:px-6 py-5 text-right text-[#2563EB] uppercase tracking-wider text-[10px]">Final Accepted Price</td>
                              <td className="px-4 sm:px-6 py-5 text-right text-[#2563EB] font-black text-xl sm:text-2xl">₹{Number(viewQuote.finalPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
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
                        className="space-y-4 p-6 bg-[#F8FAFC] rounded-3xl border border-[#0B1F3A]/20"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-[#0B1F3A]">Counter Price (₹)</label>
                            <input
                              type="number"
                              value={counterPrice}
                              onChange={(e) => setCounterPrice(e.target.value)}
                              placeholder="Enter your offer..."
                              className="w-full px-4 py-2.5 rounded-xl border border-[#0B1F3A]/20 bg-[#F8FAFC] text-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] transition-all"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-[#0B1F3A]">Admin Message</label>
                            <input
                              type="text"
                              value={adminMessage}
                              onChange={(e) => setAdminMessage(e.target.value)}
                              placeholder="Reason for counter..."
                              className="w-full px-4 py-2.5 rounded-xl border border-[#0B1F3A]/20 bg-[#F8FAFC] text-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] transition-all"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => setShowCounterInput(false)} className="rounded-xl border border-[#0B1F3A]/20 text-[#0B1F3A] hover:bg-[#2563EB] hover:text-[#F8FAFC]">Cancel</Button>
                          <Button 
                            className="bg-[#FF6B00] hover:bg-[#2563EB] text-[#F8FAFC] rounded-xl px-6 transition-colors"
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

              <DialogFooter className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 border-t border-[#0B1F3A]/10 pt-6">
                <div className="flex gap-2 justify-between sm:justify-start w-full sm:w-auto">
                  <Button type="button" variant="ghost" onClick={() => setViewQuote(null)} className="rounded-xl px-4 flex-1 sm:flex-none border border-[#0B1F3A]/20 text-[#0B1F3A] hover:bg-[#2563EB] hover:text-[#F8FAFC]">
                    Close
                  </Button>
                  <Button type="button" variant="outline" className="gap-2 rounded-xl border border-[#0B1F3A]/20 text-[#0B1F3A] hover:bg-[#2563EB] hover:text-[#F8FAFC] flex-1 sm:flex-none" onClick={() => window.print()}>
                    <FileText className="w-4 h-4" /> Print
                  </Button>
                </div>
 
                {viewQuote && !showCounterInput && (
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    {/* User Actions */}
                    {!isAdmin && viewQuote.status === 'countered' && (
                      <>
                        <Button 
                          className="bg-[#2563EB] hover:bg-[#0B1F3A] text-[#F8FAFC] rounded-xl px-6 gap-2 w-full sm:w-auto transition-colors"
                          onClick={() => handleBargainAction('accept')}
                          disabled={isSubmitting}
                        >
                          <Check className="w-4 h-4" /> Accept Counter
                        </Button>
                        <Button 
                          variant="outline"
                          className="border border-[#FF6B00] text-[#FF6B00] hover:bg-[#FF6B00] hover:text-[#F8FAFC] rounded-xl px-6 gap-2 w-full sm:w-auto transition-colors"
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
                        className="bg-[#FF6B00] hover:bg-[#2563EB] text-[#F8FAFC] rounded-xl px-6 gap-2 shadow-lg shadow-[#FF6B00]/20 w-full sm:w-auto transition-colors"
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
                              className="bg-[#2563EB] hover:bg-[#0B1F3A] text-[#F8FAFC] rounded-xl px-6 gap-2 w-full sm:w-auto transition-colors"
                              onClick={() => handleBargainAction('accept')}
                              disabled={isSubmitting}
                            >
                              <Check className="w-4 h-4" /> Accept
                            </Button>
                            <Button 
                              className="bg-[#FF6B00] hover:bg-[#2563EB] text-[#F8FAFC] rounded-xl px-6 gap-2 w-full sm:w-auto transition-colors"
                              onClick={() => setShowCounterInput(true)}
                              disabled={isSubmitting}
                            >
                              <ArrowRight className="w-4 h-4" /> Counter
                            </Button>
                            <Button 
                              variant="outline"
                              className="border border-[#FF6B00] text-[#FF6B00] hover:bg-[#FF6B00] hover:text-[#F8FAFC] rounded-xl px-6 gap-2 w-full sm:w-auto transition-colors"
                              onClick={() => handleBargainAction('reject')}
                              disabled={isSubmitting}
                            >
                              <X className="w-4 h-4" /> Reject
                            </Button>
                          </div>
                        )}
                        {viewQuote.status === 'accepted' && (
                          <Button 
                            className="bg-[#2563EB] hover:bg-[#0B1F3A] text-[#F8FAFC] rounded-xl px-6 gap-2 w-full sm:w-auto transition-colors"
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
          void fetchData();
        }}
      />

      {/* Admin Create Quote Modal */}
      <CreateQuoteModal
        isOpen={isCreateQuoteOpen}
        onClose={() => setIsCreateQuoteOpen(false)}
        onSuccess={() => {
          void fetchData();
        }}
      />
    </div>
  );
}
