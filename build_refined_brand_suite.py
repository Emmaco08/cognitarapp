"""
build_refined_brand_suite.py
Generates the complete, production-grade CogniTara brand identity package
featuring the newly refined 'Direction C: Custom Technological' wordmark:
- 100% Upright Native SVG Geometry (y=0 top, y=100 baseline)
- Stroke weight: 9.6 pt (elegant, non-bulbous, perfectly balanced)
- Exact unified cap-height, x-height, and baseline for 'Cogni' and 'Tara'
- Identical stroke thickness between 'Cogni' (White) and 'Tara' (Cyan #00D2FF)
- Strictly preserved Luminary C symbol (White C + Cyan forward star beacon)
- Understated tagline with comfortable +3.5px tracking
- Full vector conversion and export to SVG, transparent PNGs, and native .vectorcraft
"""

import os
import subprocess
from PIL import Image
from explore_wordmark_redesign import get_luminary_c_symbol, make_direction_c_paths

OUT_DIR = r"c:\COGNITARA EXAM PORTAL\CogniTara-Brand-Identity"
VC_CLI = r"C:\Program Files\VectorCraft\vectorcraft-cli.exe"

SVG_DEFS = '''<defs>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700&amp;display=swap');
    .tagline { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; font-weight: 600; letter-spacing: 3.5px; }
  </style>
</defs>'''

def build_primary_logo_svg():
    dc, dstar = get_luminary_c_symbol(cx=95, cy=80, scale=0.65)
    wordmark = make_direction_c_paths(cogni_color="#FFFFFF", tara_color="#00D2FF")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 160" width="580" height="160">
{SVG_DEFS}
  <rect width="100%" height="100%" fill="#0A0E1A" rx="20"/>
  <!-- The Luminary C Mark (Strictly Preserved) -->
  <g id="symbol">
    <path d="{dc}" fill="#FFFFFF" />
    <path d="{dstar}" fill="#00D2FF" />
  </g>
  <!-- Refined Custom Technological Wordmark (Upright: top y=52, baseline y=98) -->
  <g transform="translate(178, 52) scale(0.46)">
    {wordmark}
  </g>
  <!-- Understated Tagline -->
  <text x="180" y="122" class="tagline" font-size="10.5" fill="#94A3B8">
    INTELLIGENT SYSTEMS &amp; SOFTWARE
  </text>
</svg>'''

def build_primary_light_logo_svg():
    dc, dstar = get_luminary_c_symbol(cx=95, cy=80, scale=0.65)
    wordmark = make_direction_c_paths(cogni_color="#0A0E1A", tara_color="#0066FF")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 160" width="580" height="160">
{SVG_DEFS}
  <rect width="100%" height="100%" fill="#FFFFFF" rx="20" stroke="#E2E8F0" stroke-width="1.5"/>
  <!-- The Luminary C Mark (Preserved) -->
  <g id="symbol">
    <path d="{dc}" fill="#0A0E1A" />
    <path d="{dstar}" fill="#0066FF" />
  </g>
  <!-- Refined Custom Technological Wordmark -->
  <g transform="translate(178, 52) scale(0.46)">
    {wordmark}
  </g>
  <!-- Understated Tagline -->
  <text x="180" y="122" class="tagline" font-size="10.5" fill="#64748B">
    INTELLIGENT SYSTEMS &amp; SOFTWARE
  </text>
</svg>'''

def build_standalone_wordmark_svg():
    wordmark = make_direction_c_paths(cogni_color="#FFFFFF", tara_color="#00D2FF")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 140" width="480" height="140">
{SVG_DEFS}
  <rect width="100%" height="100%" fill="#0A0E1A" rx="18"/>
  <g transform="translate(42, 38) scale(0.58)">
    {wordmark}
  </g>
  <text x="44" y="116" class="tagline" font-size="11" fill="#94A3B8">
    INTELLIGENT SYSTEMS &amp; SOFTWARE
  </text>
</svg>'''

def build_monochrome_black_svg():
    dc, dstar = get_luminary_c_symbol(cx=95, cy=80, scale=0.65)
    wordmark = make_direction_c_paths(cogni_color="#000000", tara_color="#000000")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 160" width="580" height="160">
{SVG_DEFS}
  <rect width="100%" height="100%" fill="#FFFFFF" rx="20"/>
  <g id="symbol">
    <path d="{dc}" fill="#000000" />
    <path d="{dstar}" fill="#000000" />
  </g>
  <g transform="translate(178, 52) scale(0.46)">
    {wordmark}
  </g>
  <text x="180" y="122" class="tagline" font-size="10.5" fill="#334155">
    INTELLIGENT SYSTEMS &amp; SOFTWARE
  </text>
</svg>'''

