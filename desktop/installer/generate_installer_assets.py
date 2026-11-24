"""
CogniTara Studio 2.1 — Modern Photoshop / CorelDRAW-Style Windows Installer Asset Generator

Generates 2x supersampled Opus Studio Midnight Navy / Cobalt / Electric Cyan 24-bit BMPs
for the custom NSIS installer (sidebar, header, and 5 interactive feature showcase slides)
plus PNG previews for visual QA review.
"""

from __future__ import annotations

import math
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
OUT_DIR = Path(__file__).resolve().parent / "assets"
PREVIEW_DIR = Path(__file__).resolve().parent / "previews"

# Opus Studio Fixed Brand Palette
BG_NAVY = (10, 14, 26)         # #0A0E1A
BG_DEEP = (6, 10, 20)          # #060A14
SURFACE = (19, 27, 45)         # #131B2D
SURFACE_ALT = (24, 35, 58)     # #18233A
BORDER = (46, 64, 98)          # subtle slate border
COBALT = (0, 102, 255)         # #0066FF
COBALT_LIGHT = (46, 125, 255)  # #2E7DFF
CYAN = (0, 210, 255)           # #00D2FF
WHITE = (243, 246, 251)        # #F3F6FB
SLATE = (169, 182, 202)        # #A9B6CA
MUTED = (125, 140, 164)        # #7D8CA4
EMERALD = (52, 211, 153)       # #34D399


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = []
    if bold:
        candidates += [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            str(REPO_ROOT / "static" / "fonts" / "CogniTaraType-Bold.ttf"),
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
        ]
    else:
        candidates += [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            str(REPO_ROOT / "static" / "fonts" / "CogniTaraType-Regular.ttf"),
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/arial.ttf",
        ]
    for path in candidates:
        if os.path.isfile(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def make_gradient_bg(w: int, h: int, glow1: tuple, glow2: tuple) -> Image.Image:
    img = Image.new("RGB", (w, h), BG_NAVY)
    px = img.load()
    g1x, g1y, g1r, g1c, g1a = glow1
    g2x, g2y, g2r, g2c, g2a = glow2

    for y in range(h):
        # Vertical subtle navy depth
        t = y / max(1, h - 1)
        base_r = BG_NAVY[0] * (1 - t) + BG_DEEP[0] * t
        base_g = BG_NAVY[1] * (1 - t) + BG_DEEP[1] * t
        base_b = BG_NAVY[2] * (1 - t) + BG_DEEP[2] * t
        dy1 = y - g1y
        dy2 = y - g2y
        for x in range(w):
            r, g, b = base_r, base_g, base_b
            d1 = math.hypot(x - g1x, dy1) / g1r
            if d1 < 1.0:
                f = ((1.0 - d1) ** 2) * g1a
                r = r * (1 - f) + g1c[0] * f
                g = g * (1 - f) + g1c[1] * f
                b = b * (1 - f) + g1c[2] * f
            d2 = math.hypot(x - g2x, dy2) / g2r
            if d2 < 1.0:
                f = ((1.0 - d2) ** 2) * g2a
                r = r * (1 - f) + g2c[0] * f
                g = g * (1 - f) + g2c[1] * f
                b = b * (1 - f) + g2c[2] * f
            px[x, y] = (int(min(255, r)), int(min(255, g)), int(min(255, b)))
    return img


def paste_symbol(img: Image.Image, center_x: int, center_y: int, size: int) -> None:
    sym_path = REPO_ROOT / "CogniTara-Brand-Identity" / "cognitara-app-icon.png"
    if not sym_path.is_file():
        sym_path = REPO_ROOT / "desktop" / "assets" / "cognitara-app-icon.png"
    if sym_path.is_file():
        icon = Image.open(sym_path).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
        img.paste(icon, (center_x - size // 2, center_y - size // 2), icon)


def draw_rounded_rect(draw: ImageDraw.ImageDraw, xy, radius: int, fill=None, outline=None, width: int = 1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def draw_accent_bar(draw: ImageDraw.ImageDraw, x0: int, y0: int, x1: int, y1: int):
    width = max(1, x1 - x0)
    for x in range(x0, x1):
        t = (x - x0) / width
        col = (
            int(COBALT[0] * (1 - t) + CYAN[0] * t),
            int(COBALT[1] * (1 - t) + CYAN[1] * t),
            int(COBALT[2] * (1 - t) + CYAN[2] * t),
        )
        draw.line([(x, y0), (x, y1)], fill=col)


def generate_sidebar():
    # 164x314 rendered at 2x (328x628) then downscaled
    W, H = 328, 628
    img = make_gradient_bg(
        W, H,
        glow1=(W * 0.5, H * 0.22, 260, COBALT, 0.42),
        glow2=(W * 0.85, H * 0.78, 220, CYAN, 0.22),
    )
    draw = ImageDraw.Draw(img)

    # Subtle architectural grid
    for gx in range(28, W, 36):
        draw.line([(gx, 0), (gx, H)], fill=(20, 30, 52), width=1)
    for gy in range(28, H, 36):
        draw.line([(0, gy), (W, gy)], fill=(20, 30, 52), width=1)

    # Right border highlight
    draw.line([(W - 2, 0), (W - 2, H)], fill=(38, 56, 88), width=2)

    # App icon emblem
    paste_symbol(img, W // 2, 132, 134)

    f_title = load_font(34, bold=True)
    f_sub = load_font(18, bold=True)
    f_meta = load_font(16, bold=False)

    # Wordmark text
    tw1 = draw.textlength("Cogni", font=f_title)
    tw2 = draw.textlength("Tara", font=f_title)
    sx = (W - (tw1 + tw2)) / 2
    draw.text((sx, 224), "Cogni", font=f_title, fill=WHITE)
    draw.text((sx + tw1, 224), "Tara", font=f_title, fill=CYAN)

    # Studio pill
    pill_w, pill_h = 136, 34
    px0 = (W - pill_w) // 2
    draw_rounded_rect(draw, [px0, 276, px0 + pill_w, 276 + pill_h], 17, fill=(14, 42, 74), outline=(0, 148, 210), width=2)
    st = "STUDIO 2.1"
    stw = draw.textlength(st, font=f_sub)
    draw.text(((W - stw) / 2, 283), st, font=f_sub, fill=CYAN)

    # Bottom feature bullets
    bullets = [
        "Offline-First LAN Server",
        "5-Layer Licence Vault",
        "Direct Auto-Updates",
        "Neon Cloud Sync",
    ]
    y = 416
    for b in bullets:
        draw.ellipse([36, y + 6, 46, y + 16], fill=CYAN)
        draw.text((58, y), b, font=f_meta, fill=SLATE)
        y += 34

    draw_accent_bar(draw, 32, H - 54, W - 32, H - 50)
    ft = "Windows x64 Installer"
    ftw = draw.textlength(ft, font=load_font(15))
    draw.text(((W - ftw) / 2, H - 36), ft, font=load_font(15), fill=MUTED)

    final = img.resize((164, 314), Image.Resampling.LANCZOS)
    final.save(OUT_DIR / "sidebar.bmp", format="BMP")
    final.save(PREVIEW_DIR / "sidebar.png", format="PNG")


def generate_header():
    # 150x57 rendered at 2x (300x114)
    W, H = 300, 114
    img = make_gradient_bg(
        W, H,
        glow1=(W * 0.8, H * 0.4, 170, COBALT, 0.35),
        glow2=(W * 0.25, H * 0.5, 130, CYAN, 0.16),
    )
    draw = ImageDraw.Draw(img)
    paste_symbol(img, 54, H // 2 - 2, 66)

    f_title = load_font(28, bold=True)
    f_sub = load_font(16, bold=True)
    draw.text((100, 26), "Cogni", font=f_title, fill=WHITE)
    tw = draw.textlength("Cogni", font=f_title)
    draw.text((100 + tw, 26), "Tara", font=f_title, fill=CYAN)
    draw.text((100, 62), "STUDIO 2.1", font=f_sub, fill=SLATE)

    draw_accent_bar(draw, 0, H - 4, W, H)

    final = img.resize((150, 57), Image.Resampling.LANCZOS)
    final.save(OUT_DIR / "header.bmp", format="BMP")
    final.save(PREVIEW_DIR / "header.png", format="PNG")


SLIDES = [
    {
        "num": 1,
        "eyebrow": "01 / 05  ·  OFFLINE-FIRST EXAM ENGINE",
        "title": "Run 300+ Students Over School LAN",
        "body": "Zero internet required during sittings. Every answer persists\ninstantly to SQLite WAL so power cuts never wipe work.",
        "metrics": [("300+", "Concurrent PCs"), ("0 ms", "Cloud Latency"), ("WAL", "Safe Persistence")],
        "visual": "lan",
    },
    {
        "num": 2,
        "eyebrow": "02 / 05  ·  5-LAYER LICENCE VAULT",
        "title": "Hardware-Bound Ed25519 Security",
        "body": "Triple-anchor DPAPI, Registry, and SQLite protection with a\n15-minute graceful active-exam drain so exams never abort.",
        "metrics": [("Ed25519", "Signed Leases"), ("3 Anchors", "Anti-Tamper"), ("15 min", "Graceful Drain")],
        "visual": "vault",
    },
    {
        "num": 3,
        "eyebrow": "03 / 05  ·  60FPS PROCTOR STUDIO",
        "title": "One-Click Server & Live Proctor Controls",
        "body": "Start or stop the exam server from one luminous dial.\nAdd +5 min, pause all exams, or resume candidates live.",
        "metrics": [("60 fps", "GPU Accelerated"), ("+5 min", "Instant Extend"), ("Tray", "Zero Consoles")],
        "visual": "dial",
    },
    {
        "num": 4,
        "eyebrow": "04 / 05  ·  AUTOMATED HOT BACKUPS",
        "title": "Zero-Downtime Verified SQLite Backups",
        "body": "Automatic 30-minute exam snapshots verified with SQLite\nintegrity checks and 1-click restore into ProgramData.",
        "metrics": [("30 min", "Auto Snapshots"), ("100%", "Integrity Check"), ("1-Click", "Safe Restore")],
        "visual": "backup",
    },
    {
        "num": 5,
        "eyebrow": "05 / 05  ·  CLOUD SYNC & AUTO-UPDATES",
        "title": "Online Sign-In & Direct Delta Updates",
        "body": "Sign up or sign in with Neon Postgres Cloud (with offline\ncaching) and install Studio updates safely inside the app.",
        "metrics": [("Neon PG", "Cloud Sync"), ("Offline", "Cached Profile"), ("Delta", "In-App Updates")],
        "visual": "cloud",
    },
]


def draw_slide_visual(img: Image.Image, draw: ImageDraw.ImageDraw, kind: str, rx: int, ry: int, rw: int, rh: int):
    # Right-side Opus Studio visual card
    draw_rounded_rect(draw, [rx, ry, rx + rw, ry + rh], 24, fill=SURFACE, outline=BORDER, width=2)
    cx = rx + rw // 2
    cy = ry + rh // 2

    if kind == "lan":
        # Concentric LAN rings + Luminary C hub + 6 connected client nodes
        draw.ellipse([cx - 110, cy - 110, cx + 110, cy + 110], outline=(35, 58, 96), width=2)
        draw.ellipse([cx - 68, cy - 68, cx + 68, cy + 68], outline=(0, 140, 210), width=2)
        for i in range(6):
            ang = math.radians(i * 60 - 30)
            nx = int(cx + math.cos(ang) * 110)
            ny = int(cy + math.sin(ang) * 110)
            draw.line([(cx, cy), (nx, ny)], fill=(0, 110, 220), width=2)
            draw_rounded_rect(draw, [nx - 18, ny - 14, nx + 18, ny + 14], 7, fill=SURFACE_ALT, outline=CYAN if i % 2 == 0 else BORDER, width=2)
            draw.ellipse([nx - 4, ny - 4, nx + 4, ny + 4], fill=EMERALD if i % 2 == 0 else CYAN)
        paste_symbol(img, cx, cy, 74)

    elif kind == "vault":
        # Stacked 3-anchor protection cards + shield header
        paste_symbol(img, cx, ry + 58, 56)
        anchors = [
            ("DPAPI Vault", "SEALED", EMERALD),
            ("Registry MAC", "VERIFIED", CYAN),
            ("SQLite Clock", "TRUSTED", COBALT_LIGHT),
        ]
        ay = ry + 104
        f_sm = load_font(16, bold=True)
        f_xs = load_font(12, bold=True)
        for label, badge, col in anchors:
            draw_rounded_rect(draw, [rx + 22, ay, rx + rw - 22, ay + 48], 12, fill=SURFACE_ALT, outline=BORDER, width=2)
            draw.ellipse([rx + 36, ay + 18, rx + 48, ay + 30], fill=col)
            draw.text((rx + 58, ay + 14), label, font=f_sm, fill=WHITE)
            bw = draw.textlength(badge, font=f_xs) + 18
            draw_rounded_rect(draw, [rx + rw - 32 - bw, ay + 11, rx + rw - 32, ay + 37], 13, fill=(14, 42, 68))
            draw.text((rx + rw - 32 - bw + 9, ay + 17), badge, font=f_xs, fill=col)
            ay += 58

    elif kind == "dial":
        # Glowing Server Dial ring + live status badge
        draw.ellipse([cx - 84, cy - 96, cx + 84, cy + 72], fill=(14, 24, 46), outline=COBALT, width=5)
        draw.arc([cx - 84, cy - 96, cx + 84, cy + 72], start=210, end=490, fill=CYAN, width=6)
        paste_symbol(img, cx, cy - 12, 76)
        draw_rounded_rect(draw, [rx + 24, ry + rh - 68, rx + rw - 24, ry + rh - 24], 14, fill=(12, 48, 42), outline=EMERALD, width=2)
        txt = "ONLINE  ·  192.168.10.24:5000"
        f_xs = load_font(13, bold=True)
        tw = draw.textlength(txt, font=f_xs)
        draw.text((cx - tw / 2, ry + rh - 54), txt, font=f_xs, fill=EMERALD)

    elif kind == "backup":
        # Hot Backup cards with integrity pills
        f_hd = load_font(17, bold=True)
        f_sm = load_font(15, bold=False)
        f_xs = load_font(12, bold=True)
        draw.text((rx + 26, ry + 24), "Hot SQLite Backups", font=f_hd, fill=WHITE)
        draw_accent_bar(draw, rx + 26, ry + 54, rx + rw - 26, ry + 58)
        rows = [
            ("exam_auto_1430.db", "742 KB", "VERIFIED"),
            ("exam_pre_exam.db", "739 KB", "VERIFIED"),
            ("exam_manual.db", "735 KB", "VERIFIED"),
        ]
        by = ry + 78
        for name, sz, st in rows:
            draw_rounded_rect(draw, [rx + 22, by, rx + rw - 22, by + 54], 12, fill=SURFACE_ALT, outline=BORDER, width=2)
            draw.text((rx + 34, by + 10), name, font=f_sm, fill=WHITE)
            draw.text((rx + 34, by + 31), sz, font=f_xs, fill=MUTED)
            bw = draw.textlength(st, font=f_xs) + 18
            draw_rounded_rect(draw, [rx + rw - 32 - bw, by + 14, rx + rw - 32, by + 40], 13, fill=(12, 48, 42))
            draw.text((rx + rw - 32 - bw + 9, by + 20), st, font=f_xs, fill=EMERALD)
            by += 66

    elif kind == "cloud":
        # Cloud account card + live update bar
        f_hd = load_font(18, bold=True)
        f_sm = load_font(14, bold=False)
        f_xs = load_font(12, bold=True)
        paste_symbol(img, rx + 54, ry + 56, 48)
        draw.text((rx + 88, ry + 34), "CogniTara Cloud", font=f_hd, fill=WHITE)
        draw.text((rx + 88, ry + 59), "Neon Postgres · Offline Cache", font=f_sm, fill=CYAN)

        draw_rounded_rect(draw, [rx + 22, ry + 102, rx + rw - 22, ry + 178], 14, fill=SURFACE_ALT, outline=BORDER, width=2)
        draw.text((rx + 36, ry + 114), "Direct In-App Auto-Update", font=f_sm, fill=WHITE)
        draw.text((rx + rw - 82, ry + 114), "v2.1.0", font=f_xs, fill=CYAN)
        # Progress bar
        draw_rounded_rect(draw, [rx + 36, ry + 146, rx + rw - 36, ry + 160], 7, fill=(28, 42, 68))
        draw_accent_bar(draw, rx + 36, ry + 146, rx + rw - 84, ry + 160)

        draw_rounded_rect(draw, [rx + 22, ry + 196, rx + rw - 22, ry + 252], 14, fill=(12, 48, 42), outline=EMERALD, width=2)
        msg = "Safe Server-Stop + Restart Ready"
        mw = draw.textlength(msg, font=f_sm)
        draw.text((cx - mw / 2, ry + 216), msg, font=f_sm, fill=EMERALD)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.replace("\n", " ").split()
    lines: list[str] = []
    cur = ""
    for w in words:
        cand = (cur + " " + w).strip()
        if draw.textlength(cand, font=font) <= max_width:
            cur = cand
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def generate_slides():
    # Final NSIS slide target size: 490x218 rendered at 2x (980x436)
    W, H = 980, 436
    f_eye = load_font(15, bold=True)
    f_title = load_font(32, bold=True)
    f_body = load_font(18, bold=False)
    f_mval = load_font(22, bold=True)
    f_mlbl = load_font(14, bold=False)

    for s in SLIDES:
        img = make_gradient_bg(
            W, H,
            glow1=(160, 80, 420, COBALT, 0.34),
            glow2=(W - 140, H - 60, 360, CYAN, 0.24),
        )
        draw = ImageDraw.Draw(img)

        # Outer subtle hairline frame
        draw_rounded_rect(draw, [2, 2, W - 3, H - 3], 22, fill=None, outline=(36, 54, 86), width=2)
        draw_accent_bar(draw, 32, 2, 240, 6)

        # Left column copy (strictly within x=40..548 so never overlaps right card at x=582)
        lx = 40
        max_col_w = 508
        draw.text((lx, 32), s["eyebrow"], font=f_eye, fill=CYAN)

        title_lines = wrap_text(draw, s["title"], f_title, max_col_w)
        ty = 64
        for line in title_lines[:2]:
            draw.text((lx, ty), line, font=f_title, fill=WHITE)
            ty += 40

        body_lines = wrap_text(draw, s["body"], f_body, max_col_w)
        by = ty + 14
        for bline in body_lines[:3]:
            draw.text((lx, by), bline, font=f_body, fill=SLATE)
            by += 26

        # 3 Metric chips at bottom-left
        mx = lx
        my = H - 122
        mw = 158
        for val, lbl in s["metrics"]:
            draw_rounded_rect(draw, [mx, my, mx + mw, my + 74], 14, fill=SURFACE, outline=BORDER, width=2)
            draw.text((mx + 14, my + 12), val, font=f_mval, fill=WHITE)
            draw.text((mx + 14, my + 44), lbl, font=f_mlbl, fill=MUTED)
            mx += mw + 12

        # Slide progress dots at bottom-left
        dot_x = lx
        dot_y = H - 28
        for idx in range(1, 6):
            if idx == s["num"]:
                draw_rounded_rect(draw, [dot_x, dot_y, dot_x + 34, dot_y + 8], 4, fill=CYAN)
                dot_x += 44
            else:
                draw_rounded_rect(draw, [dot_x, dot_y, dot_x + 12, dot_y + 8], 4, fill=(46, 64, 98))
                dot_x += 22

        # Right-hand visual card
        draw_slide_visual(img, draw, s["visual"], 582, 34, 362, 314)

        # Brand tag bottom-right
        tag = "CogniTara Studio 2.1 · Windows Setup"
        tw = draw.textlength(tag, font=f_mlbl)
        draw.text((W - 38 - tw, H - 32), tag, font=f_mlbl, fill=MUTED)

        final = img.resize((490, 218), Image.Resampling.LANCZOS)
        final.save(OUT_DIR / f"slide_{s['num']}.bmp", format="BMP")
        final.save(PREVIEW_DIR / f"slide_{s['num']}.png", format="PNG")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    generate_sidebar()
    generate_header()
    generate_slides()
    print(f"Generated modern installer assets in {OUT_DIR}:")
    for p in sorted(OUT_DIR.glob("*.bmp")):
        print(f"  - {p.name} ({p.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
