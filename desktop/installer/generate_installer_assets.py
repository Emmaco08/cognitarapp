"""
CogniTara Studio 2.2 — NSIS wizard bitmap generator (fallback / direct-run installer).

The 2.2 NSIS wizard is a clean native *light* Windows wizard (see installer.nsh):
  * sidebar.bmp  164x314  — MUI2 Welcome/Finish page panel (dark brand panel)
  * header.bmp   150x57   — MUI2 inner-page header image (white, matches header bg)

Both are rendered 3x supersampled and downscaled with Lanczos for crisp edges.
Content keeps generous safe margins and no edge-anchored text, so MUI2's default
"FitControl" stretching at 125–200% DPI only scales — it never clips (the 2.1
490x218 feature slides were clipped under DPI scaling and have been removed).

Also writes PNG previews plus a 100%-DPI mock of the Welcome and Finish pages to
desktop/installer/previews/ for visual QA.
"""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
OUT_DIR = HERE / "assets"
PREVIEW_DIR = HERE / "previews"
FONT_DIR = REPO_ROOT / "desktop" / "src" / "renderer" / "fonts"

# Opus Studio palette
NAVY = (10, 14, 26)          # #0A0E1A
OBSIDIAN = (5, 7, 12)        # #05070C
OBSIDIAN_2 = (18, 24, 37)    # #121825
COBALT = (0, 102, 255)       # #0066FF
CYAN = (0, 210, 255)         # #00D2FF
CERAMIC = (246, 248, 252)    # #F6F8FC
SLATE = (148, 163, 184)      # #94A3B8
INK = (10, 14, 26)
WHITE = (255, 255, 255)

SS = 3  # supersampling factor


def font(size: int, weight: int = 400) -> ImageFont.FreeTypeFont:
    var = FONT_DIR / "PlusJakartaSans-Variable.woff2"
    if var.is_file():
        try:
            f = ImageFont.truetype(str(var), size)
            f.set_variation_by_axes([weight])
            return f
        except Exception:
            pass
    for path in (
        "C:/Windows/Fonts/segoeuib.ttf" if weight >= 600 else "C:/Windows/Fonts/segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if weight >= 600 else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        if os.path.isfile(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def radial_glow(size: tuple[int, int], center: tuple[float, float], radius: float, color: tuple, alpha: float) -> Image.Image:
    w, h = size
    layer = Image.new("RGBA", size, color + (0,))
    mask = Image.new("L", size, 0)
    px = mask.load()
    cx, cy = center
    for y in range(h):
        for x in range(w):
            d = math.hypot(x - cx, y - cy) / radius
            if d < 1:
                px[x, y] = int(255 * alpha * (1 - d) ** 2.2)
    layer.putalpha(mask)
    return layer


def vertical_gradient(size: tuple[int, int], top: tuple, bottom: tuple) -> Image.Image:
    w, h = size
    img = Image.new("RGB", size, top)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)))
    return img


