import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import ApiService from '../api/apiService';
import { toast } from 'sonner';
import { MessageSquare, Send, DollarSign } from 'lucide-react';

interface QuoteRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  products: {
    productId: string;
    name: string;
    quantity: number;
    price: number;
    clientId?: string;
  }[];
  onSuccess?: () => void;
}

export function QuoteRequestDialog({ isOpen, onClose, products, onSuccess }: QuoteRequestDialogProps) {
  const [requestedPrice, setRequestedPrice] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!requestedPrice || isNaN(Number(requestedPrice))) {
      toast.error('Please enter a valid requested price');
      return;
    }

    setIsSubmitting(true);
    try {
      const topClientId = products.find(p => p.clientId)?.clientId;

      const response = await ApiService.post('/quotes', {
        products,
        clientId: topClientId,
        originalTotal: totalOriginalPrice,
        requestedPrice: Number(requestedPrice),
        message
      }, { pageName: 'Quote' });

      if (response.success) {
        toast.success('Quote request submitted successfully!');
        setRequestedPrice('');
        setMessage('');
        onSuccess?.();
        onClose();
      } else {
        toast.error(response.message || 'Failed to submit quote request');
      }
    } catch (err: any) {
      toast.error(err.message || 'An error occurred while submitting your request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalOriginalPrice = products.reduce((acc, p) => acc + (p.price * p.quantity), 0);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-[500px] rounded-3xl p-0 overflow-hidden border border-[#0B1F3A] bg-[#F8FAFC] text-[#0B1F3A] max-h-[95vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-4 sm:p-8 overflow-y-auto flex-1">
            <DialogHeader className="mb-6">
              <DialogTitle className="flex items-center gap-3 text-xl sm:text-2xl font-black text-[#0B1F3A]">
                <div className="p-2 sm:p-3 bg-[#2563EB]/10 text-[#2563EB] rounded-2xl">
                  <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                Request a Quote
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              <div className="p-4 bg-[#F8FAFC] rounded-2xl border border-[#0B1F3A]/20">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#0B1F3A]/70 mb-3">Items in Quote</p>
                <div className="space-y-2">
                  {products.map((p, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <span className="font-medium text-[#0B1F3A] truncate mr-2">{p.name}</span>
                      <span className="text-[#0B1F3A]/70 shrink-0">x{p.quantity}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-[#0B1F3A]/10 flex justify-between items-center">
                  <span className="text-xs font-bold text-[#0B1F3A]/70">Original Total</span>
                  <span className="font-bold text-[#0B1F3A]">₹{totalOriginalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="requestedPrice" className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">Your Expected Price (Total)</Label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <DollarSign className="h-4 w-4 text-[#2563EB]" />
                  </div>
                  <Input
                    id="requestedPrice"
                    type="number"
                    placeholder="What's your best offer?"
                    className="pl-9 h-12 rounded-xl border-[#0B1F3A]/20 bg-[#F8FAFC] text-[#0B1F3A] focus:ring-2 focus:ring-[#2563EB]"
                    value={requestedPrice}
                    onChange={(e) => setRequestedPrice(e.target.value)}
                    required
                  />
                </div>
                <p className="text-[10px] text-[#0B1F3A]/70">Enter the total amount you're willing to pay for all items.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message" className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">Message to Admin (Optional)</Label>
                <Textarea
                  id="message"
                  placeholder="Tell us why you deserve this price..."
                  className="min-h-[100px] rounded-xl border-[#0B1F3A]/20 bg-[#F8FAFC] text-[#0B1F3A] focus:ring-2 focus:ring-[#2563EB]"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="bg-[#F8FAFC] p-4 sm:p-6 border-t border-[#0B1F3A]/10 flex-shrink-0 flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="rounded-xl w-full sm:w-auto order-2 sm:order-1 border border-[#0B1F3A]/20 text-[#0B1F3A] hover:bg-[#2563EB] hover:text-[#F8FAFC]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#FF6B00] hover:bg-[#2563EB] text-[#F8FAFC] rounded-xl px-8 gap-2 shadow-lg shadow-[#FF6B00]/20 w-full sm:w-auto order-1 sm:order-2 transition-colors cursor-pointer"
            >
              {isSubmitting ? (
                <div className="h-4 w-4 border-2 border-[#F8FAFC]/30 border-t-[#F8FAFC] animate-spin rounded-full" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
