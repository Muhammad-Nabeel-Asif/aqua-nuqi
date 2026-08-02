# Branding

How the Aqua Nuqi logo is stored, generated and used. **Read this before changing any logo,
icon or installer graphic** — everything is derived from one file, and hand-editing an output
will be silently overwritten the next time the generator runs.

---

## 1. Change the logo in three steps

1. Replace `resources/brand/source/aqua-nuqi-logo-source.jpg`.
2. Run `python3 scripts/generate-brand-assets.py`.
3. `npm run test` — the brand tests fail loudly if an output is missing, stale, or the wrong
   format for NSIS.

No component, template or config file needs editing. Every surface reads through
`AppLogo` (renderer) or `brand-assets` (main), and both resolve to the generated files.

If the palette changes, update `SPLASH` / `SLATE` in the generator **and** `BRAND_COLOURS` in
`src/shared/brand.ts`. A test asserts the shared colours are valid hex; keeping the two in sync
is manual because the generator is Python and cannot import the TypeScript module.

---

## 2. Palette

| Token    | Hex       | Used for                                         |
| -------- | --------- | ------------------------------------------------ |
| `splash` | `#6BC0E7` | Water splash in the mark                         |
| `slate`  | `#2F3B47` | Wordmark, app-icon plate, installer sidebar      |
| `accent` | `#0284C7` | Default document accent (`invoice.accentColour`) |
| `onDark` | `#EEF5FA` | Wordmark on a dark surface                       |

---

## 3. Generated assets

All under `resources/brand/`, all derived. Never hand-edit.

| File                   | Size    | Purpose                                            |
| ---------------------- | ------- | -------------------------------------------------- |
| `logo-full.png`        | 480×279 | Primary lockup for light surfaces                  |
| `logo-full-light.png`  | 480×279 | Lockup for dark surfaces                           |
| `logo-print.png`       | 320×186 | Embedded in generated PDFs (kept small on purpose) |
| `logo-mark.png`        | 480×278 | Splash only, tightly cropped                       |
| `icon-512.png`         | 512×512 | App icon — slate plate + mark                      |
| `icon-128.png`         | 128×128 | Square badge for the collapsed sidebar rail        |
| `favicon-64.png`       | 64×64   | Renderer favicon                                   |
| `installerHeader.bmp`  | 150×57  | NSIS installer header                              |
| `installerSidebar.bmp` | 164×314 | NSIS installer / uninstaller sidebar               |

Also written outside `resources/brand/`:

- `resources/icon.ico` — multi-size (16–256) Windows icon
- `resources/icon.png` — 512×512 Linux icon
- `src/renderer/src/assets/brand/*` — copies Vite bundles, mirroring the existing
  `resources/fonts` → `src/renderer/src/assets/fonts` arrangement. A test asserts these stay
  byte-identical to their `resources/brand/` originals.

### Why the generator is not trivial

The source artwork is a flat two-colour logo on a **black** background, and the wordmark is dark
slate. Two things would go wrong with a naive approach:

- **Thresholding the background** would erase the dark wordmark along with the black.
  Instead each pixel is projected onto the known palette to recover its true alpha, giving clean
  anti-aliased edges and a fully opaque wordmark.
- **Resizing the composed RGBA** makes the splash muddy, because PIL resamples colour channels
  without premultiplying alpha, so the RGB of transparent pixels bleeds inward. Instead each
  colour keeps its own alpha mask, the masks are resized, and the image is recomposed with flat
  RGB. As a side effect the colour channels stay two-valued, which roughly halves the PNG size.

---

## 4. Using the logo in code

### Renderer

```tsx
import { AppLogo, BrandLockup, BRAND_NAME } from '@renderer/brand'

<AppLogo />                                  // full lockup, medium
<AppLogo size="sm" />                        // xs | sm | md | lg | xl | 2xl
<AppLogo variant="mark" />                   // splash only
<AppLogo variant="badge" size="md" />        // square slate badge, for rails
<AppLogo onDark />                           // light wordmark on a dark surface
<BrandLockup size="2xl" />                   // logo + tagline, for full-screen surfaces
```

`AppLogo` is decorative by default (`aria-hidden`). Pass `title` only when the logo is the sole
label for a control, which makes it an accessible image instead.

Never `import` a brand PNG directly in a feature file. Add a variant to `AppLogo` instead, or the
next logo change becomes a repo-wide search.

### Main process

```ts
import { appIconPath, brandLogoDataUrl, brandPrintLogoDataUrl } from '@main/lib/brand-assets'
```

Data URLs are cached — a 300-invoice batch would otherwise re-read and re-encode the same file
300 times. All functions return `null` rather than throwing if artwork is missing, so a packaging
mistake degrades the UI instead of crashing boot.

---

## 5. Where branding appears

### Application chrome

| Surface                         | Treatment                                            |
| ------------------------------- | ---------------------------------------------------- |
| Sidebar header (expanded)       | Full lockup                                          |
| Sidebar header (collapsed rail) | Square badge — the bare splash is illegible at ~40px |
| Boot splash                     | `BrandLockup` + skeleton                             |
| Login / recovery                | `BrandLockup` with tagline                           |
| Lock overlay                    | Full lockup                                          |
| Setup wizard — all four screens | Lockup on welcome, small logo on the rest            |
| Settings → About                | Lockup, product name, tagline, version               |
| Help                            | Logo beside the page header                          |
| First-run tour                  | Logo in the modal header                             |
| Error boundary                  | Logo above the error                                 |
| Fatal window (main process)     | Logo embedded as a data URL                          |
| Favicon, window icon, taskbar   | `favicon-64.png` / `icon.ico` / `icon.png`           |

### Documents

Every A4 document renders `BusinessHeader`; 80 mm thermal documents render `ThermalBrandHeader`.

| Document                                                                               | Logo                                                      |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Invoice, statement, delivery card, salary slip, bottles-out, receivables, table export | Yes                                                       |
| Payment receipt (A5)                                                                   | Yes                                                       |
| Payment receipt (thermal), delivery slip                                               | Yes — capped at 10 mm for one-bit printers                |
| Multi-page PDF footer                                                                  | Business name on every page, beside the page number       |
| Excel exports                                                                          | Business name, address and contact as a text header block |

> **Business logo vs app logo.** These documents go to the client's own customers, so an
> **uploaded business logo always wins** (Settings → Invoice). The bundled Aqua Nuqi lockup is
> the fallback, which also means a deleted or corrupted upload degrades to the brand mark rather
> than to a bare initial. This is deliberate: no document should ever print unbranded.

### Packaging

`electron-builder.yml` references `resources/icon.ico`, `resources/icon.png`, and the two NSIS
BMPs. NSIS accepts **only** 24-bit BMP at exactly 150×57 and 164×314; `packaging-safety.test.ts`
parses the BMP headers and asserts both, because getting this wrong fails the Windows build in
CI rather than locally.

---

## 6. Regenerating requires Pillow

```bash
pip install --user Pillow
python3 scripts/generate-brand-assets.py
```

Python is used rather than a Node image library because these assets are generated rarely and
committed, and adding a native dependency such as `sharp` alongside `better-sqlite3` would
complicate the Electron rebuild story for no runtime benefit.
