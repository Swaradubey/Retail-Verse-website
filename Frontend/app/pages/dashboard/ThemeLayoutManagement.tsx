import React, { useState, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Save,
  RotateCcw,
  Type,
  Layout,
  Footprints,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Link,
  Loader2,
  Check,
  ChevronDown,
  Palette,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";
import {
  themeLayoutApi,
  type ThemeLayoutData,
  type TypographyConfig,
  type HeaderConfig,
  type FooterConfig,
  type CustomLink,
  type FooterColumn,
  type FontFamily,
  type BaseFontSize,
  type HeaderVariant,
  type FooterVariant,
  DEFAULT_THEME_LAYOUT,
} from "../../api/themeLayout";

// ── Constants ─────────────────────────────────────────────────────────────────

const FONT_FAMILIES: { value: FontFamily; label: string; preview: string }[] = [
  { value: "Inter", label: "Inter", preview: "Modern & clean" },
  { value: "Roboto", label: "Roboto", preview: "Google's signature font" },
  { value: "Poppins", label: "Poppins", preview: "Geometric & friendly" },
  { value: "Plus Jakarta Sans", label: "Plus Jakarta Sans", preview: "Contemporary & versatile" },
  { value: "Open Sans", label: "Open Sans", preview: "Legible & neutral" },
];

const HEADER_VARIANTS: { value: HeaderVariant; label: string; desc: string }[] = [
  { value: "standard", label: "Standard", desc: "Full-width with logo, nav & cart" },
  { value: "minimal", label: "Minimal", desc: "Clean, logo-only minimal header" },
  { value: "centered", label: "Centered", desc: "Centered logo with symmetric nav" },
  { value: "floating", label: "Floating", desc: "Transparent glass-effect header" },
];

const FOOTER_VARIANTS: { value: FooterVariant; label: string; desc: string }[] = [
  { value: "classic", label: "Classic", desc: "Single row with links & copyright" },
  { value: "minimal", label: "Minimal", desc: "Slim copyright-only footer" },
  { value: "multi-column", label: "Multi-column", desc: "Rich footer with link columns" },
];

const SECTION_TABS = [
  { id: "typography", label: "Typography", icon: Type },
  { id: "header", label: "Header", icon: Layout },
  { id: "footer", label: "Footer", icon: Footprints },
] as const;

type SectionTab = (typeof SECTION_TABS)[number]["id"];

// ── Sub-components ────────────────────────────────────────────────────────────

interface ColorInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

const ColorInput = memo(({ label, value, onChange, disabled }: ColorInputProps) => (
  <div className="space-y-2">
    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
      {label}
    </label>
    <div className="flex items-center gap-3">
      <div className="relative">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-10 h-10 rounded-xl border border-gray-200 dark:border-white/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed p-0.5 bg-transparent"
        />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (/^#([0-9a-fA-F]{0,6})$/.test(v)) onChange(v);
        }}
        disabled={disabled}
        maxLength={7}
        placeholder="#000000"
        className="flex-1 bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
      />
    </div>
  </div>
));
ColorInput.displayName = "ColorInput";

// ── Typography Section ────────────────────────────────────────────────────────

interface TypographySectionProps {
  config: TypographyConfig;
  onChange: (c: TypographyConfig) => void;
  disabled: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}

