import React, { useState, useEffect, useRef } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Eye,
  Smartphone,
  Monitor,
  Calendar,
  Sparkles,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { bannersApi, Banner } from '../../api/banners';
import { getFullImageUrl } from '../../utils/imageUrl';

const COLOR_PRESETS = [
  { label: 'eBay Light', bg: '#f7f7f7', text: '#111827' },
  { label: 'Deep Slate', bg: '#0f172a', text: '#f8fafc' },
  { label: 'Royal Navy', bg: '#1e3a8a', text: '#ffffff' },
  { label: 'Emerald Glow', bg: '#064e3b', text: '#ecfdf5' },
  { label: 'Warm Sunlight', bg: '#fffbeb', text: '#78350f' },
  { label: 'Crimson Bold', bg: '#881337', text: '#fff1f2' },
  { label: 'Modern Indigo', bg: '#312e81', text: '#e0e7ff' },
];

const INITIAL_FORM: Partial<Banner> & {
  imageFile?: File | null;
  mobileImageFile?: File | null;
} = {
  title: '',
  badgeText: 'UP TO 40% OFF',
  headline: 'Score Authentic Brands & Trending Tech',
  subheadline: 'Verified authenticity, guaranteed fast shipping, and complete buyer protection on all orders.',
  imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200&auto=format&fit=crop&q=80',
  mobileImageUrl: '',
  ctaText: '',
  ctaLink: '/shop',
  backgroundColor: '#f7f7f7',
  textColor: '#111827',
  placement: 'HOME_HERO',
  order: 0,
  isActive: true,
  startDate: '',
  endDate: '',
  imageFile: null,
  mobileImageFile: null,
};

