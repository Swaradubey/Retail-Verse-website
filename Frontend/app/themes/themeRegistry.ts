import React from 'react';
import { LuxeHeader } from './luxe-commerce/LuxeHeader';
import { LuxeFooter } from './luxe-commerce/LuxeFooter';
import { LuxeHomeHero } from './luxe-commerce/LuxeHomeHero';
import { LuxeHomeFeatured } from './luxe-commerce/LuxeHomeFeatured';
import { LuxeHomePromotional } from './luxe-commerce/LuxeHomePromotional';
import { LuxeProductCard } from './luxe-commerce/LuxeProductCard';
import { LuxeProductDetail } from './luxe-commerce/LuxeProductDetail';
import { LuxeCollection } from './luxe-commerce/LuxeCollection';
import { LuxeCart } from './luxe-commerce/LuxeCart';
import { NovaHeader } from './nova-marketplace/NovaHeader';
import { NovaFooter } from './nova-marketplace/NovaFooter';
import { NovaHomeHero } from './nova-marketplace/NovaHomeHero';
import { NovaHomeFeatured } from './nova-marketplace/NovaHomeFeatured';
import { NovaHomePromotional } from './nova-marketplace/NovaHomePromotional';
import { NovaProductCard } from './nova-marketplace/NovaProductCard';
import { NovaProductDetail } from './nova-marketplace/NovaProductDetail';
import { NovaCollection } from './nova-marketplace/NovaCollection';
import { NovaCart } from './nova-marketplace/NovaCart';

export interface ThemeComponentSet {
  Header: React.ComponentType;
  Footer: React.ComponentType;
  HomeHero: React.ComponentType;
  HomeFeatured: React.ComponentType;
  HomePromotional: React.ComponentType;
  ProductCard: React.ComponentType<{ product: any }>;
  ProductDetail: React.ComponentType<{ product: any }>;
  CollectionSection: React.ComponentType<{ title: string; products: any[] }>;
  CartSummary: React.ComponentType;
}

const themeRegistry = new Map<string, ThemeComponentSet>();

export function registerTheme(key: string, components: ThemeComponentSet) {
  themeRegistry.set(key, components);
}

export function getThemeComponents(key: string): ThemeComponentSet | undefined {
  return themeRegistry.get(key);
}

export function getThemeHeader(key: string): React.ComponentType | null {
  return themeRegistry.get(key)?.Header || null;
}

export function getThemeFooter(key: string): React.ComponentType | null {
  return themeRegistry.get(key)?.Footer || null;
}

// ── Register both themes ────────────────────────────────────────────────────────
registerTheme('luxe-commerce', {
  Header: LuxeHeader,
  Footer: LuxeFooter,
  HomeHero: LuxeHomeHero,
  HomeFeatured: LuxeHomeFeatured,
  HomePromotional: LuxeHomePromotional,
  ProductCard: LuxeProductCard,
  ProductDetail: LuxeProductDetail,
  CollectionSection: LuxeCollection,
  CartSummary: LuxeCart,
});

registerTheme('nova-marketplace', {
  Header: NovaHeader,
  Footer: NovaFooter,
  HomeHero: NovaHomeHero,
  HomeFeatured: NovaHomeFeatured,
  HomePromotional: NovaHomePromotional,
  ProductCard: NovaProductCard,
  ProductDetail: NovaProductDetail,
  CollectionSection: NovaCollection,
  CartSummary: NovaCart,
});

export { themeRegistry };
