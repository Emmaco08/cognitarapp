"""
prepare_motion_assets.py
Extracts and rasterizes isolated, high-resolution vector assets for EffectCraft:
- Luminary C Crescent (isolated white)
- Tara Star Beacon (isolated electric cyan)
- Wordmark 'Cogni' (isolated titanium white)
- Wordmark 'Tara' (isolated electric cyan)
- Wordmark Micro-Spark Beacon Tittle (isolated cyan)
- Tagline (isolated slate 400)
- Full Symbol & Full Brand Lockup
All exported as transparent SVG and 2048px/high-res PNGs via vectorcraft-cli.
"""

import os
import subprocess
import math
from explore_wordmark_redesign import get_luminary_c_symbol, arc_bezier, pt
from test_right_side_up import get_c_paths_upright

ASSETS_DIR = r"c:\COGNITARA EXAM PORTAL\CogniTara-Motion-Graphics\assets"
VC_CLI = r"C:\Program Files\VectorCraft\vectorcraft-cli.exe"

os.makedirs(ASSETS_DIR, exist_ok=True)

def export_svg_and_png(filename_base, svg_content):
    svg_path = os.path.join(ASSETS_DIR, f"{filename_base}.svg")
    png_path = os.path.join(ASSETS_DIR, f"{filename_base}.png")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(svg_content)
    # Convert with vectorcraft-cli
    cmd = [VC_CLI, "convert", svg_path, png_path]
    subprocess.run(cmd, check=True)
    print(f"Exported {filename_base}.svg and {filename_base}.png")