export function BannerSettings() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [desktopPreviewUrl, setDesktopPreviewUrl] = useState<string>('');
  const [mobilePreviewUrl, setMobilePreviewUrl] = useState<string>('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const desktopFileInputRef = useRef<HTMLInputElement>(null);
  const mobileFileInputRef = useRef<HTMLInputElement>(null);

  // Load banners on mount
  const fetchBanners = async () => {
    setIsLoading(true);
    try {
      const res = await bannersApi.getAllAdmin();
      if (res.success && Array.isArray(res.data)) {
        setBanners(res.data);
      } else {
        toast.error(res.message || 'Failed to load promotional banners');
      }
    } catch (err: any) {
      console.error('fetchBanners error:', err);
      toast.error(err.message || 'Unable to connect to banner service');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  // Sync preview URLs with form data
  useEffect(() => {
    if (formData.imageFile) {
      const url = URL.createObjectURL(formData.imageFile);
      setDesktopPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setDesktopPreviewUrl(formData.imageUrl ? getFullImageUrl(formData.imageUrl) : '');
    }
  }, [formData.imageFile, formData.imageUrl]);

  useEffect(() => {
    if (formData.mobileImageFile) {
      const url = URL.createObjectURL(formData.mobileImageFile);
      setMobilePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setMobilePreviewUrl(formData.mobileImageUrl ? getFullImageUrl(formData.mobileImageUrl) : '');
    }
  }, [formData.mobileImageFile, formData.mobileImageUrl]);

  const openCreateModal = () => {
    setEditingBanner(null);
    setFormData({
      ...INITIAL_FORM,
      order: banners.length,
    });
    setModalOpen(true);
  };

  const openEditModal = (banner: Banner) => {
    setEditingBanner(banner);
    setFormData({
      title: banner.title || '',
      badgeText: banner.badgeText || '',
      headline: banner.headline || '',
      subheadline: banner.subheadline || '',
      imageUrl: banner.imageUrl || '',
      mobileImageUrl: banner.mobileImageUrl || '',
      ctaText: banner.ctaText || '',
      ctaLink: banner.ctaLink || '/shop',
      backgroundColor: banner.backgroundColor || '#f7f7f7',
      textColor: banner.textColor || '#111827',
      placement: banner.placement || 'HOME_HERO',
      order: banner.order || 0,
      isActive: banner.isActive !== false,
      startDate: banner.startDate ? banner.startDate.slice(0, 16) : '',
      endDate: banner.endDate ? banner.endDate.slice(0, 16) : '',
      imageFile: null,
      mobileImageFile: null,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingBanner(null);
    setFormData(INITIAL_FORM);
  };

  // Instant Active Toggle
  const handleToggleActive = async (banner: Banner) => {
    const nextStatus = !banner.isActive;
    // Optimistic UI update
    setBanners((prev) =>
      prev.map((b) => (b._id === banner._id ? { ...b, isActive: nextStatus } : b))
    );

    try {
      const res = await bannersApi.update(banner._id, { isActive: nextStatus });
      if (res.success) {
        toast.success(`Banner ${nextStatus ? 'activated' : 'paused'}`);
      } else {
        throw new Error(res.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update banner status');
      // Rollback
      setBanners((prev) =>
        prev.map((b) => (b._id === banner._id ? { ...b, isActive: banner.isActive } : b))
      );
    }
  };

  // Reorder Up/Down
  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= banners.length) return;

    const newBanners = [...banners];
    const [moved] = newBanners.splice(index, 1);
    newBanners.splice(targetIndex, 0, moved);

    // Re-index orders sequentially
    const updatedWithOrder = newBanners.map((b, idx) => ({
      ...b,
      order: idx,
    }));

    setBanners(updatedWithOrder);

    try {
      const items = updatedWithOrder.map((b) => ({ id: b._id, order: b.order }));
      const res = await bannersApi.reorder(items);
      if (res.success) {
        toast.success('Banner order updated');
      } else {
        throw new Error(res.message);
      }
    } catch (err: any) {
      toast.error('Failed to save reorder. Reverting.');
      fetchBanners();
    }
  };

  // Delete Banner
  const handleDelete = async (id: string) => {
    try {
      const res = await bannersApi.delete(id);
      if (res.success) {
        toast.success('Banner permanently deleted');
        setBanners((prev) => prev.filter((b) => b._id !== id));
        setDeleteConfirmId(null);
      } else {
        throw new Error(res.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete banner');
    }
  };

  // Form Submit (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.headline?.trim()) {
      toast.error('Please enter a headline.');
      return;
    }
    if (!formData.imageUrl?.trim() && !formData.imageFile) {
      toast.error('Please upload a desktop image or provide an image URL.');
      return;
    }
    if (!formData.ctaLink?.trim()) {
      toast.error('Destination CTA link is required.');
      return;
    }

    setIsSaving(true);

    try {
      const data = new FormData();
      if (formData.title) data.append('title', formData.title);
      if (formData.badgeText) data.append('badgeText', formData.badgeText);
      data.append('headline', formData.headline);
      if (formData.subheadline) data.append('subheadline', formData.subheadline);
      data.append('ctaText', formData.ctaText || 'Shop Now');
      data.append('ctaLink', formData.ctaLink || '/shop');
      data.append('backgroundColor', formData.backgroundColor || '#f7f7f7');
      data.append('textColor', formData.textColor || '#111827');
      data.append('placement', formData.placement || 'HOME_HERO');
      data.append('order', String(formData.order ?? 0));
      data.append('isActive', String(formData.isActive));
      if (formData.startDate) data.append('startDate', formData.startDate);
      if (formData.endDate) data.append('endDate', formData.endDate);

      if (formData.imageFile) {
        data.append('image', formData.imageFile);
      } else if (formData.imageUrl) {
        data.append('imageUrl', formData.imageUrl);
      }

      if (formData.mobileImageFile) {
        data.append('mobileImage', formData.mobileImageFile);
      } else if (formData.mobileImageUrl) {
        data.append('mobileImageUrl', formData.mobileImageUrl);
      }

      let res;
      if (editingBanner) {
        res = await bannersApi.update(editingBanner._id, data);
      } else {
        res = await bannersApi.create(data);
      }

      if (res.success && res.data) {
        toast.success(editingBanner ? 'Banner updated successfully!' : 'Banner created successfully!');
        const savedBanner = res.data;
        // Immediate optimistic UI update: render new/updated banner instantly
        setBanners((prev) => {
          if (editingBanner) {
            return prev.map((b) => (b._id === editingBanner._id ? savedBanner : b));
          } else {
            return [...prev, savedBanner];
          }
        });
        closeModal();
        // Background revalidation
        fetchBanners();
      } else {
        throw new Error(res.message || 'Operation failed');
      }
    } catch (err: any) {
      console.error('Banner save error:', err);
      toast.error(err.message || 'Failed to save banner');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              Promotional Banners
            </h2>
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              eBay Style
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage high-conversion hero promotions, visual carousels, and storefront marketing strips.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchBanners}
            disabled={isLoading}
            className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
            title="Refresh banners"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Add New Banner
          </button>
        </div>
      </div>

      {/* Banner Listing Table & Cards */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium text-gray-500">Loading promotional banners…</p>
          </div>
        ) : banners.length === 0 ? (
          <div className="p-12 text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-4">
              <ImageIcon className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">No banners created yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">
              Create your first eBay-style hero banner to showcase seasonal sales, brands, or special discounts on the storefront.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/20"
            >
              <Plus className="w-4 h-4" />
              Create Hero Banner
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
              <thead className="bg-gray-50/75 dark:bg-gray-800/50 text-xs uppercase font-bold text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800 tracking-wider">
                <tr>
                  <th className="py-4 px-4 w-12 text-center">Order</th>
                  <th className="py-4 px-4">Artwork</th>
                  <th className="py-4 px-4">Banner Details</th>
                  <th className="py-4 px-4">Placement</th>
                  <th className="py-4 px-4">Schedule</th>
                  <th className="py-4 px-4 text-center">Status</th>
                  <th className="py-4 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {banners.map((banner, index) => {
                  const displayImg = getFullImageUrl(banner.imageUrl);
                  const isScheduled = banner.startDate || banner.endDate;
                  return (
                    <tr
                      key={banner._id}
                      className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      {/* Order Controls */}
                      <td className="py-4 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveOrder(index, 'up')}
                            disabled={index === 0}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs font-black text-gray-500">{index + 1}</span>
                          <button
                            type="button"
                            onClick={() => handleMoveOrder(index, 'down')}
                            disabled={index === banners.length - 1}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Artwork Thumbnail */}
                      <td className="py-4 px-4">
                        <div
                          className="w-24 h-14 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm relative flex items-center justify-center"
                          style={{ backgroundColor: banner.backgroundColor || '#f7f7f7' }}
                        >
                          {displayImg ? (
                            <img
                              src={displayImg}
                              alt={banner.headline}
                              className="w-full h-full object-contain p-1"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-gray-400" />
                          )}
                        </div>
                      </td>

                      {/* Details */}
                      <td className="py-4 px-4 max-w-xs md:max-w-md">
                        <div className="space-y-1">
                          {banner.badgeText && (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                              {banner.badgeText}
                            </span>
                          )}
                          <div className="font-bold text-gray-900 dark:text-white truncate">
                            {banner.headline}
                          </div>
                          {banner.subheadline && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                              {banner.subheadline}
                            </div>
                          )}
                          <div className="text-[11px] font-mono text-gray-400">
                            <span>Destination Link: {banner.ctaLink}</span>
                          </div>
                        </div>
                      </td>

                      {/* Placement */}
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                          {banner.placement}
                        </span>
                      </td>

                      {/* Scheduling */}
                      <td className="py-4 px-4">
                        {isScheduled ? (
                          <div className="text-xs space-y-0.5">
                            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                              <Calendar className="w-3 h-3" />
                              <span>Scheduled</span>
                            </div>
                            {banner.startDate && (
                              <div className="text-[11px] text-gray-500">
                                From: {new Date(banner.startDate).toLocaleDateString()}
                              </div>
                            )}
                            {banner.endDate && (
                              <div className="text-[11px] text-gray-500">
                                To: {new Date(banner.endDate).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Always active</span>
                        )}
                      </td>

                      {/* Status Toggle */}
                      <td className="py-4 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(banner)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            banner.isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              banner.isActive ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <div className="text-[10px] font-bold text-gray-400 mt-1 uppercase">
                          {banner.isActive ? 'Live' : 'Paused'}
                        </div>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(banner)}
                            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
                            title="Edit banner"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(banner._id)}
                            className="p-2 rounded-lg border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors"
                            title="Delete banner"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-sm w-full border border-gray-100 dark:border-gray-800 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-gray-900 dark:text-white">Delete Banner?</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Are you sure you want to permanently delete this banner? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20"
              >
                Delete Banner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal with Live Preview */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/70 backdrop-blur-md animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-5xl w-full border border-gray-100 dark:border-gray-800 shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">
                    {editingBanner ? 'Edit Promotional Banner' : 'Create eBay-Style Hero Banner'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Fine-tune high-converting banner copy, colors, and artwork with real-time preview.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-2 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="overflow-y-auto p-6 space-y-8 flex-1">
              {/* ── Interactive Live Preview Box ──────────────────────── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-blue-500" />
                    Interactive Live Storefront Preview
                  </label>
                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('desktop')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        previewMode === 'desktop'
                          ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                          : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      Desktop
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('mobile')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        previewMode === 'mobile'
                          ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                          : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      Mobile
                    </button>
                  </div>
                </div>

                {/* Live Preview Container */}
                <div
                  className={`mx-auto transition-all duration-300 rounded-3xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xl ${
                    previewMode === 'desktop' ? 'w-full' : 'max-w-sm'
                  }`}
                  style={{
                    backgroundColor: formData.backgroundColor || '#f7f7f7',
                    color: formData.textColor || '#111827',
                  }}
                >
                  <div
                    className={`relative p-6 sm:p-10 flex flex-col justify-between overflow-hidden ${
                      previewMode === 'desktop'
                        ? 'min-h-[260px] md:min-h-[300px] md:flex-row md:items-center'
                        : 'min-h-[320px] text-center items-center'
                    }`}
                  >
                    {/* Left Copy Section */}
                    <div
                      className={`space-y-3 z-10 max-w-lg ${
                        previewMode === 'mobile' ? 'text-center' : 'text-left'
                      }`}
                    >
                      {formData.badgeText && (
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-600 text-white shadow-sm">
                          {formData.badgeText}
                        </span>
                      )}

                      <h2
                        className={`font-black tracking-tight leading-tight ${
                          previewMode === 'desktop' ? 'text-2xl sm:text-4xl' : 'text-xl'
                        }`}
                      >
                        {formData.headline || 'Your Headline Here'}
                      </h2>

                      {formData.subheadline && (
                        <p className="text-xs sm:text-sm opacity-90 line-clamp-2">
                          {formData.subheadline}
                        </p>
                      )}

                      {formData.ctaText ? (
                        <div className="pt-2">
                          <span
                            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold shadow-lg transition-transform"
                            style={{
                              backgroundColor: formData.textColor || '#111827',
                              color: formData.backgroundColor || '#ffffff',
                            }}
                          >
                            {formData.ctaText}
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {/* Right Artwork / Product Cutout */}
                    <div
                      className={`relative flex items-center justify-center p-2 z-10 ${
                        previewMode === 'desktop'
                          ? 'w-full md:w-1/2 max-h-[220px]'
                          : 'w-full max-h-[160px] mt-4'
                      }`}
                    >
                      {previewMode === 'mobile' && mobilePreviewUrl ? (
                        <img
                          src={mobilePreviewUrl}
                          alt="Mobile preview"
                          className="max-h-[160px] w-auto object-contain drop-shadow-2xl"
                        />
                      ) : desktopPreviewUrl ? (
                        <img
                          src={desktopPreviewUrl}
                          alt="Desktop preview"
                          className="max-h-[220px] w-auto object-contain drop-shadow-2xl"
                        />
                      ) : (
                        <div className="w-32 h-32 rounded-2xl border-2 border-dashed border-gray-400/40 flex flex-col items-center justify-center text-gray-400">
                          <ImageIcon className="w-8 h-8 mb-1" />
                          <span className="text-[10px] font-bold">Artwork Cutout</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Form Inputs ─────────────────────────────────────── */}
              <form id="banner-form" onSubmit={handleSubmit} className="space-y-6">
                {/* Row 1: Internal Title & Placement */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Internal Title / Campaign Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Summer Mega Tech Clearance 2026"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Placement
                    </label>
                    <select
                      value={formData.placement}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          placement: e.target.value as Banner['placement'],
                        })
                      }
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="HOME_HERO">HOME_HERO (Storefront Top)</option>
                      <option value="CATEGORY_TOP">CATEGORY_TOP (Shop Header)</option>
                      <option value="PROMO_STRIP">PROMO_STRIP (Narrow Marquee)</option>
                    </select>
                  </div>
                </div>

                {/* Row 2: Badge Text & Headline */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Badge Text (Pill Tag)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. UP TO 40% OFF"
                      value={formData.badgeText}
                      onChange={(e) => setFormData({ ...formData, badgeText: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center justify-between">
                      <span>Headline *</span>
                      <span className="text-[11px] text-gray-400 font-normal">Bold primary message</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Score Authentic Sneakers & Trending Tech"
                      value={formData.headline}
                      onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Row 3: Subheadline */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Subheadline / Supporting Copy
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Detailed supporting copy, guarantees, warranty, or brand highlight..."
                    value={formData.subheadline}
                    onChange={(e) => setFormData({ ...formData, subheadline: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                {/* Row 4: Destination Link */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Banner Destination URL * (Clicking the banner will open this link)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. /shop, /category/sneakers, https://..."
                    value={formData.ctaLink}
                    onChange={(e) => setFormData({ ...formData, ctaLink: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                {/* Row 5: Color Customization & Presets */}
                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                      Color Schemes & Presets
                    </label>
                    <span className="text-[11px] text-gray-400">Click a preset or select custom hex</span>
                  </div>

                  {/* Presets */}
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            backgroundColor: preset.bg,
                            textColor: preset.text,
                          })
                        }
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-bold hover:scale-105 transition-all shadow-sm"
                        style={{ backgroundColor: preset.bg, color: preset.text }}
                      >
                        <span
                          className="w-3 h-3 rounded-full border border-black/10"
                          style={{ backgroundColor: preset.text }}
                        />
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={formData.backgroundColor || '#f7f7f7'}
                        onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                        className="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent"
                      />
                      <div className="flex-1">
                        <label className="text-[11px] font-bold text-gray-500 uppercase">
                          Background Color
                        </label>
                        <input
                          type="text"
                          value={formData.backgroundColor}
                          onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                          className="w-full px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={formData.textColor || '#111827'}
                        onChange={(e) => setFormData({ ...formData, textColor: e.target.value })}
                        className="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent"
                      />
                      <div className="flex-1">
                        <label className="text-[11px] font-bold text-gray-500 uppercase">
                          Text / Button Color
                        </label>
                        <input
                          type="text"
                          value={formData.textColor}
                          onChange={(e) => setFormData({ ...formData, textColor: e.target.value })}
                          className="w-full px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 6: Image Uploads (Desktop & Mobile) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Desktop Artwork */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center justify-between">
                      <span>Desktop Artwork * (File or URL)</span>
                      <span className="text-[11px] text-gray-400">Max 5MB</span>
                    </label>

                    <div className="flex gap-2">
                      <input
                        type="file"
                        ref={desktopFileInputRef}
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setFormData({ ...formData, imageFile: file });
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => desktopFileInputRef.current?.click()}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300 transition-colors"
                      >
                        <Upload className="w-4 h-4 text-blue-500" />
                        {formData.imageFile ? formData.imageFile.name : 'Upload Desktop Artwork'}
                      </button>
                    </div>

                    <div className="space-y-1">
                      <input
                        type="text"
                        placeholder="Or paste direct image URL (https://...)"
                        value={formData.imageUrl}
                        onChange={(e) =>
                          setFormData({ ...formData, imageUrl: e.target.value, imageFile: null })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Mobile Cutout Artwork */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center justify-between">
                      <span>Mobile Cutout (Optional)</span>
                      <span className="text-[11px] text-gray-400">Defaults to Desktop</span>
                    </label>

                    <div className="flex gap-2">
                      <input
                        type="file"
                        ref={mobileFileInputRef}
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setFormData({ ...formData, mobileImageFile: file });
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => mobileFileInputRef.current?.click()}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300 transition-colors"
                      >
                        <Smartphone className="w-4 h-4 text-emerald-500" />
                        {formData.mobileImageFile
                          ? formData.mobileImageFile.name
                          : 'Upload Mobile Cutout'}
                      </button>
                    </div>

                    <div className="space-y-1">
                      <input
                        type="text"
                        placeholder="Or paste direct mobile image URL (https://...)"
                        value={formData.mobileImageUrl}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            mobileImageUrl: e.target.value,
                            mobileImageFile: null,
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Row 7: Scheduling (Start Date & End Date) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Schedule Start (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.startDate || ''}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Schedule End (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.endDate || ''}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="modal-active"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <label
                  htmlFor="modal-active"
                  className="text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer"
                >
                  Publish Immediately (Active)
                </label>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="banner-form"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                >
                  {isSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {isSaving ? 'Saving Banner…' : editingBanner ? 'Update Banner' : 'Publish Banner'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BannerSettings;
