import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import {
  Receipt,
  ArrowLeft,
  FileText,
  Printer,
  Download,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Separator } from '../../components/ui/separator';
import ApiService from '../../api/apiService';
import { toast } from 'sonner';
import { formatINR, formatINRForPDF } from '../../utils/formatINR';
import { getFullImageUrl } from '../../utils/imageUrl';

export function InvoiceDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchInvoice = async () => {
      if (!orderId) return;
      setIsLoading(true);
      setError(null);
      try {
        console.log("Invoice orderId clicked:", orderId);
        console.log("Invoice API URL:", `/api/superadmin/invoices/${orderId}`);
        
        const response = await ApiService.get(`/superadmin/invoices/${orderId}`, { pageName: 'Invoice Detail' });
        if (response.success && response.data) {
          setInvoice(response.data);
        } else {
          setError(response.message || 'Could not find invoice for this order.');
        }
      } catch (err: any) {
        console.error('Failed to fetch invoice', err);
        setError(err.message || 'An error occurred while fetching the invoice.');
      } finally {
        setIsLoading(false);
      }
    };

    void fetchInvoice();
  }, [orderId]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    try {
      setIsDownloading(true);

      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();

      const invoiceNo =
        invoice?.invoiceNo ||
        invoice?.invoiceNumber ||
        invoice?.orderId ||
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
          // logo as text fallback
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
        const amount = item.total || item.subtotal || (qty * price);

        return [
          name,
          String(qty),
          formatINRForPDF(price),
          formatINRForPDF(amount)
        ];
      });

      autoTable(doc, {
        startY: tableStartY,
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

      let finalY = (doc as any).lastAutoTable.finalY + 8;

      const pageHeight = doc.internal.pageSize.getHeight();
      const bottomMargin = 20;

      if (finalY + 30 > pageHeight - bottomMargin) {
        doc.addPage();
        finalY = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Subtotal:", pageWidth - 60, finalY);
      doc.text(formatINRForPDF(subtotal), pageWidth - 14, finalY, { align: "right" });

      finalY += 7;
      doc.text("Tax:", pageWidth - 60, finalY);
      doc.text(formatINRForPDF(tax), pageWidth - 14, finalY, { align: "right" });

      finalY += 10;
      doc.setFontSize(14);
      doc.text("Total Amount:", pageWidth - 60, finalY);
      doc.text(formatINRForPDF(total), pageWidth - 14, finalY, { align: "right" });

      doc.save(`receipt-${invoiceNo}.pdf`);

      toast.success("PDF downloaded successfully.");
    } catch (error: any) {
      console.error("PDF generation failed:", error);
      toast.error(error?.message || "Failed to generate PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-[#D4AF37]" />
        <p className="text-muted-foreground animate-pulse font-medium">Fetching invoice details...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 rounded-full bg-rose-50 p-4 dark:bg-rose-900/20">
          <AlertCircle className="h-10 w-10 text-rose-600 dark:text-rose-400" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Invoice Not Found</h2>
        <p className="mt-2 max-w-md text-muted-foreground">
          {error || "The invoice you're looking for doesn't exist or there was an error retrieving it."}
        </p>
        <Button
          variant="outline"
          className="mt-8 rounded-xl border-[#EADFBF] dark:border-[#3d3522]"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Button>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pb-20 bg-[linear-gradient(180deg,#fffdf8_0%,#fff8e8_45%,#fffdf7_100%)] dark:from-[#1a1510] dark:via-[#14120d] dark:to-[#1a1610]">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.1),transparent_70%)] pointer-events-none" />
      
      <div className="relative mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Button
            variant="ghost"
            className="w-fit rounded-xl text-muted-foreground hover:bg-[#F4E7C5]/30 hover:text-[#D4AF37]"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Orders
          </Button>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="rounded-xl border-[#EADFBF] bg-white/50 backdrop-blur-sm dark:border-[#3d3522] dark:bg-black/20"
              onClick={handlePrint}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button
              className="rounded-xl bg-[#D4AF37] text-white shadow-lg shadow-[#D4AF37]/20 hover:bg-[#B8860B] disabled:opacity-70"
              onClick={handleDownloadPDF}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </>
              )}
            </Button>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div ref={invoiceRef} className="invoice-pdf-content">
            <Card className="overflow-hidden rounded-[2rem] border-[#EADFBF] bg-white shadow-2xl dark:border-[#3d3522] dark:bg-[#1a1610] print:border-none print:shadow-none">
            {/* Invoice Header */}
            <div className="bg-[#1a1610] p-8 text-white sm:p-12 dark:bg-[#0c0a08]">
              <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-start">
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    {(() => {
                      const logoUrl = getFullImageUrl(invoice.business?.logo);
                      return logoUrl ? (
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white overflow-hidden shadow-lg">
                          <img
                            src={logoUrl}
                            alt={invoice.business?.name || "Store logo"}
                            className="h-full w-full object-cover"
                            crossOrigin="anonymous"
                            onError={(e) => {
                              (e.target as HTMLImageElement).onerror = null;
                              (e.target as HTMLImageElement).style.display = 'none';
                              const parent = (e.target as HTMLImageElement).closest('.flex');
                              if (parent) (parent as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D4AF37] text-white shadow-lg">
                          <Receipt className="h-7 w-7" />
                        </div>
                      );
                    })()}
                    <div>
                      <h1 className="text-2xl font-black tracking-tight uppercase">
                        {invoice.business?.name || "Business Profile"}
                      </h1>
                      <p className="text-[10px] font-bold tracking-[0.2em] text-[#D4AF37]">
                        {invoice.business?.website
                          ? invoice.business.website.replace(/^https?:\/\//, '').toUpperCase()
                          : "STORE INVOICE"}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm text-zinc-400">
                    {invoice.business?.address ? (
                      <p>{invoice.business.address}</p>
                    ) : null}
                    {invoice.business?.phone ? (
                      <p>Phone: {invoice.business.phone}</p>
                    ) : null}
                    {invoice.business?.email ? (
                      <p>Email: {invoice.business.email}</p>
                    ) : null}
                    {invoice.business?.taxNumber ? (
                      <p>GST/VAT: {invoice.business.taxNumber}</p>
                    ) : null}
                    {invoice.business?.website ? (
                      <p>
                        Website:{" "}
                        <a
                          href={invoice.business.website.startsWith("http") ? invoice.business.website : `https://${invoice.business.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#D4AF37] hover:underline"
                        >
                          {invoice.business.website}
                        </a>
                      </p>
                    ) : null}
                  </div>
                </div>
                
                <div className="text-left sm:text-right">
                  <h2 className="text-4xl font-black uppercase text-[#D4AF37]">Invoice</h2>
                  <div className="mt-6 space-y-2">
                    <p className="text-sm font-bold uppercase tracking-widest text-zinc-500">Invoice Number</p>
                    <p className="text-xl font-mono font-bold">{invoice.invoiceNo || invoice.invoiceNumber}</p>
                    <div className="mt-4 flex flex-col gap-1">
                      <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest">Order ID</p>
                      <p className="text-sm font-mono text-zinc-300">#{invoice.orderId}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <CardContent className="p-8 sm:p-12">
              {/* Billing Info */}
              <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
                <div>
                  <h3 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[#D4AF37]">Billed To</h3>
                  <div className="space-y-2">
                    <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{invoice.customerName}</p>
                    <p className="text-muted-foreground">{invoice.customerEmail}</p>
                    <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FFFBEB] px-4 py-2 text-xs font-bold text-[#D97706] dark:bg-[#451a03] dark:text-[#FBBF24]">
                      <Clock className="h-3.5 w-3.5" />
                      Issued on {new Date(invoice.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                </div>
                
                <div className="md:text-right">
                  <h3 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[#D4AF37]">Payment Details</h3>
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold uppercase tracking-wider shadow-sm ring-1 ring-inset ring-[#EADFBF] dark:ring-[#3d3522]">
                      <div className={`h-2 w-2 rounded-full ${String(invoice.paymentStatus).toLowerCase() === 'paid' || String(invoice.paymentStatus).toLowerCase() === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      {invoice.paymentStatus || 'Pending'}
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Method: <span className="font-bold text-zinc-900 dark:text-zinc-50 uppercase">{invoice.paymentMethod || 'N/A'}</span>
                    </p>
                    {String(invoice.paymentStatus).toLowerCase() === 'paid' && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold italic">
                        Transaction completed successfully
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="mt-16 overflow-hidden rounded-3xl border border-[#EADFBF] dark:border-[#3d3522]">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-[#F4E7C5]/30 text-xs font-black uppercase tracking-widest text-[#6B7280] dark:bg-[#2a2318] dark:text-[#9CA3AF]">
                      <th className="px-6 py-5">Description</th>
                      <th className="px-6 py-5 text-center">Quantity</th>
                      <th className="px-6 py-5 text-right">Unit Price</th>
                      <th className="px-6 py-5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EADFBF]/50 dark:divide-[#3d3522]">
                    {invoice.items?.map((item: any, i: number) => (
                      <tr key={i} className="text-zinc-900 dark:text-zinc-100">
                        <td className="px-6 py-5 font-bold">{item.name}</td>
                        <td className="px-6 py-5 text-center font-medium">{item.quantity}</td>
                        <td className="px-6 py-5 text-right tabular-nums">{formatINR(item.price)}</td>
                        <td className="px-6 py-5 text-right font-bold tabular-nums">{formatINR(item.total || item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="mt-12 flex justify-end">
                <div className="w-full max-w-xs space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground font-medium">Subtotal</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">{formatINR(invoice.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground font-medium">Tax (0%)</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">{formatINR(invoice.tax || 0)}</span>
                  </div>
                  <Separator className="bg-[#EADFBF] dark:bg-[#3d3522]" />
                  <div className="flex justify-between items-center py-2">
                    <span className="text-lg font-black uppercase tracking-wider text-[#D4AF37]">Total</span>
                    <span className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{formatINR(invoice.total || invoice.totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Footer Note */}
              <div className="mt-20 rounded-2xl bg-[#FFFBEB] p-6 text-center dark:bg-[#451a03]/30">
                <div className="flex justify-center mb-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Thank you for your business!</p>
                <p className="mt-1 text-xs text-muted-foreground">If you have any questions about this invoice, please contact support.</p>
              </div>
            </CardContent>
          </Card>
          </div>
        </motion.div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:border-none {
            border: none !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          main, .relative.mx-auto.max-w-4xl, .relative.mx-auto.max-w-4xl * {
            visibility: visible;
          }
          .relative.mx-auto.max-w-4xl {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          button, nav, footer, .mb-8 {
            display: none !important;
          }
        }
      `}} />
    </div>
  );
}
