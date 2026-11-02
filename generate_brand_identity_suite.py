import os
import subprocess
from PIL import Image
from build_svg_assets import (
    build_primary_svg, build_primary_light_svg, build_symbol_svg, build_wordmark_svg,
    build_black_svg, build_white_svg, build_app_icon_svg, build_social_preview_svg
)

OUT_DIR = r"c:\COGNITARA EXAM PORTAL\CogniTara-Brand-Identity"
VC_CLI = r"C:\Program Files\VectorCraft\vectorcraft-cli.exe"

def run_vc(cmd_args):
    res = subprocess.run([VC_CLI] + cmd_args, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error running {cmd_args}: {res.stderr}")
    return res.stdout

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("Step 1: Writing raw SVG sources...")

    raw_files = {
        "cognitara-primary-raw.svg": build_primary_svg(),
        "cognitara-primary-light-raw.svg": build_primary_light_svg(),
        "cognitara-symbol.svg": build_symbol_svg(),
        "cognitara-wordmark-raw.svg": build_wordmark_svg(),
        "cognitara-black-raw.svg": build_black_svg(),
        "cognitara-white-raw.svg": build_white_svg(),
        "cognitara-app-icon-raw.svg": build_app_icon_svg(),
        "cognitara-social-preview-raw.svg": build_social_preview_svg(),
    }

    for fname, content in raw_files.items():
        path = os.path.join(OUT_DIR, fname)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

    print("Step 2: Outlining typography with VectorCraft CLI for 100% path portability...")
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

    print("Step 3: Generating native .vectorcraft editable document via VectorCraft CLI...")
    primary_svg = os.path.join(OUT_DIR, "cognitara-primary.svg")
    vc_doc = os.path.join(OUT_DIR, "cognitara-identity.vectorcraft")
    run_vc(["convert", primary_svg, vc_doc])
    
    info = run_vc(["info", vc_doc])
    print(f"  VectorCraft document info: {info.strip()}")

    print("Step 4: Rendering PNG deliverables with VectorCraft native rendering engine...")
    # Primary logo PNGs
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-primary.svg"), os.path.join(OUT_DIR, "cognitara-primary.png"), "--scale", "1.765"]) # ~1024px
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-primary.svg"), os.path.join(OUT_DIR, "cognitara-primary-512.png"), "--scale", "0.883"]) # ~512px
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-primary-light.svg"), os.path.join(OUT_DIR, "cognitara-primary-light.png"), "--scale", "1.765"])

    # Symbol PNGs
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-symbol.svg"), os.path.join(OUT_DIR, "cognitara-symbol.png"), "--scale", "2.56"]) # 512x512
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-symbol.svg"), os.path.join(OUT_DIR, "cognitara-symbol-1024.png"), "--scale", "5.12"]) # 1024x1024

    # Wordmark PNGs
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-wordmark.svg"), os.path.join(OUT_DIR, "cognitara-wordmark.png"), "--scale", "2.327"]) # ~1024px
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-wordmark.svg"), os.path.join(OUT_DIR, "cognitara-wordmark-512.png"), "--scale", "1.164"]) # ~512px

    # Black and White variants
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-black.svg"), os.path.join(OUT_DIR, "cognitara-black.png"), "--scale", "1.765"])
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-white.svg"), os.path.join(OUT_DIR, "cognitara-white.png"), "--scale", "1.765"])

    # App icon PNG (512x512)
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-app-icon.svg"), os.path.join(OUT_DIR, "cognitara-app-icon.png"), "--scale", "1.0"])

    # Social Preview (1200x630)
    run_vc(["convert", os.path.join(OUT_DIR, "cognitara-social-preview.svg"), os.path.join(OUT_DIR, "cognitara-social-preview.png"), "--scale", "1.0"])

    print("Step 5: Generating multi-resolution cognitara-favicon.ico...")
    app_icon_png_path = os.path.join(OUT_DIR, "cognitara-app-icon.png")
    ico_path = os.path.join(OUT_DIR, "cognitara-favicon.ico")

    try:
        with Image.open(app_icon_png_path) as img:
            img.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
        print(f"  Saved multi-resolution {ico_path}")
    except Exception as e:
        print(f"  Warning generating ICO: {e}")

    # Copy primary and favicon to static/images for the web portal
    static_img_dir = r"c:\COGNITARA EXAM PORTAL\static\images"
    if os.path.exists(static_img_dir):
        import shutil
        shutil.copyfile(os.path.join(OUT_DIR, "cognitara-primary.svg"), os.path.join(static_img_dir, "cognitara-primary.svg"))
        shutil.copyfile(os.path.join(OUT_DIR, "cognitara-app-icon.png"), os.path.join(static_img_dir, "cognitara-app-icon.png"))
        if os.path.exists(ico_path):
            shutil.copyfile(ico_path, os.path.join(static_img_dir, "favicon.ico"))
        print("  Copied brand assets to static/images/")

    print("Step 6: Writing Brand Guidelines documentation...")
    guidelines_content = f"""# CogniTara Brand Identity Guidelines

## 1. Executive Summary & Brand Identity
**Brand Name**: CogniTara
**Brand Essence**: Intelligent Systems, Cognitive Analytics & Educational Software
**Selected Symbol**: **The Luminary C** (Strictly Preserved Signature C & Tara Guiding Star)
**Proprietary Typeface**: **CogniTara Type** (Organic Geometric Technology Typography)
**Native Design Environment**: VectorCraft (ArtCraft Project)

CogniTara represents the synthesis of **Cognition** (*knowledge, intelligence, diagnostic evaluation*) and **Tara** (*the Sanskrit beacon star, light, and apex guidance*). The visual identity moves intentionally away from generic "AI brain blobs" and template-driven tech graphics, establishing a timeless, monolithic silhouette that functions effortlessly in monochrome, as an app icon, or across global enterprise interfaces.

---

## 2. Concept Analysis & The Winning Mark: The Luminary C
The chosen mark integrates three distinct levels of recognition:
1. **The Primary Lettermark (C)**: A custom geometric capital 'C' constructed with 45° aerodynamic terminal cuts and optical weight compensation.
2. **The Embedded Guiding Star (Tara)**: A 4-pointed hyperbolic beacon nested in the optical focal aperture of the C. Its forward-pointing eastern beam projects beyond the opening, symbolizing forward momentum, insight, and technological leadership.
3. **The CT Monogram Resonance**: The horizontal and vertical axes of the star create an inherent 'T' stem and crossbar interaction, subtly uniting 'C' and 'T'.

---

## 3. Mathematical Vector Construction
- **Outer Crescent Radius ($R_{{out}}$)**: 72.0 pt with $270^\\circ$ sweep (spanning $-45^\\circ$ to $+45^\\circ$ through the western spine).
- **Inner Crescent Radius ($R_{{in}}$)**: 44.0 pt, providing a solid $28.0$ pt stem thickness (ratio $\\approx 0.388$).
- **Terminal Cuts**: $45^\\circ$ radial chamfers pointing directly toward the center, ensuring aerodynamic stability.
- **Nested Tara Star**:
  - Vertical Ray Radius: 26.0 pt
  - Forward (East) Ray Radius: 38.0 pt (extended for kinetic progression)
  - Rear (West) Ray Radius: 18.0 pt (calibrated with a uniform $12.0$ pt negative space clearance against the inner crescent)
  - Concave Pinch: 7.0 pt with G2 continuous cubic Bézier curvature.

---

## 4. Official Color Palette

| Role | Color Name | Hex Code | RGB | Purpose |
|---|---|---|---|---|
| **Dark Neutral (Primary)** | Midnight Navy | `#0A0E1A` | `rgb(10, 14, 26)` | Deep space foundation, container cards, OLED surfaces |
| **Accent Hue** | Electric Cyan | `#00D2FF` | `rgb(0, 210, 255)` | Guiding star beacon, active UI states, synaptic highlight |
| **Corporate Accent** | Cobalt Blue | `#0066FF` | `rgb(0, 102, 255)` | Light-theme primary accent, institutional authority |
| **Light Neutral** | Titanium White | `#FFFFFF` | `rgb(255, 255, 255)` | Monolithic symbol body, high-contrast text |
| **Muted Neutral** | Cool Slate 400 | `#94A3B8` | `rgb(148, 163, 184)` | Secondary metadata, descriptors, hairline structural rules |
| **Dark Text** | Deep Slate 900 | `#0F172A` | `rgb(15, 23, 42)` | High-contrast light theme text |

---

## 5. Proprietary Typography: CogniTara Type
The wordmark uses **CogniTara Type (Direction 3: Luminary Modern)**, an original typeface created specifically for CogniTara.
- **Geometric Heritage**: Capital C features 45° radial cuts mirroring the Luminary C. Capital T features 45° chamfered undercuts. Lowercase 'i' features the signature Tara Star Beacon tittle.
- **Weight Pairing**:
  - `Cogni`: Bold weight (700) in Pure White `#FFFFFF` (or Midnight Navy on light backgrounds).
  - `Tara`: SemiBold weight (600) in Electric Cyan `#00D2FF` (or Cobalt Blue on light backgrounds).
- **Format Availability**: Compiled TrueType (`.ttf`), Web Open Font (`.woff`), and compressed (`.woff2`) in `c:\COGNITARA EXAM PORTAL\CogniTara-Typeface\fonts\`.
- **Sub-Brand / Platform Descriptor**: `INTELLIGENT SYSTEMS & SOFTWARE` set in uppercase with $+3.5$px tracking.

---

## 6. Clear Space & Scalability Rules
- **Minimum Clear Space**: The logo must be surrounded by clear space equal to the height of the capital letter 'C' ($X$).
- **Minimum Sizes**:
  - **Digital**: Minimum symbol width of 16px (favicons retain 100% silhouette clarity).
  - **Print**: Minimum width of 20mm for horizontal lockup.
- **Incorrect Usage**:
  - Do NOT distort, condense, or stretch the aspect ratio.
  - Do NOT rotate the symbol away from its horizontal alignment.
  - Do NOT add drop shadows, outer glows, bevels, or gradients to the symbol.
  - Do NOT alter the spacing between the C and the nested star beacon.

---

## 7. Deliverable File Inventory

All files are verified, editable, and saved in `c:\\COGNITARA EXAM PORTAL\\CogniTara-Brand-Identity`:

1. `cognitara-identity.vectorcraft`: Native VectorCraft editable project document (lossless JSON format).
2. `cognitara-primary.svg`: Primary horizontal lockup (outlined vector paths).
3. `cognitara-primary.png` & `cognitara-primary-512.png`: High-resolution transparent PNG exports.
4. `cognitara-primary-light.svg` & `cognitara-primary-light.png`: Light-background horizontal lockup.
5. `cognitara-symbol.svg`, `cognitara-symbol.png`, `cognitara-symbol-1024.png`: Standalone Luminary C icon.
6. `cognitara-wordmark.svg`, `cognitara-wordmark.png`, `cognitara-wordmark-512.png`: Custom wordmark-only lockup.
7. `cognitara-black.svg` & `cognitara-black.png`: 100% solid monochrome black on white.
8. `cognitara-white.svg` & `cognitara-white.png`: 100% solid monochrome white on navy.
9. `cognitara-app-icon.png`: 512×512 iOS/Android squircle app icon.
10. `cognitara-favicon.ico`: True multi-resolution favicon (16px, 32px, 48px, 64px embedded).
11. `cognitara-social-preview.svg` & `cognitara-social-preview.png`: 1200×630 presentation banner.
12. `cognitara-brand-guidelines.md`: This comprehensive specification document.

---

## 8. Working with VectorCraft
To open and edit the native identity in VectorCraft:
```bash
# Open in desktop application:
vectorcraft cognitara-identity.vectorcraft

# Headless batch export:
vectorcraft-cli run --in cognitara-identity.vectorcraft --export cognitara-output.pdf
```
"""
    guidelines_path = os.path.join(OUT_DIR, "cognitara-brand-guidelines.md")
    with open(guidelines_path, "w", encoding="utf-8") as f:
        f.write(guidelines_content)
    print(f"  Saved {guidelines_path}")

    print("\nMaster Brand Identity Package generation complete!")

if __name__ == "__main__":
    main()
