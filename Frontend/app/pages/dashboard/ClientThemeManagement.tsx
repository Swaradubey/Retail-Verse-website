import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Palette,
  Check,
  Eye,
  RotateCcw,
  AlertTriangle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { themesApi, type ThemeData, type MyThemeData } from '../../api/themes';
import { useTheme } from '../../context/ThemeContext';

export function ClientThemeManagement() {
  const { setThemeKey } = useTheme();
  const [themes, setThemes] = useState<ThemeData[]>([]);
  const [myTheme, setMyTheme] = useState<MyThemeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [previewTheme, setPreviewTheme] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [availRes, myRes] = await Promise.all([
        themesApi.getAvailable(),
        themesApi.getMyTheme(),
      ]);
      if (availRes.success) setThemes(availRes.data || []);
      if (myRes.success) setMyTheme(myRes.data || null);
    } catch (e: any) {
      toast.error('Failed to load themes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const currentThemeKey = myTheme?.selectedThemeKey || myTheme?.resolvedThemeKey || 'luxe-commerce';

  const handleSelect = async (key: string) => {
    setShowConfirm(key);
  };

  const confirmSelect = async () => {
    if (!showConfirm) return;
    setSaving('select');
    const previousKey = myTheme?.selectedThemeKey || myTheme?.resolvedThemeKey || 'luxe-commerce';
    try {
      const res = await themesApi.updateMyTheme(showConfirm);
      if (res.success) {
        setThemeKey(showConfirm);
        toast.success('Theme updated successfully! Your storefront and dashboard will reflect the new theme.');
        setShowConfirm(null);
        setPreviewTheme(null);
        loadData();
      } else throw new Error(res.message);
    } catch (e: any) {
      setThemeKey(previousKey);
      toast.error(e.message || 'Failed to update theme');
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async () => {
    setSaving('reset');
    try {
      const res = await themesApi.resetMyTheme();
      if (res.success) {
        setThemeKey('luxe-commerce');
        toast.success('Theme reset to platform default');
        loadData();
      } else throw new Error(res.message);
    } catch (e: any) {
      toast.error(e.message || 'Failed to reset theme');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Active Theme Banner */}
      {myTheme && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-900/50 rounded-2xl p-4 lg:p-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Current Active Theme: <span className="text-blue-600">{themes.find((t) => t.key === currentThemeKey)?.name || 'Luxe Commerce'}</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">This theme is live on your storefront</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-gray-200 dark:border-white/10 h-9"
              onClick={handleReset}
              disabled={saving === 'reset' || !myTheme?.selectedThemeKey}
            >
              {saving === 'reset' ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RotateCcw className="w-4 h-4 mr-1.5" />}
              Reset to Default
            </Button>
          </div>
        </div>
      )}

      {/* Theme Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {themes.map((theme) => {
          const isActive = currentThemeKey === theme.key;

          return (
            <Card key={theme.key} className={`border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden transition-all duration-300 ${isActive ? 'ring-2 ring-blue-500' : ''}`}>
              <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-6">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center" style={{
                      background: `linear-gradient(135deg, ${theme.colorPalette?.primary || '#1a1a2e'}, ${theme.colorPalette?.secondary || '#c9a96e'})`
                    }}>
                      <Palette className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold flex items-center gap-2">
                        {theme.name}
                        {isActive && (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" /> Active
                          </span>
                        )}
                        {theme.isDefault && !isActive && (
                          <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Default</span>
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">{theme.layoutStyle}</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-5">
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{theme.description}</p>

                {/* Theme color strip */}
                <div className="h-2 rounded-full bg-gradient-to-r" style={{
                  background: `linear-gradient(90deg, ${theme.colorPalette?.primary || '#1a1a2e'}, ${theme.colorPalette?.secondary || '#c9a96e'}, ${theme.colorPalette?.accent || '#c9a96e'})`
                }} />

                {/* Features */}
                {theme.features && theme.features.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {theme.features.map((f: string) => (
                      <span key={f} className="text-[10px] bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">{f}</span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-gray-200 dark:border-white/10 h-9"
                    onClick={() => setPreviewTheme(previewTheme === theme.key ? null : theme.key)}
                  >
                    <Eye className="w-4 h-4 mr-1.5" />
                    {previewTheme === theme.key ? 'Close Preview' : 'Preview'}
                  </Button>
                  {!isActive ? (
                    <Button
                      size="sm"
                      className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 h-9"
                      onClick={() => handleSelect(theme.key)}
                      disabled={saving === 'select'}
                    >
                      {saving === 'select' && showConfirm === theme.key ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
                      Select Theme
                    </Button>
                  ) : (
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> Currently Active
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setShowConfirm(null)}
          >
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-5">
                <AlertTriangle className="w-7 h-7 text-amber-600" />
              </div>
              <h3 className="text-xl font-bold text-center mb-2">Change Storefront Theme?</h3>
              <p className="text-sm text-gray-500 text-center mb-6">
                This will immediately update your live storefront to{' '}
                <strong className="text-gray-800 dark:text-gray-200">
                  {themes.find((t) => t.key === showConfirm)?.name}
                </strong>
                . Your customers will see the new design right away.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl h-11"
                  onClick={() => setShowConfirm(null)}
                  disabled={saving === 'select'}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 rounded-xl bg-blue-600 text-white hover:bg-blue-700 h-11"
                  onClick={confirmSelect}
                  disabled={saving === 'select'}
                >
                  {saving === 'select' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Apply Theme
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview modal */}
      <AnimatePresence>
        {previewTheme && (() => {
          const theme = themes.find((t) => t.key === previewTheme);
          return (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-4"
            >
              <Card className="border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden">
                <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <Eye className="w-5 h-5 text-blue-600" />
                      <CardTitle className="text-lg font-bold">
                        Preview: {theme?.name}
                      </CardTitle>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-xl h-9"
                      onClick={() => setPreviewTheme(null)}
                    >
                      Close
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl border border-dashed border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{
                      background: `linear-gradient(135deg, ${theme?.colorPalette?.primary || '#1a1a2e'}, ${theme?.colorPalette?.secondary || '#c9a96e'})`
                    }}>
                      <Eye className="w-7 h-7 text-white" />
                    </div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{theme?.name}</p>
                    <p className="text-xs text-gray-400 mt-1">Theme preview — apply this theme to see it live on your storefront.</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
