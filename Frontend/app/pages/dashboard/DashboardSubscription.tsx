import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Crown, Zap, CheckCircle, Clock, Shield, Sparkles, Star, Gift, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { userApi, type Plan, type SubscriptionData } from '../../api/user';
import { formatINR } from '../../utils/formatINR';
import { useAuth } from '../../context/AuthContext';

declare global {
  interface Window {
    Razorpay: any;
  }
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  Basic: <Star className="w-10 h-10 text-gray-400" />,
  Plus: <Crown className="w-10 h-10 text-yellow-500" />,
  Premium: <Zap className="w-10 h-10 text-purple-500" />,
};

const PLAN_COLORS: Record<string, { border: string; bg: string; badge: string; gradient: string }> = {
  Basic: {
    border: 'border-gray-200 dark:border-gray-700',
    bg: 'bg-gray-50 dark:bg-gray-900',
    badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    gradient: 'from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700',
  },
  Plus: {
    border: 'border-yellow-200 dark:border-yellow-800',
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    gradient: 'from-yellow-100 to-amber-200 dark:from-yellow-900 dark:to-amber-800',
  },
  Premium: {
    border: 'border-purple-200 dark:border-purple-800',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    gradient: 'from-purple-100 to-indigo-200 dark:from-purple-900 dark:to-indigo-800',
  },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function DashboardSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
  const [razorpayLoadError, setRazorpayLoadError] = useState(false);
  const scriptAddedRef = useRef(false);

  useEffect(() => {
    if (scriptAddedRef.current) return;
    scriptAddedRef.current = true;

    if (window.Razorpay) {
      setRazorpayLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => setRazorpayLoaded(true);
    script.onerror = () => {
      setRazorpayLoadError(true);
      toast.error('Failed to load payment gateway. Please refresh and try again.');
    };
    document.body.appendChild(script);
  }, []);

  const fetchSubscription = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await userApi.getSubscription();
      if (res.success) {
        setSubscription(res.data ?? null);
        if (Array.isArray(res.plans)) {
          setPlans(res.plans as Plan[]);
        }
      } else {
        setError(res.message || 'Failed to load subscription');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load subscription';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSubscription();
  }, [fetchSubscription]);

  const handleBuy = useCallback(async (planName: string) => {
    if (buying) return;

    if (!razorpayLoaded) {
      toast.error('Payment gateway is still loading. Please wait.');
      return;
    }

    if (razorpayLoadError) {
      toast.error('Payment gateway failed to load. Please refresh the page.');
      return;
    }

    setBuying(planName);
    try {
      const orderRes = await userApi.createSubscriptionOrder(planName);
      if (!orderRes.success || !orderRes.order_id) {
        throw new Error(orderRes.message || 'Unable to start payment. Please try again.');
      }

      const options = {
        key: orderRes.key_id,
        amount: orderRes.amount,
        currency: orderRes.currency || 'INR',
        name: 'E-commerce Store',
        description: `${planName} Plan Subscription`,
        order_id: orderRes.order_id,
        handler: async (response: any) => {
          try {
            const verifyRes = await userApi.verifySubscriptionPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            if (verifyRes.success) {
              toast.success(`${planName} plan activated successfully!`);
              if (verifyRes.data) {
                setSubscription(verifyRes.data as SubscriptionData);
              }
              setBuying(null);
              await fetchSubscription();
            } else {
              toast.error(verifyRes.message || 'Payment verification failed.');
              setBuying(null);
            }
          } catch (err: any) {
            toast.error(err?.message || 'Payment verification failed.');
            setBuying(null);
          }
        },
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.phone || '',
        },
        theme: {
          color: '#7c3aed',
        },
        modal: {
          ondismiss: () => {
            setBuying(null);
            toast.info('Payment was cancelled.');
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (response: any) => {
        toast.error(response?.error?.description || 'Payment failed. Please try again.');
        setBuying(null);
      });
      rzp.open();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to start payment. Please try again.';
      toast.error(msg);
      setBuying(null);
    }
  }, [buying, razorpayLoaded, razorpayLoadError, user, fetchSubscription]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 font-medium">{error}</p>
        <Button onClick={fetchSubscription} variant="outline" className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  const isPremium = subscription?.premium === true;
  const currentPlan = subscription?.currentPlan || 'Free';
  const expiryDate = subscription?.expiryDate;
  const startDate = subscription?.startDate;
  const checkoutReady = razorpayLoaded && !razorpayLoadError;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-8"
    >
      <Card className="border-2 border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50/80 to-white dark:from-amber-950/20 dark:to-zinc-900 shadow-lg shadow-amber-900/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md ${isPremium ? 'bg-gradient-to-br from-amber-400 to-yellow-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
                {isPremium ? <Crown className="w-6 h-6 text-white" /> : <Gift className="w-6 h-6 text-gray-500" />}
              </div>
              <div>
                <CardTitle className="text-xl font-bold">Current Plan</CardTitle>
                <CardDescription>Your subscription status</CardDescription>
              </div>
            </div>
            <div className={`px-4 py-1.5 rounded-full text-sm font-bold ${isPremium ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
              {isPremium ? 'Premium Active' : 'Free Tier'}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
            <div className="bg-white/60 dark:bg-zinc-800/40 rounded-xl p-4 border border-amber-100/50 dark:border-amber-900/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Plan</p>
              <p className="text-lg font-bold text-foreground">{currentPlan}</p>
            </div>
            <div className="bg-white/60 dark:bg-zinc-800/40 rounded-xl p-4 border border-amber-100/50 dark:border-amber-900/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Status</p>
              <p className="text-lg font-bold capitalize text-foreground">
                {subscription?.subscriptionStatus || 'inactive'}
              </p>
            </div>
            <div className="bg-white/60 dark:bg-zinc-800/40 rounded-xl p-4 border border-amber-100/50 dark:border-amber-900/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Expiry</p>
              <p className="text-lg font-bold text-foreground">
                {expiryDate ? formatDate(expiryDate) : 'N/A'}
              </p>
            </div>
          </div>
          {isPremium && startDate && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Subscribed since {formatDate(startDate)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h2 className="text-2xl font-bold tracking-tight">Available Plans</h2>
        </div>

        {!checkoutReady && !razorpayLoadError && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-xl border border-yellow-200/50 dark:border-yellow-800/30">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>Loading payment gateway...</span>
          </div>
        )}

        {razorpayLoadError && (
          <div className="text-sm text-red-500 mb-4 p-3 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200/50 dark:border-red-800/30">
            Payment gateway failed to load. Please refresh the page to try again.
          </div>
        )}

        {plans.length === 0 ? (
          <p className="text-muted-foreground text-center py-10">No plans available at the moment.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const colors = PLAN_COLORS[plan.name] || PLAN_COLORS.Basic;
              const isCurrent = currentPlan === plan.name && isPremium;
              const isBuying = buying === plan.name;

              return (
                <motion.div
                  key={plan.name}
                  whileHover={!isCurrent ? { y: -4 } : undefined}
                  transition={{ duration: 0.2 }}
                  className={`relative rounded-2xl border-2 overflow-hidden transition-all duration-300 ${isCurrent
                    ? 'border-amber-400 dark:border-amber-500 shadow-xl shadow-amber-900/10'
                    : `${colors.border} ${colors.bg} hover:shadow-lg hover:shadow-black/5`
                    }`}
                >
                  {isCurrent && (
                    <div className="absolute top-3 right-3 bg-amber-400 text-amber-900 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-md">
                      Active
                    </div>
                  )}

                  <div className={`bg-gradient-to-br ${colors.gradient} p-6 text-center`}>
                    <div className="flex justify-center mb-3">
                      {PLAN_ICONS[plan.name] || <Star className="w-10 h-10 text-gray-400" />}
                    </div>
                    <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                    <div className="mt-2">
                      <span className="text-3xl font-extrabold text-foreground">{formatINR(plan.price)}</span>
                      <span className="text-sm text-muted-foreground ml-1">/mo</span>
                    </div>
                  </div>

                  <CardContent className="p-5 space-y-4">
                    <ul className="space-y-2.5">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm">
                          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      onClick={() => handleBuy(plan.name)}
                      disabled={isBuying || isCurrent || !checkoutReady}
                      className={`w-full h-11 rounded-xl font-bold text-sm ${isCurrent
                        ? 'bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400 cursor-not-allowed'
                        : isBuying
                          ? 'opacity-70 cursor-wait bg-gradient-to-r from-amber-500 to-yellow-600 text-white'
                          : !checkoutReady
                            ? 'bg-gray-200 text-gray-400 dark:bg-gray-800 dark:text-gray-500 cursor-not-allowed'
                            : 'bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-white shadow-lg shadow-amber-900/20'
                        }`}
                    >
                      {isBuying ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </span>
                      ) : isCurrent ? (
                        'Current Plan'
                      ) : !checkoutReady ? (
                        'Initializing...'
                      ) : (
                        'Buy Now'
                      )}
                    </Button>
                  </CardContent>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <Card className="border border-blue-200/60 dark:border-blue-800/40 bg-gradient-to-br from-blue-50/60 to-white dark:from-blue-950/20 dark:to-zinc-900">
        <CardContent className="flex items-start gap-4 p-5">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Secure Payments via Razorpay</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              All payments are securely processed by Razorpay. Your payment information is encrypted and never stored on our servers.
            </p>
          </div>
        </CardContent>
      </Card>

      {subscription?.paymentId && (
        <div className="text-center text-xs text-muted-foreground">
          Last payment ID: {subscription.paymentId}
        </div>
      )}
    </motion.div>
  );
}