def main():
    # 1. Isolated Luminary C Crescent (Centered in 1000x1000)
    dc, dstar = get_luminary_c_symbol(cx=500, cy=500, scale=4.8)
    svg_c = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
      <path d="{dc}" fill="#FFFFFF" />
    </svg>'''
    export_svg_and_png("asset_c_crescent", svg_c)

    # 2. Isolated Tara Star Beacon (Centered in 1000x1000)
    # Star center is at scx = cx + 8*scale = 500 + 8*4.8 = 538.4
    # To center it perfectly at (500, 500):
    dc_dummy, dstar_centered = get_luminary_c_symbol(cx=500 - 8.0*4.8, cy=500, scale=4.8)
    svg_star = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
      <path d="{dstar_centered}" fill="#00D2FF" />
    </svg>'''
    export_svg_and_png("asset_star_beacon", svg_star)

    # 3. Full Luminary C Symbol (Centered in 1000x1000)
    svg_sym = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
      <path d="{dc}" fill="#FFFFFF" />
      <path d="{dstar}" fill="#00D2FF" />
    </svg>'''
    export_svg_and_png("asset_symbol_full", svg_sym)

    # 4. Isolated 'Cogni' (Width 360pt, height 140pt -> scale in 1200x500)
    d_C, d_o, d_g, d_n, d_i_stem, d_i_star, d_T, d_a, d_r = get_c_paths_upright()
    svg_cogni = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400" width="1000" height="400">
      <g fill="#FFFFFF" transform="translate(60, 100) scale(2.6)">
        <path d="{d_C}" transform="translate(0, 0)"/>
        <path d="{d_o}" transform="translate(90, 0)"/>
        <path d="{d_g}" transform="translate(166, 0)"/>
        <path d="{d_n}" transform="translate(236, 0)"/>
        <path d="{d_i_stem}" transform="translate(308, 0)"/>
      </g>
    </svg>'''
    export_svg_and_png("asset_wordmark_cogni", svg_cogni)

    # 5. Isolated 'Tara'
    svg_tara = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 400" width="1000" height="400">
      <g fill="#00D2FF" transform="translate(60, 100) scale(2.6)">
        <path d="{d_T}" transform="translate(0, 0)"/>
        <path d="{d_a}" transform="translate(78, 0)"/>
        <path d="{d_r}" transform="translate(150, 0)"/>
        <path d="{d_a}" transform="translate(210, 0)"/>
      </g>
    </svg>'''
    export_svg_and_png("asset_wordmark_tara", svg_tara)

    # 6. Isolated Micro-Spark Beacon Tittle (Centered in 500x500)
    svg_tittle = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
      <g fill="#00D2FF" transform="translate(250, 250) scale(16.0)">
        <path d="{d_i_star}" transform="translate(-4.8, -14.0)"/>
      </g>
    </svg>'''
    export_svg_and_png("asset_beacon_tittle", svg_tittle)

    # 7. Isolated Tagline 'INTELLIGENT SYSTEMS & SOFTWARE'
    svg_tag = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 150" width="1200" height="150">
      <defs>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600&amp;display=swap');
          .tagline { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 600; letter-spacing: 7px; fill: #94A3B8; font-size: 26px; }
        </style>
      </defs>
      <text x="600" y="85" text-anchor="middle" class="tagline">INTELLIGENT SYSTEMS &amp; SOFTWARE</text>
    </svg>'''
    export_svg_and_png("asset_tagline", svg_tag)

    # 8. Complete Wordmark (Cogni + Tara + Tittle together)
    svg_wordmark_full = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 450" width="1800" height="450">
      <g transform="translate(80, 100) scale(2.6)">
        <g fill="#FFFFFF">
          <path d="{d_C}" transform="translate(0, 0)"/>
          <path d="{d_o}" transform="translate(90, 0)"/>
          <path d="{d_g}" transform="translate(166, 0)"/>
          <path d="{d_n}" transform="translate(236, 0)"/>
          <path d="{d_i_stem}" transform="translate(308, 0)"/>
        </g>
        <g fill="#00D2FF">
          <path d="{d_i_star}" transform="translate(308, 0)"/>
          <path d="{d_T}" transform="translate(336, 0)"/>
          <path d="{d_a}" transform="translate(414, 0)"/>
          <path d="{d_r}" transform="translate(486, 0)"/>
          <path d="{d_a}" transform="translate(546, 0)"/>
        </g>
      </g>
    </svg>'''
    export_svg_and_png("asset_wordmark_full", svg_wordmark_full)

    # 9. Full Master Horizontal Lockup (1920x1080 canvas, centered, transparent)
    dc_lockup, dstar_lockup = get_luminary_c_symbol(cx=560, cy=540, scale=1.75)
    svg_master_lockup = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
      <defs>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600&amp;display=swap');
          .tagline {{ font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 600; letter-spacing: 9.5px; fill: #94A3B8; font-size: 28px; }}
        </style>
      </defs>
      <!-- Symbol -->
      <g id="symbol">
        <path d="{dc_lockup}" fill="#FFFFFF" />
        <path d="{dstar_lockup}" fill="#00D2FF" />
      </g>
      <!-- Wordmark -->
      <g transform="translate(780, 465) scale(1.25)">
        <g fill="#FFFFFF">
          <path d="{d_C}" transform="translate(0, 0)"/>
          <path d="{d_o}" transform="translate(90, 0)"/>
          <path d="{d_g}" transform="translate(166, 0)"/>
          <path d="{d_n}" transform="translate(236, 0)"/>
          <path d="{d_i_stem}" transform="translate(308, 0)"/>
        </g>
        <g fill="#00D2FF">
          <path d="{d_i_star}" transform="translate(308, 0)"/>
          <path d="{d_T}" transform="translate(336, 0)"/>
          <path d="{d_a}" transform="translate(414, 0)"/>
          <path d="{d_r}" transform="translate(486, 0)"/>
          <path d="{d_a}" transform="translate(546, 0)"/>
        </g>
      </g>
      <text x="785" y="655" class="tagline">INTELLIGENT SYSTEMS &amp; SOFTWARE</text>
    </svg>'''
    export_svg_and_png("asset_full_master_lockup", svg_master_lockup)

    print("All motion assets prepared successfully!")

if __name__ == "__main__":
    main()
