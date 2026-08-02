/**
 * Single source of truth for Aqua Nuqi brand identity.
 *
 * Imported by main, preload and renderer, so this file must stay free of Node
 * and Electron APIs and must not import image binaries.
 *
 * Artwork lives in `resources/brand/`, generated from
 * `resources/brand/source/aqua-nuqi-logo-source.jpg` by
 * `scripts/generate-brand-assets.py`. To change the logo, replace that one
 * source file and re-run the script — no code changes required.
 *
 * Consumers:
 * - renderer UI  → `@renderer/brand` (AppLogo, BRAND_ASSET_URLS)
 * - main process → `@main/lib/brand-assets` (file paths, data URLs)
 */

import { PRODUCT_NAME } from './constants'

export const BRAND_NAME = PRODUCT_NAME
export const BRAND_TAGLINE = 'Water plant management' as const

/** Palette sampled from the official artwork. Keep in sync with the generator. */
export const BRAND_COLOURS = {
  /** Water splash light blue. */
  splash: '#6BC0E7',
  /** Wordmark charcoal — also the app icon plate. */
  slate: '#2F3B47',
  /** Default document accent (matches `invoice.accentColour` default). */
  accent: '#0284C7',
  /** Wordmark colour when placed on a dark surface. */
  onDark: '#EEF5FA',
} as const

/**
 * File names under `resources/brand/`. Referencing these by constant means a
 * rename only has to happen here and in the generator.
 */
export const BRAND_ASSETS = {
  /** Full lockup (splash + wordmark) for light surfaces. */
  logoFull: 'logo-full.png',
  /** Full lockup for dark surfaces. */
  logoFullLight: 'logo-full-light.png',
  /** Splash mark only, tightly cropped — for tight horizontal spaces. */
  logoMark: 'logo-mark.png',
  /** Square slate badge, for rails and avatars where a bare splash is too faint. */
  iconBadge: 'icon-128.png',
  /** Small square app icon for favicon use. */
  favicon: 'favicon-64.png',
  /** 512px app icon with the slate plate. */
  icon512: 'icon-512.png',
} as const

export type BrandAssetName = (typeof BRAND_ASSETS)[keyof typeof BRAND_ASSETS]
