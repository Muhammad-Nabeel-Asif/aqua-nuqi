/**
 * The only place the renderer touches brand artwork.
 *
 * Every screen renders `<AppLogo />` rather than importing an image, so a
 * future logo change is a single asset swap (see scripts/generate-brand-assets.py)
 * with no component edits.
 */

import iconBadgeUrl from '@renderer/assets/brand/icon-128.png'
import logoFullLightUrl from '@renderer/assets/brand/logo-full-light.png'
import logoFullUrl from '@renderer/assets/brand/logo-full.png'
import logoMarkUrl from '@renderer/assets/brand/logo-mark.png'
import { cn } from '@renderer/lib/utils'
import { BRAND_COLOURS, BRAND_NAME, BRAND_TAGLINE } from '@shared/brand'

export { BRAND_COLOURS, BRAND_NAME, BRAND_TAGLINE }

export const BRAND_ASSET_URLS = {
  logoFull: logoFullUrl,
  logoFullLight: logoFullLightUrl,
  logoMark: logoMarkUrl,
  iconBadge: iconBadgeUrl,
} as const

/**
 * `full`  — splash + wordmark lockup, the default.
 * `mark`  — splash alone, for tight horizontal space beside other text.
 * `badge` — square slate app badge, for rails and avatars where a bare splash
 *           is too faint to register.
 */
export type AppLogoVariant = 'full' | 'mark' | 'badge'

const HEIGHT_CLASS = {
  xs: 'h-5',
  sm: 'h-7',
  md: 'h-9',
  lg: 'h-12',
  xl: 'h-16',
  '2xl': 'h-24',
} as const

export type AppLogoSize = keyof typeof HEIGHT_CLASS

export function AppLogo({
  variant = 'full',
  size = 'md',
  onDark = false,
  className,
  title,
}: {
  variant?: AppLogoVariant
  size?: AppLogoSize
  /** Use the light wordmark so it stays legible on a dark surface. */
  onDark?: boolean
  className?: string
  /** Set only when the logo is the sole label for a control. */
  title?: string
}) {
  const src =
    variant === 'mark'
      ? BRAND_ASSET_URLS.logoMark
      : variant === 'badge'
        ? BRAND_ASSET_URLS.iconBadge
        : onDark
          ? BRAND_ASSET_URLS.logoFullLight
          : BRAND_ASSET_URLS.logoFull

  return (
    <img
      src={src}
      // Decorative wherever the product name is already written next to it.
      alt={title ? BRAND_NAME : ''}
      aria-hidden={title ? undefined : true}
      title={title}
      draggable={false}
      className={cn(HEIGHT_CLASS[size], 'w-auto select-none object-contain', className)}
    />
  )
}

/**
 * Logo above the product name — the standard treatment for the full-screen
 * surfaces a user meets before the app shell (login, lock, setup, fatal errors).
 */
export function BrandLockup({
  size = 'xl',
  tagline = BRAND_TAGLINE,
  className,
}: {
  size?: AppLogoSize
  tagline?: string | null
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 text-center', className)}>
      <AppLogo size={size} title={BRAND_NAME} />
      {tagline ? (
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400">{tagline}</p>
      ) : null}
    </div>
  )
}