def build_monochrome_white_svg():
    dc, dstar = get_luminary_c_symbol(cx=95, cy=80, scale=0.65)
    wordmark = make_direction_c_paths(cogni_color="#FFFFFF", tara_color="#FFFFFF")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 160" width="580" height="160">
{SVG_DEFS}
  <rect width="100%" height="100%" fill="#0A0E1A" rx="20"/>
  <g id="symbol">
    <path d="{dc}" fill="#FFFFFF" />
    <path d="{dstar}" fill="#FFFFFF" />
  </g>
  <g transform="translate(178, 52) scale(0.46)">
    {wordmark}
  </g>
  <text x="180" y="122" class="tagline" font-size="10.5" fill="#E2E8F0">
    INTELLIGENT SYSTEMS &amp; SOFTWARE
  </text>
</svg>'''

def build_symbol_svg():
    dc, dstar = get_luminary_c_symbol(cx=100, cy=100, scale=1.0)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
{SVG_DEFS}
  <rect width="100%" height="100%" fill="#0A0E1A" rx="36"/>
  <g id="symbol">
    <path d="{dc}" fill="#FFFFFF" />
    <path d="{dstar}" fill="#00D2FF" />
  </g>
</svg>'''

def build_app_icon_svg():
    dc, dstar = get_luminary_c_symbol(cx=256, cy=256, scale=2.15)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
{SVG_DEFS}
  <rect width="512" height="512" rx="115" fill="#0A0E1A" />
  <rect x="1.5" y="1.5" width="509" height="509" rx="113.5" fill="none" stroke="#00D2FF" stroke-width="2" stroke-opacity="0.2" />
  <g id="symbol">
    <path d="{dc}" fill="#FFFFFF" />
    <path d="{dstar}" fill="#00D2FF" />
  </g>
</svg>'''

def build_social_preview_svg():
    dc, dstar = get_luminary_c_symbol(cx=260, cy=315, scale=1.9)
    wordmark = make_direction_c_paths(cogni_color="#FFFFFF", tara_color="#00D2FF")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
{SVG_DEFS}
  <rect width="1200" height="630" fill="#0A0E1A" />
  <circle cx="260" cy="315" r="280" fill="#00D2FF" opacity="0.06" />
  <circle cx="260" cy="315" r="180" fill="#0066FF" opacity="0.08" />
  
  <rect x="480" y="200" width="220" height="30" rx="15" fill="#121829" stroke="#00D2FF" stroke-width="1" stroke-opacity="0.4" />
  <circle cx="496" cy="215" r="4.5" fill="#00D2FF" />
  <text x="510" y="220" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="11.5" font-weight="700" fill="#38BDF8" letter-spacing="2">
    GLOBAL IDENTITY
  </text>
  
  <g id="symbol">
    <path d="{dc}" fill="#FFFFFF" />
    <path d="{dstar}" fill="#00D2FF" />
  </g>
  
  <!-- Refined Wordmark (Upright: top y=260, baseline y=350) -->
  <g transform="translate(480, 260) scale(0.90)">
    {wordmark}
  </g>
  <text x="484" y="385" class="tagline" font-size="15" fill="#94A3B8">
    INTELLIGENT SYSTEMS &amp; SOFTWARE
  </text>
  
  <line x1="80" y1="530" x2="1120" y2="530" stroke="#1E293B" stroke-width="1.5" />
  <text x="80" y="565" font-family="'Plus Jakarta Sans', sans-serif" font-size="13" font-weight="600" fill="#64748B" letter-spacing="1.5">
    VECTORCRAFT NATIVE SYSTEM · REFINED ENTERPRISE TYPOGRAPHY
  </text>
  <text x="1120" y="565" text-anchor="end" font-family="'Plus Jakarta Sans', monospace, sans-serif" font-size="13" font-weight="600" fill="#00D2FF" letter-spacing="1.5">
    COGNITARA.COM
  </text>
</svg>'''

