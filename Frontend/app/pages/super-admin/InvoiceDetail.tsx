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
import { Card, CardContent } from '../../components/ui/card';
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
        const response = await ApiService.get(`/superadmin/invoices/${orderId}`, { pageName: 'Invoice Detail' });
        if (response.success && response.data) {
          setInvoice(response.data);
        } else {
          setError(response.message || 'Could not find invoice for this order.');
        }
      } catch (err: any) {
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

      const orderIdStr = invoice?.orderId || "N/A";

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
          // fallback
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
      doc.text(`Order ID: ${orderIdStr}`, pageWidth - 14, 42, { align: "right" });

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

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4 bg-[#F8FAFC] text-[#0B1F3A]">
        <Loader2 className="h-10 w-10 animate-spin text-[#2563EB]" />
        <p className="animate-pulse font-medium text-[#0B1F3A]/70">Fetching invoice details...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center bg-[#F8FAFC] text-[#0B1F3A]">
        <div className="mb-4 rounded-full bg-[#FF6B00]/10 p-4">
          <AlertCircle className="h-10 w-10 text-[#FF6B00]" />
        </div>
        <h2 className="text-2xl font-bold text-[#0B1F3A]">Invoice Not Found</h2>
        <p className="mt-2 max-w-md text-[#0B1F3A]/70">
          {error || "The invoice you're looking for doesn't exist or there was an error retrieving it."}
        </p>
        <Button
          variant="outline"
          className="mt-8 rounded-xl border-[#0B1F3A]/20 text-[#0B1F3A] hover:bg-[#2563EB] hover:text-[#F8FAFC] transition-colors"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Button>
      </div>
    );
  }

  const isPaid = String(invoice.paymentStatus).toLowerCase() === 'paid' || String(invoice.paymentStatus).toLowerCase() === 'completed';

  return (
    <div className="relative min-h-screen pb-20 bg-[#F8FAFC] text-[#0B1F3A]">
      <div className="relative mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Button
            variant="ghost"
            className="w-fit rounded-xl text-[#0B1F3A]/70 hover:bg-[#2563EB]/10 hover:text-[#2563EB] transition-colors cursor-pointer"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Orders
          </Button>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="rounded-xl border-[#0B1F3A]/20 bg-[#F8FAFC] text-[#0B1F3A] hover:bg-[#2563EB] hover:text-[#F8FAFC] transition-colors cursor-pointer"
              onClick={handlePrint}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button
              className="rounded-xl bg-[#FF6B00] text-[#F8FAFC] hover:bg-[#2563EB] disabled:opacity-70 transition-colors shadow-md cursor-pointer"
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
            <Card className="overflow-hidden rounded-[2rem] border border-[#0B1F3A]/20 bg-[#F8FAFC] shadow-2xl print:border-none print:shadow-none">
              {/* Invoice Header */}
              <div className="bg-[#0B1F3A] p-8 text-[#F8FAFC] sm:p-12">
                <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-6">
                      {(() => {
                        const logoUrl = getFullImageUrl(invoice.business?.logo);
                        return logoUrl ? (
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F8FAFC] overflow-hidden shadow-lg border border-[#2563EB]">
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
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF6B00] text-[#F8FAFC] shadow-lg">
                            <Receipt className="h-7 w-7" />
                          </div>
                        );
                      })()}
                      <div>
                        <h1 className="text-2xl font-black tracking-tight uppercase text-[#F8FAFC]">
                          {invoice.business?.name || "Business Profile"}
                        </h1>
                        <p className="text-[10px] font-bold tracking-[0.2em] text-[#2563EB]">
                          {invoice.business?.website
                            ? invoice.business.website.replace(/^https?:\/\//, '').toUpperCase()
                            : "STORE INVOICE"}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm text-[#F8FAFC]/80">
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
                            className="text-[#2563EB] hover:underline"
                          >
                            {invoice.business.website}
                          </a>
                        </p>
                      ) : null}
                    </div>
                  </div>
                  
                  <div className="text-left sm:text-right">
                    <h2 className="text-4xl font-black uppercase text-[#FF6B00]">Invoice</h2>
                    <div className="mt-6 space-y-2">
                      <p className="text-sm font-bold uppercase tracking-widest text-[#F8FAFC]/70">Invoice Number</p>
                      <p className="text-xl font-mono font-bold text-[#F8FAFC]">{invoice.invoiceNo || invoice.invoiceNumber}</p>
                      <div className="mt-4 flex flex-col gap-1">
                        <p className="text-xs text-[#F8FAFC]/70 uppercase font-bold tracking-widest">Order ID</p>
                        <p className="text-sm font-mono text-[#F8FAFC]/90">#{invoice.orderId}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <CardContent className="p-8 sm:p-12 bg-[#F8FAFC] text-[#0B1F3A]">
                {/* Billing Info */}
                <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
                  <div>
                    <h3 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[#2563EB]">Billed To</h3>
                    <div className="space-y-2">
                      <p className="text-xl font-bold text-[#0B1F3A]">{invoice.customerName}</p>
                      <p className="text-[#0B1F3A]/70">{invoice.customerEmail}</p>
                      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#2563EB]/10 border border-[#2563EB]/30 px-4 py-2 text-xs font-bold text-[#2563EB]">
                        <Clock className="h-3.5 w-3.5" />
                        Issued on {new Date(invoice.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                  
                  <div className="md:text-right">
                    <h3 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[#2563EB]">Payment Details</h3>
                    <div className="space-y-3">
                      <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold uppercase tracking-wider text-[#F8FAFC] ${isPaid ? 'bg-[#2563EB]' : 'bg-[#FF6B00]'}`}>
                        <div className="h-2 w-2 rounded-full bg-[#F8FAFC]" />
                        {invoice.paymentStatus || 'Pending'}
                      </div>
                      <p className="text-sm font-medium text-[#0B1F3A]/70">
                        Method: <span className="font-bold text-[#0B1F3A] uppercase">{invoice.paymentMethod || 'N/A'}</span>
                      </p>
                      {isPaid && (
                        <p className="text-xs text-[#2563EB] font-bold italic">
                          Transaction completed successfully
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="mt-16 overflow-hidden rounded-3xl border border-[#0B1F3A]/20">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[#0B1F3A] text-xs font-black uppercase tracking-widest text-[#F8FAFC]">
                        <th className="px-6 py-5">Description</th>
                        <th className="px-4 py-5 text-center">Quantity</th>
                        <th className="px-6 py-5 text-right">Unit Price</th>
                        <th className="px-4 py-5 text-center">GST Rate</th>
                        <th className="px-6 py-5 text-right">Tax</th>
                        <th className="px-6 py-5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#0B1F3A]/10">
                      {invoice.items?.map((item: any, i: number) => {
                        const qty = item.quantity || item.qty || 1;
                        const price = item.price || item.unitPrice || 0;
                        const rate = item.gstRate || 0;
                        const itemTax = item.gstAmount || ((price * qty * rate) / 100);
                        const sub = item.subtotal || item.total || (qty * price);
                        return (
                          <tr key={i} className="text-[#0B1F3A]">
                            <td className="px-6 py-5 font-bold">{item.name}</td>
                            <td className="px-4 py-5 text-center font-medium">{qty}</td>
                            <td className="px-6 py-5 text-right tabular-nums">{formatINR(price)}</td>
                            <td className="px-4 py-5 text-center font-medium">{rate}%</td>
                            <td className="px-6 py-5 text-right tabular-nums text-[#2563EB] font-medium">{formatINR(itemTax)}</td>
                            <td className="px-6 py-5 text-right font-bold tabular-nums">{formatINR(sub + itemTax)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="mt-12 flex justify-end">
                  <div className="w-full max-w-xs space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#0B1F3A]/70 font-medium">Subtotal</span>
                      <span className="font-bold text-[#0B1F3A]">{formatINR(invoice.subtotal)}</span>
                    </div>
                    {invoice.tax > 0 ? (
                      <div className="flex justify-between text-xs text-[#2563EB] font-bold">
                        <span>Total GST Tax</span>
                        <span>{formatINR(invoice.tax)}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#0B1F3A]/70 font-medium">Total GST Tax</span>
                        <span className="font-bold text-[#0B1F3A]">{formatINR(0)}</span>
                      </div>
                    )}
                    <Separator className="bg-[#0B1F3A]/20" />
                    <div className="flex justify-between items-center py-2">
                      <span className="text-lg font-black uppercase tracking-wider text-[#FF6B00]">Grand Total</span>
                      <span className="text-2xl font-black text-[#0B1F3A]">{formatINR(invoice.total || invoice.totalAmount)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Note */}
                <div className="mt-20 rounded-2xl bg-[#0B1F3A] text-[#F8FAFC] p-6 text-center">
                  <div className="flex justify-center mb-3">
                    <CheckCircle2 className="h-6 w-6 text-[#FF6B00]" />
                  </div>
                  <p className="text-sm font-bold text-[#F8FAFC]">Thank you for your business!</p>
                  <p className="mt-1 text-xs text-[#F8FAFC]/70">If you have any questions about this invoice, please contact support.</p>
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
