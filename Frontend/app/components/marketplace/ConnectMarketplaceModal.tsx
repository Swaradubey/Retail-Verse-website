import React, { useState, useEffect } from 'react';
import { 
  Store, 
  Key, 
  Link2, 
  CheckCircle2, 
  Loader2, 
  ExternalLink, 
  ShieldCheck, 
  RefreshCw,
  Box,
  Tag,
  Layers,
  AlertCircle
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import { marketplaceLogoMap, MarketplaceItem } from './MarketplaceCard';
import * as marketplaceApi from '../../services/marketplaceApi';
import api from '../../api/apiService';

interface ConnectMarketplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: string | null;
  marketplaceItem?: MarketplaceItem | null;
  onSuccess: () => void;
}

export function ConnectMarketplaceModal({
  isOpen,
  onClose,
  channel,
  marketplaceItem,
  onSuccess
}: ConnectMarketplaceModalProps) {
  if (!channel) return null;

  const displayName = marketplaceItem?.displayName || marketplaceItem?.name || channel.toUpperCase();
  const logoSrc = marketplaceLogoMap[channel] || marketplaceItem?.logo || '/marketplace-logos/amazon.svg';

  // Mode: oauth vs direct credentials
  const [connectMode, setConnectMode] = useState<'oauth' | 'direct'>('oauth');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form Fields
  const [accountName, setAccountName] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');

  // Sync Preferences
  const [syncInventory, setSyncInventory] = useState(true);
  const [syncProducts, setSyncProducts] = useState(true);
  const [syncPricing, setSyncPricing] = useState(true);
  const [autoSync, setAutoSync] = useState(true);

  useEffect(() => {
    if (channel) {
      setAccountName(`${displayName} Store`);
      setSellerId('');
      setStoreUrl('');
      setApiKey('');
      setApiSecret('');
      setAccessToken('');
      setConnectMode('oauth');
      setSyncInventory(true);
      setSyncProducts(true);
      setSyncPricing(true);
      setAutoSync(true);
      setErrorMessage(null);
    }
  }, [channel, displayName]);

  const getSellerIdLabel = () => {
    switch (channel) {
      case 'shopify':
        return 'Store Domain / Shop URL';
      case 'amazon':
        return 'Amazon Merchant Token / Seller ID';
      case 'flipkart':
        return 'Flipkart Seller ID / Location ID';
      case 'meesho':
        return 'Meesho Supplier ID';
      case 'swiggy':
        return 'Swiggy Partner / Store ID';
      case 'myntra':
        return 'Myntra Partner ID';
      default:
        return 'Seller / Merchant ID';
    }
  };

  const getSellerIdPlaceholder = () => {
    switch (channel) {
      case 'shopify':
        return 'e.g. my-brand-store.myshopify.com';
      case 'amazon':
        return 'e.g. A21XXXXXXXXX';
      case 'flipkart':
        return 'e.g. FLP_SELLER_102';
      case 'meesho':
        return 'e.g. SUP_77821';
      case 'swiggy':
        return 'e.g. SWIGGY_STR_441';
      case 'myntra':
        return 'e.g. MYN_PTNR_88';
      default:
        return 'e.g. SELLER_ID_123';
    }
  };

  // Submit Handler
  const handleSubmit = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const preferences = {
        inventory: syncInventory,
        products: syncProducts,
        pricing: syncPricing,
        autoSync: autoSync
      };

      const syncSettings = {
        inventory: syncInventory,
        products: syncProducts,
        pricing: syncPricing
      };

      const storeLabel = accountName.trim() || `${displayName} Store`;
      const merchantToken = sellerId.trim();

      // ── MODE 1: OAuth Flow ──
      if (connectMode === 'oauth') {
        if (channel === 'shopify') {
          const shopInput = (sellerId || storeUrl).trim();
          if (!shopInput) {
            const err = 'Please enter your Shopify store domain (e.g., store-name.myshopify.com).';
            setErrorMessage(err);
            toast.error(err);
            setLoading(false);
            return;
          }
          const token = localStorage.getItem('eco_shop_token');
          const rawBase = (String(import.meta.env.VITE_API_BASE_URL ?? '').trim() || 'http://localhost:5000').replace(/\/+$/, '');
          const apiBase = rawBase.endsWith('/api') ? rawBase : `${rawBase}/api`;
          const tokenQuery = token ? `&token=${token}` : '';
          const connectUrl = `${apiBase}/marketplaces/shopify/connect?shop=${encodeURIComponent(shopInput)}${tokenQuery}`;
          window.location.href = connectUrl;
          return;
        }

        // Multi-marketplace Dynamic OAuth Flow (Amazon, Flipkart, Meesho, Swiggy, Myntra, etc.)
        const response: any = await api.post(
          `/api/marketplaces/${channel}/auth-url`,
          {
            channel,
            marketplace: channel,
            storeLabel,
            accountName: storeLabel,
            sellerId: merchantToken,
            supplierId: merchantToken,
            partnerId: merchantToken,
            merchantToken,
            storeUrl: storeUrl.trim(),
            preferences,
            syncSettings,
            syncPreferences: preferences
          },
          { pageName: 'Connect Marketplace Modal' }
        );

        const targetUrl = response?.redirectUrl || response?.data?.redirectUrl || response?.authUrl || response?.data?.authUrl;

        if (response?.success && targetUrl) {
          toast.info(`Redirecting to official ${displayName} portal...`);
          window.location.href = targetUrl;
          return;
        }

        if (!response?.success) {
          throw new Error(response?.message || `Failed to initiate ${displayName} authorization.`);
        }

        if (!targetUrl) {
          throw new Error(`Failed to retrieve authorization URL for ${displayName}. Please check your credentials.`);
        }
      }

      // ── MODE 2: Direct API Access / Self-Serve Credentials ──
      if (connectMode === 'direct') {
        if (channel === 'shopify') {
          const shopDomain = (sellerId || storeUrl).trim();
          const token = accessToken.trim();
          if (!shopDomain || !token) {
            const err = 'Please enter both Store Domain and Admin API Access Token.';
            setErrorMessage(err);
            toast.error(err);
            setLoading(false);
            return;
          }
          const res = await marketplaceApi.connectMarketplaceWithCredentials('shopify', {
            storeName: storeLabel,
            storeDomain: shopDomain,
            accessToken: token
          });
          if (res.success) {
            toast.success('Shopify connected successfully!');
            onSuccess();
            onClose();
          } else {
            throw new Error(res.message || 'Failed to connect Shopify.');
          }
          return;
        }

        // Direct connect for Flipkart, Amazon, Meesho, Swiggy, Myntra
        const res = await marketplaceApi.connectMarketplaceDirect(channel, {
          accountName: storeLabel,
          sellerId: merchantToken || `seller_${Date.now()}`,
          storeUrl: storeUrl.trim(),
          credentials: {
            clientId: apiKey.trim(),
            clientSecret: apiSecret.trim(),
            accessToken: accessToken.trim()
          },
          syncSettings: syncSettings,
          autoSync: autoSync
        });

        if (res && res.success) {
          toast.success(`${displayName} connected successfully with your settings!`);
          onSuccess();
          onClose();
        } else {
          throw new Error(res?.message || 'Failed to connect marketplace.');
        }
      }
    } catch (err: any) {
      console.error(`[ConnectMarketplaceModal] Authorization Error:`, err);
      const msg = err.response?.data?.message || err.data?.message || err.message || 'Failed to connect marketplace.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl rounded-2xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 p-2 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shadow-sm">
              <img 
                src={logoSrc} 
                alt={displayName} 
                className="w-8 h-8 object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                Connect {displayName}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Set up your seller account and choose your inventory &amp; product sync preferences.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Connection Mode Toggle */}
        <div className="flex rounded-xl bg-zinc-100 dark:bg-zinc-900 p-1 mt-2">
          <button
            type="button"
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              connectMode === 'oauth'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setConnectMode('oauth')}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            1-Click OAuth (Recommended)
          </button>
          <button
            type="button"
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              connectMode === 'direct'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setConnectMode('direct')}
          >
            <Key className="w-3.5 h-3.5 text-blue-500" />
            Direct API / Access Token
          </button>
        </div>

        <div className="space-y-4 py-2 mt-2">
          {/* Notice banner */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/80 dark:border-zinc-800 text-[12px] text-muted-foreground leading-relaxed">
            {connectMode === 'oauth' ? (
              <span>
                <strong className="text-foreground">Zero Technical Setup:</strong> Fill your store name and ID below, then click Authorize to sign in with your official {displayName} seller credentials.
              </span>
            ) : (
              <span>
                <strong className="text-foreground">Self-Serve API Keys:</strong> Paste your own private API Key or Access Token directly from your {displayName} seller portal.
              </span>
            )}
          </div>

          {/* Inline Error Message */}
          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2 shadow-sm animate-in fade-in-50">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
              <span className="leading-snug">{errorMessage}</span>
            </div>
          )}

          {/* Store / Account Label */}
          <div className="space-y-1.5">
            <Label htmlFor="account-label" className="text-xs font-semibold">Store / Account Label</Label>
            <Input
              id="account-label"
              placeholder={`e.g. My ${displayName} Store`}
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="rounded-xl h-9 text-xs"
            />
          </div>

          {/* Seller / Merchant Identifier */}
          <div className="space-y-1.5">
            <Label htmlFor="seller-id" className="text-xs font-semibold">{getSellerIdLabel()}</Label>
            <Input
              id="seller-id"
              placeholder={getSellerIdPlaceholder()}
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              className="rounded-xl h-9 text-xs"
            />
          </div>

          {/* Mode 2 Credentials Fields */}
          {connectMode === 'direct' && (
            <div className="space-y-3 pt-1 border-t border-zinc-100 dark:border-zinc-800">
              <div className="space-y-1.5">
                <Label htmlFor="access-token" className="text-xs font-semibold">
                  {channel === 'shopify' ? 'Admin API Access Token' : 'Access Token / API Secret'}
                </Label>
                <Input
                  id="access-token"
                  type="password"
                  placeholder="Paste your API Access Token or Secret Key"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="rounded-xl h-9 text-xs font-mono"
                />
              </div>

              {channel !== 'shopify' && (
                <div className="space-y-1.5">
                  <Label htmlFor="api-key" className="text-xs font-semibold">API Key / Client ID (Optional)</Label>
                  <Input
                    id="api-key"
                    placeholder="e.g. client_app_key_..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="rounded-xl h-9 text-xs font-mono"
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Client Sync Preferences ── */}
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5">
            <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
              Sync Preferences (What to synchronize)
            </Label>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Inventory Sync */}
              <div className="flex items-center justify-between p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/60 dark:border-zinc-800/80">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Box className="w-3.5 h-3.5 text-blue-500" />
                    Inventory Stock
                  </div>
                  <p className="text-[10px] text-muted-foreground">Sync quantities &amp; stock levels</p>
                </div>
                <Switch checked={syncInventory} onCheckedChange={setSyncInventory} />
              </div>

              {/* Product Sync */}
              <div className="flex items-center justify-between p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/60 dark:border-zinc-800/80">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Layers className="w-3.5 h-3.5 text-emerald-500" />
                    Product Catalog
                  </div>
                  <p className="text-[10px] text-muted-foreground">Sync title, SKU, images &amp; description</p>
                </div>
                <Switch checked={syncProducts} onCheckedChange={setSyncProducts} />
              </div>

              {/* Pricing Sync */}
              <div className="flex items-center justify-between p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/60 dark:border-zinc-800/80">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Tag className="w-3.5 h-3.5 text-purple-500" />
                    Price Sync
                  </div>
                  <p className="text-[10px] text-muted-foreground">Keep selling prices updated</p>
                </div>
                <Switch checked={syncPricing} onCheckedChange={setSyncPricing} />
              </div>

              {/* Auto Sync On Update */}
              <div className="flex items-center justify-between p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/60 dark:border-zinc-800/80">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                    Auto-Sync
                  </div>
                  <p className="text-[10px] text-muted-foreground">Sync automatically on changes</p>
                </div>
                <Switch checked={autoSync} onCheckedChange={setAutoSync} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-3">
          <Button variant="outline" className="rounded-xl text-xs h-9" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            id="btn-authorize-marketplace"
            className="rounded-xl text-xs h-9 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 font-semibold gap-1.5"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : connectMode === 'oauth' ? (
              <ExternalLink className="w-3.5 h-3.5" />
            ) : (
              <Link2 className="w-3.5 h-3.5" />
            )}
            {loading
              ? 'Authorizing...'
              : connectMode === 'oauth'
              ? `Authorize on ${displayName}`
              : 'Save & Connect Store'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