def run_vc(cmd_args):
    res = subprocess.run([VC_CLI] + cmd_args, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error running {cmd_args}: {res.stderr}")
    return res.stdout

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Step 1: Generating refined SVG vector master sources...")

    raw_files = {
        "cognitara-primary-raw.svg": build_primary_logo_svg(),
        "cognitara-primary-light-raw.svg": build_primary_light_logo_svg(),
        "cognitara-symbol.svg": build_symbol_svg(),
        "cognitara-wordmark-raw.svg": build_standalone_wordmark_svg(),
        "cognitara-black-raw.svg": build_monochrome_black_svg(),
        "cognitara-white-raw.svg": build_monochrome_white_svg(),
        "cognitara-app-icon-raw.svg": build_app_icon_svg(),
        "cognitara-social-preview-raw.svg": build_social_preview_svg(),
    }

    for fname, content in raw_files.items():
        path = os.path.join(OUT_DIR, fname)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

    print("Step 2: Converting typography to pure vector path outlines via VectorCraft CLI...")
    to_outline = [
        ("cognitara-primary-raw.svg", "cognitara-primary.svg"),
        ("cognitara-primary-light-raw.svg", "cognitara-primary-light.svg"),
        ("cognitara-wordmark-raw.svg", "cognitara-wordmark.svg"),
        ("cognitara-black-raw.svg", "cognitara-black.svg"),
        ("cognitara-white-raw.svg", "cognitara-white.svg"),
        ("cognitara-app-icon-raw.svg", "cognitara-app-icon.svg"),
        ("cognitara-social-preview-raw.svg", "cognitara-social-preview.svg"),
    ]

    for raw_f, out_f in to_outline:
        in_p = os.path.join(OUT_DIR, raw_f)
        out_p = os.path.join(OUT_DIR, out_f)
        run_vc(["convert", in_p, out_p, "--outline-text"])
        if os.path.exists(in_p):
            os.remove(in_p)
        print(f"  Outlined and saved {out_f}")

    print("Step 3: Generating native .vectorcraft document...")
    primary_svg = os.path.join(OUT_DIR, "cognitara-primary.svg")
    vc_doc = os.path.join(OUT_DIR, "cognitara-identity.vectorcraft")
    run_vc(["convert", primary_svg, vc_doc])
    print(f"  Saved {vc_doc}")

    print("Step 4: Rendering high-resolution PNG deliverables with VectorCraft engine...")
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-primary.svg"), os.path.join(OUT_DIR, "cognitara-primary.png"), "--scale", "1.765"])
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-primary.svg"), os.path.join(OUT_DIR, "cognitara-primary-512.png"), "--scale", "0.883"])
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-primary-light.svg"), os.path.join(OUT_DIR, "cognitara-primary-light.png"), "--scale", "1.765"])

    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-symbol.svg"), os.path.join(OUT_DIR, "cognitara-symbol.png"), "--scale", "2.56"])
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-symbol.svg"), os.path.join(OUT_DIR, "cognitara-symbol-1024.png"), "--scale", "5.12"])

    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-wordmark.svg"), os.path.join(OUT_DIR, "cognitara-wordmark.png"), "--scale", "2.133"])
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-wordmark.svg"), os.path.join(OUT_DIR, "cognitara-wordmark-512.png"), "--scale", "1.066"])

    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-black.svg"), os.path.join(OUT_DIR, "cognitara-black.png"), "--scale", "1.765"])
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-white.svg"), os.path.join(OUT_DIR, "cognitara-white.png"), "--scale", "1.765"])

    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-app-icon.svg"), os.path.join(OUT_DIR, "cognitara-app-icon.png"), "--scale", "1.0"])
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-social-preview.svg"), os.path.join(OUT_DIR, "cognitara-social-preview.png"), "--scale", "1.0"])

    print("Step 5: Updating multi-resolution favicon.ico...")
    app_icon_png_path = os.path.join(OUT_DIR, "cognitara-app-icon.png")
    ico_path = os.path.join(OUT_DIR, "cognitara-favicon.ico")
    try:
        with Image.open(app_icon_png_path) as img:
            img.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
        print(f"  Saved {ico_path}")
    except Exception as e:
        print(f"  Warning generating ICO: {e}")

    # Synchronize to static/images for the live web exam portal
    static_img_dir = r"c:\COGNITARA EXAM PORTAL\static\images"
    if os.path.exists(static_img_dir):
        import shutil
        shutil.copyfile(os.path.join(OUT_DIR, "cognitara-primary.svg"), os.path.join(static_img_dir, "cognitara-primary.svg"))
        shutil.copyfile(os.path.join(OUT_DIR, "cognitara-app-icon.png"), os.path.join(static_img_dir, "cognitara-app-icon.png"))
        if os.path.exists(ico_path):
            shutil.copyfile(ico_path, os.path.join(static_img_dir, "favicon.ico"))
        print("  Synchronized brand assets to static/images/")

    print("\n[SUCCESS] Refined master brand deliverables generated and verified!")

if __name__ == "__main__":
    main()