def symbol(size: int, star_color=CYAN, c_color=WHITE) -> Image.Image:
    """Render the CogniTara 'C + star' symbol from its SVG geometry (viewBox 22..178)."""
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = s / 156.0

    def P(x, y):
        return ((x - 22) * k, (y - 22) * k)

    # C ring: outer r≈72.4 around (100,100), inner r≈44, opening on the right (≈ ±45°)
    cx, cy = P(100, 100)
    r_out, r_in = 72.4 * k, 44.0 * k
    d.pieslice([cx - r_out, cy - r_out, cx + r_out, cy + r_out], 45, 315, fill=c_color)
    d.pieslice([cx - r_in, cy - r_in, cx + r_in, cy + r_in], 0, 360, fill=(0, 0, 0, 0))
    # 4-point star
    star = [P(108, 74), P(113, 93), P(146, 100), P(113, 107), P(108, 126), P(103, 107), P(90, 100), P(103, 93)]
    d.polygon(star, fill=star_color)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def app_tile(size: int) -> Image.Image:
    """Rounded navy app tile with the symbol (mirrors the setup UI logo tile)."""
    s = size * 4
    tile = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    grad = vertical_gradient((s, s), (24, 33, 58), OBSIDIAN).convert("RGBA")
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.28), fill=255)
    tile.paste(grad, (0, 0), mask)
    ImageDraw.Draw(tile).rounded_rectangle([2, 2, s - 3, s - 3], radius=int(s * 0.28), outline=(255, 255, 255, 34), width=max(2, s // 90))
    sym = symbol(int(s * 0.58))
    tile.alpha_composite(sym, ((s - sym.width) // 2, (s - sym.height) // 2))
    return tile.resize((size, size), Image.Resampling.LANCZOS)


def generate_sidebar() -> Image.Image:
    W, H = 164 * SS, 314 * SS
    img = vertical_gradient((W, H), (14, 20, 38), OBSIDIAN).convert("RGBA")
    img.alpha_composite(radial_glow((W, H), (W * 0.5, H * 0.30), W * 0.95, COBALT, 0.55))
    img.alpha_composite(radial_glow((W, H), (W * 0.95, H * 0.98), W * 0.9, CYAN, 0.18))

    # faint grid fading out from the top
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    step = 14 * SS
    for x in range(0, W, step):
        gd.line([(x, 0), (x, H)], fill=(148, 163, 184, 14), width=1)
    for y in range(0, H, step):
        gd.line([(0, y), (W, y)], fill=(148, 163, 184, 14), width=1)
    fade = Image.linear_gradient("L").resize((W, H)).point(lambda v: 255 - v)
    grid.putalpha(Image.composite(grid.getchannel("A"), Image.new("L", (W, H), 0), fade))
    img.alpha_composite(grid)

    # logo tile with soft halo
    tile_size = 64 * SS
    halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse([W / 2 - 60 * SS, 96 * SS - 60 * SS, W / 2 + 60 * SS, 96 * SS + 60 * SS], fill=(0, 120, 255, 70))
    img.alpha_composite(halo.filter(ImageFilter.GaussianBlur(26 * SS)))
    tile = app_tile(tile_size)
    img.alpha_composite(tile, ((W - tile_size) // 2, 96 * SS - tile_size // 2))

    d = ImageDraw.Draw(img)
    f_word = font(19 * SS, 700)
    f_studio = font(12 * SS, 600)
    f_meta = font(8 * SS, 600)
    w1 = d.textlength("Cogni", font=f_word)
    w2 = d.textlength("Tara", font=f_word)
    x0 = (W - (w1 + w2)) / 2
    y0 = 142 * SS
    d.text((x0, y0), "Cogni", font=f_word, fill=WHITE)
    d.text((x0 + w1, y0), "Tara", font=f_word, fill=CYAN)
    st = "Studio"
    d.text(((W - d.textlength(st, font=f_studio)) / 2, y0 + 27 * SS), st, font=f_studio, fill=(203, 213, 225))

    # accent rule + footer
    rule_w = 36 * SS
    for i in range(rule_w):
        t = i / rule_w
        col = tuple(int(COBALT[c] * (1 - t) + CYAN[c] * t) for c in range(3)) + (255,)
        d.line([((W - rule_w) / 2 + i, 196 * SS), ((W - rule_w) / 2 + i, 196 * SS + 2 * SS)], fill=col)
    ft = "OFFLINE LAN EXAM SERVER"
    d.text(((W - d.textlength(ft, font=f_meta)) / 2, 284 * SS), ft, font=f_meta, fill=(100, 116, 139))

    final = img.convert("RGB").resize((164, 314), Image.Resampling.LANCZOS)
    final.save(OUT_DIR / "sidebar.bmp", format="BMP")
    final.save(PREVIEW_DIR / "sidebar.png", format="PNG")
    return final


def generate_header() -> Image.Image:
    W, H = 150 * SS, 57 * SS
    img = Image.new("RGBA", (W, H), WHITE + (255,))
    tile_size = 34 * SS
    tile = app_tile(tile_size)
    tx = W - tile_size - 12 * SS
    img.alpha_composite(tile, (tx, (H - tile_size) // 2))
    d = ImageDraw.Draw(img)
    f_word = font(13 * SS, 700)
    f_sub = font(8 * SS, 600)
    w1 = d.textlength("Cogni", font=f_word)
    w2 = d.textlength("Tara", font=f_word)
    x = tx - 9 * SS - (w1 + w2)
    d.text((x, 14 * SS), "Cogni", font=f_word, fill=INK)
    d.text((x + w1, 14 * SS), "Tara", font=f_word, fill=(0, 144, 208))
    sub = "STUDIO"
    d.text((tx - 9 * SS - d.textlength(sub, font=f_sub), 32 * SS), sub, font=f_sub, fill=(91, 107, 130))
    final = img.convert("RGB").resize((150, 57), Image.Resampling.LANCZOS)
    final.save(OUT_DIR / "header.bmp", format="BMP")
    final.save(PREVIEW_DIR / "header.png", format="PNG")
    return final


def mock_wizard_page(sidebar: Image.Image, title: str, body: str, name: str, checkbox: str | None = None) -> None:
    """Approximate a 100%-DPI MUI2 Welcome/Finish page (497x360 incl. button bar)."""
    W, H = 497 * 2, 360 * 2
    img = Image.new("RGB", (W, H), WHITE)
    img.paste(sidebar.resize((164 * 2, 314 * 2), Image.Resampling.LANCZOS), (0, 0))
    d = ImageDraw.Draw(img)
    d.text((180 * 2, 16 * 2), title, font=font(15 * 2, 700), fill=INK)
    y = 52 * 2
    f_body = font(9 * 2, 400)
    for para in body.split("\n"):
        line = ""
        for word in para.split():
            cand = (line + " " + word).strip()
            if d.textlength(cand, font=f_body) > 300 * 2:
                d.text((180 * 2, y), line, font=f_body, fill=(51, 65, 85))
                y += 15 * 2
                line = word
            else:
                line = cand
        if line:
            d.text((180 * 2, y), line, font=f_body, fill=(51, 65, 85))
        y += 22 * 2
    if checkbox:
        cy = 200 * 2
        d.rounded_rectangle([180 * 2, cy, 192 * 2, cy + 12 * 2], radius=2 * 2, fill=(0, 102, 255))
        d.line([(183 * 2, cy + 6 * 2), (185.5 * 2, cy + 9 * 2), (190 * 2, cy + 3 * 2)], fill=WHITE, width=2 * 2)
        d.text((198 * 2, cy - 1 * 2), checkbox, font=font(9 * 2, 500), fill=INK)
    # button bar
    d.rectangle([0, 314 * 2, W, H], fill=(240, 240, 240))
    d.line([(0, 314 * 2), (W, 314 * 2)], fill=(223, 223, 223), width=2)
    for i, label in enumerate(["< Back", "Next >" if checkbox is None else "Finish", "Cancel"]):
        x = (250 + i * 82) * 2
        d.rounded_rectangle([x, 326 * 2, x + 75 * 2, 349 * 2], radius=3 * 2, fill=WHITE, outline=(0, 102, 255) if i == 1 else (208, 208, 208), width=2)
        f_btn = font(9 * 2, 500)
        d.text((x + (75 * 2 - d.textlength(label, font=f_btn)) / 2, 332 * 2), label, font=f_btn, fill=INK)
    img.save(PREVIEW_DIR / f"{name}.png", format="PNG")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    # Remove the retired 2.1 carousel slides.
    for old in list(OUT_DIR.glob("slide_*.bmp")) + list(PREVIEW_DIR.glob("slide_*.png")):
        old.unlink()
    sidebar = generate_sidebar()
    generate_header()
    if "--no-mock" not in sys.argv:
        mock_wizard_page(
            sidebar,
            "Welcome to CogniTara Studio Setup",
            "This will install CogniTara Studio 2.2.6 — the offline-first LAN CBT exam server with the 5-layer licence vault — on this computer.\n"
            "Exam data, logs and backups are stored in %ProgramData%\\CogniTara and are preserved during updates.\n"
            "Click Next to continue.",
            "mock_welcome_page",
        )
        mock_wizard_page(
            sidebar,
            "CogniTara Studio is ready",
            "CogniTara Studio 2.2.6 has been installed on this computer.\n"
            "Launch Studio to complete the 5-step school setup, or sign in with your CogniTara Cloud account.",
            "mock_finish_page",
            checkbox="Launch CogniTara Studio",
        )
    print(f"Generated NSIS wizard bitmaps in {OUT_DIR}:")
    for p in sorted(OUT_DIR.glob("*.bmp")):
        with Image.open(p) as im:
            print(f"  - {p.name} {im.size[0]}x{im.size[1]} ({p.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
