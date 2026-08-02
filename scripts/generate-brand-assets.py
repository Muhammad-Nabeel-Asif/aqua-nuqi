#!/usr/bin/env python3
"""Regenerate every Aqua Nuqi brand asset from the single source artwork.

Run this whenever the logo changes:

    python3 scripts/generate-brand-assets.py

Source of truth:
    resources/brand/source/aqua-nuqi-logo-source.jpg

Everything under resources/brand/, the packaged icons in resources/, and the
renderer copies in src/renderer/src/assets/brand/ are derived outputs. Do not
hand-edit them.

--- How this works -----------------------------------------------------------

1. Background removal. The source is a flat two-colour logo composited on
   black. Thresholding would eat the dark slate wordmark, so instead every
   pixel is projected onto the known palette:

       t = dot(pixel, colour) / dot(colour, colour)

   For an opaque pixel t == 1; for an anti-aliased edge t is the coverage. The
   palette entry with the smallest residual wins. The result is an image whose
   RGB is exactly one of two colours everywhere, with all detail in alpha.

2. Resizing. Never resize the composed RGBA: PIL resamples colour channels
   without premultiplying alpha, so the RGB of transparent pixels bleeds into
   the artwork and turns the blue splash muddy. Instead each colour keeps its
   own 8-bit alpha mask, the masks are resized, and the image is recomposed
   with flat RGB. This preserves colour fidelity and, because the RGB channels
   stay two-valued, roughly halves the PNG size.

Requires Pillow (pip install --user Pillow). No other dependencies.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover - developer tooling
    sys.exit("Pillow is required: pip install --user Pillow")

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "resources" / "brand" / "source" / "aqua-nuqi-logo-source.jpg"
BRAND_DIR = ROOT / "resources" / "brand"
RESOURCES = ROOT / "resources"
# Renderer copies so Vite can bundle them, mirroring resources/fonts →
# src/renderer/src/assets/fonts. Generated, never hand-edited.
RENDERER_BRAND = ROOT / "src" / "renderer" / "src" / "assets" / "brand"
RENDERER_ASSETS = (
    "logo-full.png",
    "logo-full-light.png",
    "logo-mark.png",
    "icon-128.png",
    "favicon-64.png",
)

# Brand palette. Keep in sync with src/shared/brand.ts.
SPLASH = (107, 192, 231)  # #6BC0E7
SLATE = (47, 59, 71)  # #2F3B47
ON_DARK = (238, 245, 250)  # wordmark on a dark surface
PALETTE = (SPLASH, SLATE)

# Alpha below this is JPEG noise around the artwork, not real coverage.
ALPHA_FLOOR = 0.06

# Widths. The source artwork is ~485px wide, so upscaling past that only adds
# blur and bytes. The print lockup is deliberately small: it is base64-embedded
# into every generated PDF, so each kilobyte is paid hundreds of times over.
LOCKUP_WIDTH = 480
PRINT_WIDTH = 320
MARK_WIDTH = 480
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

Mask = Image.Image


def extract_masks(img: Image.Image) -> tuple[Mask, Mask]:
    """Return one 8-bit alpha mask per palette colour, background removed."""
    img = img.convert("RGB")
    w, h = img.size
    src = img.load()

    splash = Image.new("L", (w, h), 0)
    slate = Image.new("L", (w, h), 0)
    splash_px = splash.load()
    slate_px = slate.load()

    norms = [sum(c * c for c in colour) for colour in PALETTE]

    for y in range(h):
        for x in range(w):
            pixel = src[x, y]
            if pixel[0] < 3 and pixel[1] < 3 and pixel[2] < 3:
                continue

            best_index = 0
            best_residual = None
            best_t = 0.0
            for index, colour in enumerate(PALETTE):
                t = sum(p * c for p, c in zip(pixel, colour)) / norms[index]
                t_clamped = min(max(t, 0.0), 1.0)
                residual = sum((p - t_clamped * c) ** 2 for p, c in zip(pixel, colour))
                if best_residual is None or residual < best_residual:
                    best_residual = residual
                    best_index = index
                    best_t = t_clamped

            if best_t < ALPHA_FLOOR:
                continue

            alpha = round(best_t * 255)
            if best_index == 0:
                splash_px[x, y] = alpha
            else:
                slate_px[x, y] = alpha

    return splash, slate


def crop_masks(*masks: Mask) -> tuple[Mask, ...]:
    """Trim all masks to their combined bounding box, keeping them aligned."""
    combined = masks[0]
    for mask in masks[1:]:
        combined = Image.blend(combined, mask, 0.5).point(lambda v: 255 if v else 0)
    union = Image.new("L", masks[0].size, 0)
    for mask in masks:
        union.paste(mask, (0, 0), mask.point(lambda v: 255 if v else 0))
    box = union.getbbox()
    return tuple(mask.crop(box) for mask in masks)


def compose(
    splash: Mask,
    slate: Mask,
    width: int,
    slate_colour: tuple[int, int, int] = SLATE,
) -> Image.Image:
    """Resize the masks and recompose with flat RGB (see module docstring)."""
    scale = width / splash.width
    size = (width, max(1, round(splash.height * scale)))
    a_splash = splash.resize(size, Image.LANCZOS).load()
    a_slate = slate.resize(size, Image.LANCZOS).load()

    # Transparent pixels share the slate RGB so the colour channels stay
    # two-valued, which compresses far better than leaving them black.
    out = Image.new("RGBA", size, (*slate_colour, 0))
    px = out.load()
    for y in range(size[1]):
        for x in range(size[0]):
            s, t = a_splash[x, y], a_slate[x, y]
            alpha = min(255, s + t)
            if alpha == 0:
                continue
            px[x, y] = (*(SPLASH if s >= t else slate_colour), alpha)
    return out


def tint(mask: Mask, width: int, colour: tuple[int, int, int]) -> Image.Image:
    """Single-colour render of one mask, used for the splash-only app mark."""
    scale = width / mask.width
    size = (width, max(1, round(mask.height * scale)))
    resized = mask.resize(size, Image.LANCZOS)
    out = Image.new("RGBA", size, (*colour, 0))
    out.putalpha(resized)
    return out


def centre(canvas: Image.Image, img: Image.Image, dy: int = 0) -> None:
    canvas.alpha_composite(
        img, ((canvas.width - img.width) // 2, (canvas.height - img.height) // 2 + dy)
    )


def fit_opaque(img: Image.Image, box: tuple[int, int]) -> Image.Image:
    """Scale an already-composed RGBA image. Only for opaque installer art."""
    scale = min(box[0] / img.width, box[1] / img.height)
    return img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)


def rounded_icon(mark: Image.Image, size: int) -> Image.Image:
    """App icon: brand-slate rounded square with the splash mark centred.

    A dark plate keeps the light-blue mark legible on both light and dark
    taskbars, which a transparent or white icon would not.
    """
    scale = 4  # supersample so the rounded corners stay smooth
    big = size * scale
    plate = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(plate).rounded_rectangle(
        (0, 0, big - 1, big - 1), radius=round(big * 0.22), fill=(*SLATE, 255)
    )
    glyph = mark.resize(
        (round(big * 0.70), round(mark.height * (big * 0.70) / mark.width)), Image.LANCZOS
    )
    centre(plate, glyph)
    return plate.resize((size, size), Image.LANCZOS)


def save(img: Image.Image, path: Path) -> None:
    img.save(path, optimize=True)


def main() -> None:
    if not SOURCE.exists():
        sys.exit(f"Source artwork not found: {SOURCE}")

    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    RENDERER_BRAND.mkdir(parents=True, exist_ok=True)

    splash_full, slate_full = crop_masks(*extract_masks(Image.open(SOURCE)))
    splash_only = splash_full.crop(splash_full.getbbox())
    print(f"extracted lockup {splash_full.size}, splash mark {splash_only.size}")

    # --- Lockups ---------------------------------------------------------
    save(compose(splash_full, slate_full, LOCKUP_WIDTH), BRAND_DIR / "logo-full.png")
    save(
        compose(splash_full, slate_full, LOCKUP_WIDTH, slate_colour=ON_DARK),
        BRAND_DIR / "logo-full-light.png",
    )
    # Embedded into every PDF, so kept as small as print quality allows.
    save(compose(splash_full, slate_full, PRINT_WIDTH), BRAND_DIR / "logo-print.png")

    # --- Splash mark ------------------------------------------------------
    # Tightly cropped, not padded into a square: consumers set a CSS height,
    # and square padding would shrink the visible splash to about half of it.
    mark = tint(splash_only, MARK_WIDTH, SPLASH)
    save(mark, BRAND_DIR / "logo-mark.png")

    # --- Application icons ------------------------------------------------
    # Square slate badge. Also used for the collapsed sidebar rail, where a
    # bare splash is too faint to register at ~40px.
    icon512 = rounded_icon(mark, 512)
    save(icon512, BRAND_DIR / "icon-512.png")
    save(icon512, RESOURCES / "icon.png")
    save(rounded_icon(mark, 128), BRAND_DIR / "icon-128.png")
    save(rounded_icon(mark, 64), BRAND_DIR / "favicon-64.png")
    icon512.save(RESOURCES / "icon.ico", format="ICO", sizes=[(s, s) for s in ICO_SIZES])

    # --- NSIS installer graphics (exact sizes, 24-bit BMP, no alpha) ------
    lockup = Image.open(BRAND_DIR / "logo-full.png")
    lockup_light = Image.open(BRAND_DIR / "logo-full-light.png")

    header = Image.new("RGBA", (150, 57), (255, 255, 255, 255))
    header.alpha_composite(fit_opaque(lockup, (132, 41)), (9, 8))
    header.convert("RGB").save(BRAND_DIR / "installerHeader.bmp", "BMP")

    sidebar = Image.new("RGBA", (164, 314), (*SLATE, 255))
    sidebar.alpha_composite(fit_opaque(lockup_light, (140, 96)), (12, 100))
    sidebar.convert("RGB").save(BRAND_DIR / "installerSidebar.bmp", "BMP")

    # --- Renderer copies (Vite bundles these) -----------------------------
    for name in RENDERER_ASSETS:
        (RENDERER_BRAND / name).write_bytes((BRAND_DIR / name).read_bytes())

    written = (
        sorted(BRAND_DIR.glob("*.png"))
        + sorted(BRAND_DIR.glob("*.bmp"))
        + [RESOURCES / "icon.png", RESOURCES / "icon.ico"]
        + [RENDERER_BRAND / name for name in RENDERER_ASSETS]
    )
    for path in written:
        if path.is_file():
            print(f"  {path.stat().st_size / 1024:7.1f} KB  {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