const TypographySection = memo(
  ({ config, onChange, disabled, saving, onSave, onReset }: TypographySectionProps) => {
    return (
      <Card className="border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-2xl font-black">Typography</CardTitle>
              <CardDescription className="text-sm mt-1">
                Global font family and size settings for your storefront.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-gray-200 dark:border-white/10 h-10"
                onClick={onReset}
                disabled={disabled || saving}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 h-10 px-6 shadow-lg shadow-blue-500/25"
                onClick={onSave}
                disabled={disabled || saving}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-8 space-y-8">
          {/* Font Family */}
          <div className="space-y-3">
            <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
              Font Family
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {FONT_FAMILIES.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => onChange({ ...config, fontFamily: f.value, headingFont: f.value })}
                  disabled={disabled}
                  className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                    config.fontFamily === f.value
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                      : "border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 hover:border-blue-300"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold">{f.label}</span>
                    {config.fontFamily === f.value && (
                      <Check className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                  <p
                    className="text-xs text-muted-foreground"
                    style={{ fontFamily: f.value }}
                  >
                    {f.preview}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Live Preview */}
          <div
            className="p-6 rounded-2xl bg-gray-50/80 dark:bg-white/5 border border-gray-100 dark:border-white/10"
            style={{ fontFamily: config.fontFamily }}
          >
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Live Preview
            </p>
            <h2 className="text-2xl font-bold mb-1" style={{ fontSize: "1.5rem" }}>
              Your Store Name
            </h2>
            <p className="text-sm text-muted-foreground">
              Discover the best deals on premium products. Quality and style delivered to your door.
            </p>
          </div>

          {/* Base Font Size */}
          <div className="space-y-3">
            <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
              Base Font Size
            </label>
            <div className="flex gap-3">
              {(["14px", "16px"] as BaseFontSize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => onChange({ ...config, baseFontSize: size })}
                  disabled={disabled}
                  className={`flex-1 py-3 rounded-2xl border-2 text-sm font-bold transition-all duration-200 ${
                    config.baseFontSize === size
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700"
                      : "border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 hover:border-blue-300"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {size}
                  {size === "16px" && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">(default)</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
);
TypographySection.displayName = "TypographySection";

// ── Header Section ────────────────────────────────────────────────────────────

interface HeaderSectionProps {
  config: HeaderConfig;
  onChange: (c: HeaderConfig) => void;
  disabled: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}

const HeaderSection = memo(
  ({ config, onChange, disabled, saving, onSave, onReset }: HeaderSectionProps) => {
    const addLink = () => {
      if (config.customLinks.length >= 20) {
        toast.error("Maximum 20 custom links allowed");
        return;
      }
      onChange({
        ...config,
        customLinks: [...config.customLinks, { label: "Link", url: "/", visible: true }],
      });
    };

    const updateLink = (idx: number, field: keyof CustomLink, value: string | boolean) => {
      const updated = config.customLinks.map((l, i) =>
        i === idx ? { ...l, [field]: value } : l
      );
      onChange({ ...config, customLinks: updated });
    };

    const removeLink = (idx: number) => {
      onChange({
        ...config,
        customLinks: config.customLinks.filter((_, i) => i !== idx),
      });
    };

    return (
      <Card className="border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-2xl font-black">Header Configuration</CardTitle>
              <CardDescription className="text-sm mt-1">
                Customize the navigation header layout, colors and links.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-gray-200 dark:border-white/10 h-10"
                onClick={onReset}
                disabled={disabled || saving}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 h-10 px-6 shadow-lg shadow-blue-500/25"
                onClick={onSave}
                disabled={disabled || saving}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-8 space-y-8">
          {/* Variant */}
          <div className="space-y-3">
            <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
              Header Style
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {HEADER_VARIANTS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => onChange({ ...config, variant: v.value })}
                  disabled={disabled}
                  className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                    config.variant === v.value
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                      : "border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 hover:border-blue-300"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold">{v.label}</span>
                    {config.variant === v.value && (
                      <Check className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{v.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ColorInput
              label="Background Color"
              value={config.backgroundColor}
              onChange={(v) => onChange({ ...config, backgroundColor: v })}
              disabled={disabled}
            />
            <ColorInput
              label="Text / Icon Color"
              value={config.textColor}
              onChange={(v) => onChange({ ...config, textColor: v })}
              disabled={disabled}
            />
          </div>

          {/* Live color preview */}
          <div
            className="rounded-2xl px-6 py-4 flex items-center justify-between shadow-md transition-all"
            style={{
              backgroundColor: config.backgroundColor,
              color: config.textColor,
            }}
          >
            <span className="font-bold text-base">🛍 Your Store</span>
            <div className="flex items-center gap-4 text-sm font-semibold">
              {config.showCategories && <span>Categories</span>}
              {config.showSearchBar && <span>🔍 Search</span>}
              <span>Cart</span>
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "Sticky Header", key: "sticky" as const, desc: "Stays fixed when scrolling" },
              { label: "Show Search Bar", key: "showSearchBar" as const, desc: "Inline search input" },
              { label: "Show Categories", key: "showCategories" as const, desc: "Category nav links" },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/10"
              >
                <div>
                  <span className="text-sm font-semibold">{item.label}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <Switch
                  checked={config[item.key]}
                  onCheckedChange={(v) => onChange({ ...config, [item.key]: v })}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>

          {/* Custom Links */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold">Custom Navigation Links</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Add extra links to your header nav ({config.customLinks.length}/20)
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLink}
                disabled={disabled || config.customLinks.length >= 20}
                className="rounded-xl h-9 border-gray-200 dark:border-white/10"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Link
              </Button>
            </div>

            <AnimatePresence>
              {config.customLinks.map((link, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 rounded-2xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/10 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground">
                      Link #{idx + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={link.visible}
                        onCheckedChange={(v) => updateLink(idx, "visible", v)}
                        disabled={disabled}
                      />
                      <span className="text-xs text-muted-foreground">
                        {link.visible ? "Visible" : "Hidden"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLink(idx)}
                        disabled={disabled}
                        className="h-7 w-7 p-0 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Link label (e.g. Deals)"
                      value={link.label}
                      onChange={(e) => updateLink(idx, "label", e.target.value)}
                      disabled={disabled}
                      maxLength={80}
                      className="bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
                    />
                    <input
                      type="text"
                      placeholder="URL (e.g. /deals)"
                      value={link.url}
                      onChange={(e) => updateLink(idx, "url", e.target.value)}
                      disabled={disabled}
                      maxLength={300}
                      className="bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
                    />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {config.customLinks.length === 0 && (
              <div className="text-center py-8 rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/10">
                <Link className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No custom links yet. Add one above.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
);
HeaderSection.displayName = "HeaderSection";

// ── Footer Section ────────────────────────────────────────────────────────────

interface FooterSectionProps {
  config: FooterConfig;
  onChange: (c: FooterConfig) => void;
  disabled: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}

const FooterSection = memo(
  ({ config, onChange, disabled, saving, onSave, onReset }: FooterSectionProps) => {
    const addColumn = () => {
      if (config.columns.length >= 10) {
        toast.error("Maximum 10 columns allowed");
        return;
      }
      onChange({
        ...config,
        columns: [
          ...config.columns,
          { title: "Column " + (config.columns.length + 1), links: [] },
        ],
      });
    };

    const updateColumn = (idx: number, field: keyof FooterColumn, value: unknown) => {
      const updated = config.columns.map((c, i) =>
        i === idx ? { ...c, [field]: value } : c
      );
      onChange({ ...config, columns: updated });
    };

    const removeColumn = (idx: number) => {
      onChange({ ...config, columns: config.columns.filter((_, i) => i !== idx) });
    };

    const addColumnLink = (colIdx: number) => {
      const col = config.columns[colIdx];
      if (col.links.length >= 20) return;
      updateColumn(colIdx, "links", [...col.links, { label: "Link", url: "/" }]);
    };

    const updateColumnLink = (
      colIdx: number,
      linkIdx: number,
      field: "label" | "url",
      value: string
    ) => {
      const col = config.columns[colIdx];
      const updatedLinks = col.links.map((l, i) =>
        i === linkIdx ? { ...l, [field]: value } : l
      );
      updateColumn(colIdx, "links", updatedLinks);
    };

    const removeColumnLink = (colIdx: number, linkIdx: number) => {
      const col = config.columns[colIdx];
      updateColumn(colIdx, "links", col.links.filter((_, i) => i !== linkIdx));
    };

    return (
      <Card className="border-none shadow-xl bg-white/80 dark:bg-black/40 backdrop-blur-xl rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-gray-100 dark:border-white/5 pb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-2xl font-black">Footer Configuration</CardTitle>
              <CardDescription className="text-sm mt-1">
                Customize the site footer layout, colors, newsletter, and link columns.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-gray-200 dark:border-white/10 h-10"
                onClick={onReset}
                disabled={disabled || saving}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-blue-600 text-white hover:bg-blue-700 h-10 px-6 shadow-lg shadow-blue-500/25"
                onClick={onSave}
                disabled={disabled || saving}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-8 space-y-8">
          {/* Variant */}
          <div className="space-y-3">
            <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
              Footer Style
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {FOOTER_VARIANTS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => onChange({ ...config, variant: v.value })}
                  disabled={disabled}
                  className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                    config.variant === v.value
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                      : "border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 hover:border-blue-300"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold">{v.label}</span>
                    {config.variant === v.value && (
                      <Check className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{v.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ColorInput
              label="Background Color"
              value={config.backgroundColor}
              onChange={(v) => onChange({ ...config, backgroundColor: v })}
              disabled={disabled}
            />
            <ColorInput
              label="Text Color"
              value={config.textColor}
              onChange={(v) => onChange({ ...config, textColor: v })}
              disabled={disabled}
            />
          </div>

          {/* Live footer preview */}
          <div
            className="rounded-2xl px-6 py-5 shadow-md transition-all"
            style={{ backgroundColor: config.backgroundColor, color: config.textColor }}
          >
            <div className="text-center text-sm font-semibold opacity-70">
              {config.copyrightText}
            </div>
          </div>

          {/* Copyright */}
          <div className="space-y-2">
            <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider ml-1">
              Copyright Text
            </label>
            <input
              type="text"
              value={config.copyrightText}
              onChange={(e) => onChange({ ...config, copyrightText: e.target.value })}
              disabled={disabled}
              maxLength={300}
              className="w-full bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
            />
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: "Show Newsletter Signup", key: "showNewsletter" as const, desc: "Email subscription form" },
              { label: "Show Social Links", key: "showSocialLinks" as const, desc: "Facebook, Twitter, Instagram etc." },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/10"
              >
                <div>
                  <span className="text-sm font-semibold">{item.label}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <Switch
                  checked={config[item.key]}
                  onCheckedChange={(v) => onChange({ ...config, [item.key]: v })}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>

          {/* Columns — only shown for multi-column variant */}
          {config.variant === "multi-column" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold">Footer Link Columns</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Add columns with grouped links ({config.columns.length}/10)
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addColumn}
                  disabled={disabled || config.columns.length >= 10}
                  className="rounded-xl h-9 border-gray-200 dark:border-white/10"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Column
                </Button>
              </div>

              <AnimatePresence>
                {config.columns.map((col, colIdx) => (
                  <motion.div
                    key={colIdx}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-5 rounded-2xl bg-gray-50/50 dark:bg-white/5 border border-gray-100 dark:border-white/10 space-y-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <input
                        type="text"
                        value={col.title}
                        onChange={(e) => updateColumn(colIdx, "title", e.target.value)}
                        disabled={disabled}
                        maxLength={80}
                        placeholder="Column title (e.g. Company)"
                        className="flex-1 bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeColumn(colIdx)}
                        disabled={disabled}
                        className="h-9 w-9 p-0 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    {col.links.map((link, linkIdx) => (
                      <div key={linkIdx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={link.label}
                          onChange={(e) => updateColumnLink(colIdx, linkIdx, "label", e.target.value)}
                          disabled={disabled}
                          placeholder="Label"
                          maxLength={80}
                          className="flex-1 bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <input
                          type="text"
                          value={link.url}
                          onChange={(e) => updateColumnLink(colIdx, linkIdx, "url", e.target.value)}
                          disabled={disabled}
                          placeholder="/url"
                          maxLength={300}
                          className="flex-1 bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeColumnLink(colIdx, linkIdx)}
                          disabled={disabled}
                          className="h-8 w-8 p-0 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addColumnLink(colIdx)}
                      disabled={disabled || col.links.length >= 20}
                      className="rounded-xl h-8 text-xs border-gray-200 dark:border-white/10"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Add link
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>

              {config.columns.length === 0 && (
                <div className="text-center py-8 rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/10">
                  <Layout className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No columns yet. Add one above.</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);
FooterSection.displayName = "FooterSection";

// ── Main component ────────────────────────────────────────────────────────────

export function ThemeLayoutManagement() {
  const [activeSection, setActiveSection] = useState<SectionTab>("typography");
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [data, setData] = useState<ThemeLayoutData>(DEFAULT_THEME_LAYOUT);
  const [baseline, setBaseline] = useState<ThemeLayoutData>(DEFAULT_THEME_LAYOUT);

  // Local draft state per section to prevent cross-section interference
  const [typography, setTypography] = useState<TypographyConfig>(
    DEFAULT_THEME_LAYOUT.typography
  );
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig>(
    DEFAULT_THEME_LAYOUT.headerConfig
  );
  const [footerConfig, setFooterConfig] = useState<FooterConfig>(
    DEFAULT_THEME_LAYOUT.footerConfig
  );

  const applyData = useCallback((d: ThemeLayoutData) => {
    setTypography(d.typography);
    setHeaderConfig(d.headerConfig);
    setFooterConfig(d.footerConfig);
    setData(d);
    setBaseline(JSON.parse(JSON.stringify(d)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    themeLayoutApi
      .get()
      .then((res) => {
        if (!cancelled && res.success && res.data) {
          applyData(res.data);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("[ThemeLayout] load error", e);
          toast.error("Failed to load theme layout settings — using defaults");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [applyData]);

  // ── Save handlers ──────────────────────────────────────────────────────────

  const saveTypography = useCallback(async () => {
    setSavingSection("typography");
    try {
      const res = await themeLayoutApi.updateTypography(typography);
      if (res.success && res.data) {
        applyData(res.data);
        toast.success("Typography settings saved successfully");
      } else {
        throw new Error(res.message || "Save failed");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save typography");
    } finally {
      setSavingSection(null);
    }
  }, [typography, applyData]);

  const saveHeader = useCallback(async () => {
    setSavingSection("header");
    try {
      const res = await themeLayoutApi.updateHeader(headerConfig);
      if (res.success && res.data) {
        applyData(res.data);
        toast.success("Header settings saved successfully");
      } else {
        throw new Error(res.message || "Save failed");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save header settings");
    } finally {
      setSavingSection(null);
    }
  }, [headerConfig, applyData]);

  const saveFooter = useCallback(async () => {
    setSavingSection("footer");
    try {
      const res = await themeLayoutApi.updateFooter(footerConfig);
      if (res.success && res.data) {
        applyData(res.data);
        toast.success("Footer settings saved successfully");
      } else {
        throw new Error(res.message || "Save failed");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save footer settings");
    } finally {
      setSavingSection(null);
    }
  }, [footerConfig, applyData]);

  // ── Reset handlers ─────────────────────────────────────────────────────────

  const resetTypography = useCallback(() => {
    setTypography(JSON.parse(JSON.stringify(baseline.typography)));
    toast.success("Typography changes discarded");
  }, [baseline]);

  const resetHeader = useCallback(() => {
    setHeaderConfig(JSON.parse(JSON.stringify(baseline.headerConfig)));
    toast.success("Header changes discarded");
  }, [baseline]);

  const resetFooter = useCallback(() => {
    setFooterConfig(JSON.parse(JSON.stringify(baseline.footerConfig)));
    toast.success("Footer changes discarded");
  }, [baseline]);

  const resetAll = useCallback(async () => {
    if (!window.confirm("Reset all theme & layout settings to defaults?")) return;
    setSavingSection("reset");
    try {
      const res = await themeLayoutApi.reset();
      if (res.success && res.data) {
        applyData(res.data);
        toast.success("All settings reset to defaults");
      } else {
        throw new Error(res.message || "Reset failed");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to reset settings");
    } finally {
      setSavingSection(null);
    }
  }, [applyData]);

  const busy = savingSection !== null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
            <Palette className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black">Theme & Layout</h2>
            <p className="text-xs text-muted-foreground">
              Customize your storefront header, footer and typography
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={resetAll}
          disabled={busy}
          className="rounded-xl border-gray-200 dark:border-white/10 h-9 text-rose-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-900/20"
        >
          {savingSection === "reset" ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <RotateCcw className="w-4 h-4 mr-1.5" />
          )}
          Reset All to Defaults
        </Button>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-white/5 rounded-2xl w-fit">
        {SECTION_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSection(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
              activeSection === tab.id
                ? "bg-white dark:bg-black/60 text-blue-600 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Section content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSection}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
        >
          {activeSection === "typography" && (
            <TypographySection
              config={typography}
              onChange={setTypography}
              disabled={busy}
              saving={savingSection === "typography"}
              onSave={saveTypography}
              onReset={resetTypography}
            />
          )}
          {activeSection === "header" && (
            <HeaderSection
              config={headerConfig}
              onChange={setHeaderConfig}
              disabled={busy}
              saving={savingSection === "header"}
              onSave={saveHeader}
              onReset={resetHeader}
            />
          )}
          {activeSection === "footer" && (
            <FooterSection
              config={footerConfig}
              onChange={setFooterConfig}
              disabled={busy}
              saving={savingSection === "footer"}
              onSave={saveFooter}
              onReset={resetFooter}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

