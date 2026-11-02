"""
export_individual_direction_studies.py
Exports individual horizontal logo files for Direction A, Direction B, and Direction C
in 100% upright native SVG coordinates.
"""

import os
import subprocess
from explore_wordmark_redesign import (
    get_luminary_c_symbol,
    make_direction_a_paths,
    make_direction_b_paths,
    make_direction_c_paths
)

STUDIES_DIR = r"c:\COGNITARA EXAM PORTAL\CogniTara-Brand-Identity\studies"
VC_CLI = r"C:\Program Files\VectorCraft\vectorcraft-cli.exe"

SVG_DEFS = '''<defs>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700&amp;display=swap');
    .tagline { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; font-weight: 600; letter-spacing: 3.5px; fill: #94A3B8; font-size: 10.5px; }
  </style>
</defs>'''

def build_dir_logo_svg(wordmark_paths):
    dc, dstar = get_luminary_c_symbol(cx=95, cy=80, scale=0.65)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 160" width="580" height="160">
{SVG_DEFS}
  <rect width="100%" height="100%" fill="#0A0E1A" rx="20"/>
  <g id="symbol">
    <path d="{dc}" fill="#FFFFFF"/>
    <path d="{dstar}" fill="#00D2FF"/>
  </g>
  <g transform="translate(178, 52) scale(0.46)">
    {wordmark_paths}
  </g>
  <text x="180" y="122" class="tagline">INTELLIGENT SYSTEMS &amp; SOFTWARE</text>
</svg>'''

def main():
    os.makedirs(STUDIES_DIR, exist_ok=True)
    
    dirs = [
        ("direction_a_refined_futuristic", make_direction_a_paths("#FFFFFF", "#00D2FF")),
        ("direction_b_premium_geometric", make_direction_b_paths("#FFFFFF", "#00D2FF")),
        ("direction_c_custom_technological", make_direction_c_paths("#FFFFFF", "#00D2FF"))
    ]
    
    for name, wm in dirs:
        svg_p = os.path.join(STUDIES_DIR, f"{name}.svg")
        png_p = os.path.join(STUDIES_DIR, f"{name}.png")
        vc_p = os.path.join(STUDIES_DIR, f"{name}.vectorcraft")
        
        with open(svg_p, "w", encoding="utf-8") as f:
            f.write(build_dir_logo_svg(wm))
            
        if os.path.exists(VC_CLI):
            subprocess.run([VC_CLI, "convert", svg_p, png_p, "--scale", "1.765", "--outline-text"], capture_output=True)
            subprocess.run([VC_CLI, "convert", svg_p, vc_p, "--outline-text"], capture_output=True)
            print(f"Generated and converted {name}")

if __name__ == "__main__":
    main()
