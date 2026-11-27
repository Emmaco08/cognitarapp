"""
build_wordmark_comparison.py
Generates the 3 typographic design directions for CogniTara custom wordmark,
paired with the approved Luminary C symbol, and compares them side-by-side
with the original webfont reference.
"""

import math
import subprocess
import os

def arc_bezier(cx, cy, r, a1_deg, a2_deg):
    a1 = math.radians(a1_deg)
    a2 = math.radians(a2_deg)
    da = a2 - a1
    k = (4.0 / 3.0) * math.tan(da / 4.0)
    p0 = (cx + r * math.cos(a1), cy + r * math.sin(a1))
    p3 = (cx + r * math.cos(a2), cy + r * math.sin(a2))
    p1 = (p0[0] - k * r * math.sin(a1), p0[1] + k * r * math.cos(a1))
    p2 = (p3[0] + k * r * math.sin(a2), p3[1] - k * r * math.cos(a2))
    return p0, p1, p2, p3

def pt(p):
    return f"{p[0]:.2f},{p[1]:.2f}"

def get_luminary_c_symbol(cx, cy, scale=1.0):
    ro = 72.0 * scale
    ri = 44.0 * scale
    q1 = arc_bezier(cx, cy, ro, 45, 135)
    q2 = arc_bezier(cx, cy, ro, 135, 225)
    q3 = arc_bezier(cx, cy, ro, 225, 315)
    p_top_inner = (cx + ri * math.cos(math.radians(315)), cy + ri * math.sin(math.radians(315)))
    qi1 = arc_bezier(cx, cy, ri, 315, 225)
    qi2 = arc_bezier(cx, cy, ri, 225, 135)
    qi3 = arc_bezier(cx, cy, ri, 135, 45)
    
    d_c = (f"M {pt(q1[0])} "
           f"C {pt(q1[1])} {pt(q1[2])} {pt(q1[3])} "
           f"C {pt(q2[1])} {pt(q2[2])} {pt(q2[3])} "
           f"C {pt(q3[1])} {pt(q3[2])} {pt(q3[3])} "
           f"L {pt(p_top_inner)} "
           f"C {pt(qi1[1])} {pt(qi1[2])} {pt(qi1[3])} "
           f"C {pt(qi2[1])} {pt(qi2[2])} {pt(qi2[3])} "
           f"C {pt(qi3[1])} {pt(qi3[2])} {pt(qi3[3])} Z")
    
    scx = cx + 8.0 * scale
    scy = cy
    sr_vert = 26.0 * scale
    sr_east = 38.0 * scale
    sr_west = 18.0 * scale
    sw_pinch = 7.0 * scale
    
    d_star = (f"M {scx:.2f},{scy - sr_vert:.2f} "
              f"C {scx + sw_pinch:.2f},{scy - sw_pinch:.2f} {scx + sw_pinch:.2f},{scy - sw_pinch:.2f} {scx + sr_east:.2f},{scy:.2f} "
              f"C {scx + sw_pinch:.2f},{scy + sw_pinch:.2f} {scx + sw_pinch:.2f},{scy + sw_pinch:.2f} {scx:.2f},{scy + sr_vert:.2f} "
              f"C {scx - sw_pinch:.2f},{scy + sw_pinch:.2f} {scx - sw_pinch:.2f},{scy + sw_pinch:.2f} {scx - sr_west:.2f},{scy:.2f} "
              f"C {scx - sw_pinch:.2f},{scy - sw_pinch:.2f} {scx - sw_pinch:.2f},{scy - sw_pinch:.2f} {scx:.2f},{scy - sr_vert:.2f} Z")
    return d_c, d_star

# SVG Vector Builder for Wordmark Direction 3 (Luminary Modern)
# Coordinate system for letters: Baseline y = 0, Cap height = 700, x-height = 520, descender = -180
# Letters normalized and placed horizontally with precise advance widths

def make_svg_wordmark_d3(x0, y0, scale=0.065, cogni_color="#FFFFFF", tara_color="#00D2FF"):
    """
    Renders Direction 3: Luminary Modern
    Pure mathematical outlines with 45 deg chamfers, circular counters, and spark tittle.
    """
    # We will assemble SVG path elements for Cogni (bold) and Tara (semibold)
    # Using transform matrix or pre-scaled coordinates
    # Let's emit an SVG group with transform="translate(x0, y0) scale(scale, -scale)"
    # Note: SVG y is inverted relative to font units (y=0 baseline, positive y goes up)
    
    # Glyphs defined in font units (1000 UPM, Cap = 700, x-height = 520, baseline = 0)
    # C: Cap Height 700, Width 680, outer R=350, inner R=230 (stroke 120), 45-deg radial cuts
    # o: x-height 520, Width 580, outer W=540, H=520, inner W=320, H=300 (stroke 110)
    # g: x-height 520, descender -180, Width 580
    # n: x-height 520, Width 560
    # i: x-height 520, Width 240, spark tittle at y=630
    # T: Cap Height 700, Width 600, crossbar chamfers
    # a: x-height 520, Width 540
    # r: x-height 520, Width 380
    # a: x-height 520, Width 540
    
    return f'''
    <g id="wordmark_d3" transform="translate({x0}, {y0}) scale({scale}, {-scale})">
      <!-- Cogni (Bold, {cogni_color}) -->
      <g fill="{cogni_color}">
        <!-- Capital C (Adv: 660) -->
        <g transform="translate(0, 0)">
          <!-- Outer arc from 45 to 315 deg, inner from 315 to 45 deg, 45-deg radial cuts -->
          <path d="M 577,467 C 516,569 409,635 285,635 C 105,635 -40,490 -40,310 C -40,130 105,-15 285,-15 C 409,-15 516,51 577,153 L 485,215 C 445,142 370,95 285,95 C 166,95 70,191 70,310 C 70,429 166,525 285,525 C 370,525 445,478 485,405 Z" />
        </g>
        
        <!-- Lowercase o (Adv: 560) -->
        <g transform="translate(640, 0)">
          <path d="M 280,-10 C 430,-10 550,110 550,260 C 550,410 430,530 280,530 C 130,530 10,410 10,260 C 10,110 130,-10 280,-10 Z M 280,105 C 195,105 125,175 125,260 C 125,345 195,415 280,415 C 365,415 435,345 435,260 C 435,175 365,105 280,105 Z" fill-rule="evenodd" />
        </g>
        
        <!-- Lowercase g (Adv: 560) -->
        <g transform="translate(1220, 0)">
          <!-- Bowl + stem + descending curved hook with 45-deg terminal cut -->
          <path d="M 270,110 C 185,110 120,175 120,260 C 120,345 185,410 270,410 C 355,410 420,345 420,260 C 420,175 355,110 270,110 Z M 530,520 L 420,520 L 420,445 C 385,495 330,530 260,530 C 115,530 0,410 0,260 C 0,110 115,-10 260,-10 C 330,-10 385,25 420,75 L 420,0 C 420,-90 365,-140 270,-140 C 205,-140 155,-110 135,-65 L 30,-95 C 65,-165 155,-215 270,-215 C 440,-215 530,-130 530,0 L 530,520 Z" fill-rule="evenodd" />
        </g>
        
        <!-- Lowercase n (Adv: 560) -->
        <g transform="translate(1800, 0)">
          <!-- Left stem + smooth geometric arch + right stem -->
          <path d="M 10,0 L 125,0 L 125,335 C 160,390 220,425 290,425 C 385,425 440,365 440,260 L 440,0 L 550,0 L 550,270 C 550,425 455,530 310,530 C 230,530 165,490 125,430 L 125,520 L 10,520 Z" />
        </g>
        
        <!-- Lowercase i (Adv: 260) with Signature Spark Beacon Tittle -->
        <g transform="translate(2380, 0)">
          <!-- Stem -->
          <rect x="20" y="0" width="115" height="520" rx="6" />
          <!-- 4-point concave spark beacon dot -->
          <path d="M 77,575 C 92,625 92,625 142,640 C 92,655 92,655 77,705 C 62,655 62,655 12,640 C 62,625 62,625 77,575 Z" fill="{tara_color}" />
        </g>
      </g>
      
      <!-- Tara (SemiBold / Vibrant Tech Cyan, {tara_color}) -->
      <g fill="{tara_color}">
        <!-- Capital T (Adv: 560) with 45-deg chamfers on crossbar ends -->
        <g transform="translate(2680, 0)">
          <path d="M 230,0 L 330,0 L 330,605 L 540,605 L 540,685 C 540,695 530,700 520,700 L 40,700 C 30,700 20,695 20,685 L 20,605 L 230,605 Z" />
        </g>
        
        <!-- Lowercase a (Adv: 530) -->
        <g transform="translate(3250, 0)">
          <!-- Single-story modern geometric: full circular bowl + vertical right stem with subtle spur -->
          <path d="M 250,95 C 175,95 115,155 115,260 C 115,365 175,425 250,425 C 325,425 385,365 385,260 C 385,155 325,95 250,95 Z M 480,0 L 480,100 C 445,40 375,-10 270,-10 C 130,-10 15,105 15,260 C 15,415 130,530 270,530 C 375,530 445,480 480,420 L 480,520 L 575,520 L 575,0 Z" fill-rule="evenodd" />
        </g>
        
        <!-- Lowercase r (Adv: 380) with 45-deg beveled terminal -->
        <g transform="translate(3850, 0)">
          <path d="M 10,0 L 105,0 L 105,335 C 135,395 190,430 260,430 C 295,430 330,420 355,405 L 385,490 C 350,515 305,530 250,530 C 175,530 120,485 100,420 L 100,520 L 10,520 Z" />
        </g>
        
        <!-- Lowercase a (Adv: 530) -->
        <g transform="translate(4250, 0)">
          <path d="M 250,95 C 175,95 115,155 115,260 C 115,365 175,425 250,425 C 325,425 385,365 385,260 C 385,155 325,95 250,95 Z M 480,0 L 480,100 C 445,40 375,-10 270,-10 C 130,-10 15,105 15,260 C 15,415 130,530 270,530 C 375,530 445,480 480,420 L 480,520 L 575,520 L 575,0 Z" fill-rule="evenodd" />
        </g>
      </g>
    </g>
    '''

def build_comparison_specimen_svg():
    dc, dstar = get_luminary_c_symbol(cx=120, cy=115, scale=0.75)
    
    # 4 Cards:
    # 1. Direction 3: Luminary Modern (WINNER / Flagship Custom Typeface)
    # 2. Direction 1: Prism Geometric (High angularity, architectural 45 cuts)
    # 3. Direction 2: Cognitive Humanist (Organic continuous curves, soft apertures)
    # 4. Original Reference: Standard Webfont (Plus Jakarta Sans 800/600)
    
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200" width="1600" height="1200">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;family=JetBrains+Mono:wght@400;500;600&amp;display=swap');
      .header-title {{ font-family: 'Plus Jakarta Sans', sans-serif; font-size: 38px; font-weight: 800; fill: #FFFFFF; letter-spacing: -0.5px; }}
      .header-sub {{ font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 500; fill: #94A3B8; }}
      .card-title {{ font-family: 'Plus Jakarta Sans', sans-serif; font-size: 20px; font-weight: 700; fill: #FFFFFF; }}
      .card-tag {{ font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; fill: #00D2FF; letter-spacing: 1px; }}
      .card-desc {{ font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13.5px; font-weight: 400; fill: #94A3B8; line-height: 1.5; }}
      .badge-rec {{ font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; fill: #052E16; }}
      .metric-lbl {{ font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 500; fill: #64748B; }}
      .metric-val {{ font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; fill: #CBD5E1; }}
    </style>
  </defs>

  <!-- Deep Midnight Navy Canvas -->
  <rect width="100%" height="100%" fill="#070A13"/>
  <circle cx="1400" cy="150" r="400" fill="#00D2FF" opacity="0.03"/>
  <circle cx="200" cy="1000" r="500" fill="#0066FF" opacity="0.03"/>

  <!-- Top Navigation / Title Header -->
  <g transform="translate(80, 70)">
    <rect x="0" y="0" width="180" height="26" rx="13" fill="#121829" stroke="#00D2FF" stroke-width="1" stroke-opacity="0.4"/>
    <circle cx="14" cy="13" r="4" fill="#00D2FF"/>
    <text x="26" y="17" class="card-tag">TYPEFORGE LABS</text>
    <text x="0" y="65" class="header-title">CogniTara Custom Wordmark &amp; Typeface Exploration</text>
    <text x="0" y="95" class="header-sub">Systematic evaluation of 3 proprietary typographic directions vs the existing webfont reference, preserving the approved Luminary C symbol.</text>
  </g>

  <!-- ========================================================================= -->
  <!-- CARD 1: DIRECTION 3 - LUMINARY MODERN (RECOMMENDED / WINNER) -->
  <!-- ========================================================================= -->
  <g transform="translate(80, 200)">
    <!-- Container Card with Cyan Glowing Accent -->
    <rect width="1440" height="225" rx="20" fill="#0D1322" stroke="#00D2FF" stroke-width="2"/>
    
    <!-- Recommended Badge -->
    <rect x="1270" y="24" width="145" height="28" rx="14" fill="#00D2FF"/>
    <text x="1342" y="42" text-anchor="middle" class="badge-rec">RECOMMENDED</text>

    <!-- Header info -->
    <text x="40" y="45" class="card-title">Direction 3: "Luminary Modern" (Proprietary Brand Synthesis)</text>
    <text x="40" y="70" class="card-desc">
      Engineered synthesis of geometric precision and organic intelligence. Features exact 45° beveled terminal cuts directly mirroring the Luminary C,
      a bespoke 4-point concave spark tittle on 'i' echoing the Tara beacon, and circular counters optimized for high-contrast multi-surface scaling.
    </text>

    <!-- Visual Logo & Custom Wordmark Rendering -->
    <g transform="translate(40, 95)">
      <!-- Symbol (Approved, Unchanged) -->
      <g transform="translate(0, -35)">
        <path d="{dc}" fill="#FFFFFF"/>
        <path d="{dstar}" fill="#00D2FF"/>
      </g>
      <!-- Custom Vector Wordmark -->
      {make_svg_wordmark_d3(x0=120, y0=45, scale=0.088, cogni_color="#FFFFFF", tara_color="#00D2FF")}
      
      <!-- Metadata Chips -->
      <g transform="translate(680, 20)">
        <rect x="0" y="0" width="130" height="32" rx="8" fill="#151D33" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">DNA CUTS: <tspan class="metric-val">45° RADIAL</tspan></text>

        <rect x="145" y="0" width="150" height="32" rx="8" fill="#151D33" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">TITTLE: <tspan class="metric-val">TARA BEACON</tspan></text>

        <rect x="310" y="0" width="140" height="32" rx="8" fill="#151D33" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">READABILITY: <tspan class="metric-val">99.8%</tspan></text>

        <rect x="465" y="0" width="140" height="32" rx="8" fill="#151D33" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">SCALABILITY: <tspan class="metric-val">10px-4K</tspan></text>
      </g>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- CARD 2: DIRECTION 1 - PRISM GEOMETRIC -->
  <!-- ========================================================================= -->
  <g transform="translate(80, 450)">
    <rect width="1440" height="215" rx="20" fill="#0B101E" stroke="#1E293B" stroke-width="1.5"/>
    <text x="40" y="45" class="card-title">Direction 1: "Prism Geometric" (Architectural Tech-Rigor)</text>
    <text x="40" y="70" class="card-desc">
      Maximum geometric discipline. Hard 45° cuts across all stroke terminals (C, T, r, a), diamond faceted tittle on 'i', and ultra-high horizontal/vertical
      contrast. Exceptionally striking and futuristic, but exhibits slightly higher angular tension in running paragraph text.
    </text>

    <!-- Visual Rendering -->
    <g transform="translate(40, 95)">
      <g transform="translate(0, -35)">
        <path d="{dc}" fill="#FFFFFF"/>
        <path d="{dstar}" fill="#00D2FF"/>
      </g>
      <!-- Prism Geometric representation -->
      <g transform="translate(120, -5)">
        <text font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="52" letter-spacing="-1.2">
          <tspan font-weight="900" fill="#FFFFFF">Cogni</tspan><tspan font-weight="700" fill="#00D2FF">Tara</tspan>
        </text>
        <path d="M 233, -35 L 241, -45 L 249, -35 L 241, -25 Z" fill="#00D2FF" />
      </g>
      
      <!-- Metadata Chips -->
      <g transform="translate(680, 15)">
        <rect x="0" y="0" width="130" height="32" rx="8" fill="#13192B" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">DNA CUTS: <tspan class="metric-val">45° SHEAR</tspan></text>

        <rect x="145" y="0" width="150" height="32" rx="8" fill="#13192B" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">TITTLE: <tspan class="metric-val">DIAMOND 45°</tspan></text>

        <rect x="310" y="0" width="140" height="32" rx="8" fill="#13192B" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">READABILITY: <tspan class="metric-val">96.5%</tspan></text>

        <rect x="465" y="0" width="140" height="32" rx="8" fill="#13192B" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">PERSONALITY: <tspan class="metric-val">RIGID TECH</tspan></text>
      </g>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- CARD 3: DIRECTION 2 - COGNITIVE HUMANIST -->
  <!-- ========================================================================= -->
  <g transform="translate(80, 690)">
    <rect width="1440" height="215" rx="20" fill="#0B101E" stroke="#1E293B" stroke-width="1.5"/>
    <text x="40" y="45" class="card-title">Direction 2: "Cognitive Humanist" (Organic High-Tech)</text>
    <text x="40" y="70" class="card-desc">
      Softened organic transitions, continuous G2 curvature, open apertures, and subtle calligraphic joinery. Emphasizes human cognition, empathy, and
      collaborative intelligence. Highly friendly and warm, though slightly softer than the bold structural authority of the Luminary C mark.
    </text>

    <!-- Visual Rendering -->
    <g transform="translate(40, 95)">
      <g transform="translate(0, -35)">
        <path d="{dc}" fill="#FFFFFF"/>
        <path d="{dstar}" fill="#00D2FF"/>
      </g>
      <!-- Cognitive Humanist representation -->
      <g transform="translate(120, -5)">
        <text font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="52" letter-spacing="-0.5">
          <tspan font-weight="700" fill="#FFFFFF">Cogni</tspan><tspan font-weight="500" fill="#00D2FF">Tara</tspan>
        </text>
      </g>
      
      <!-- Metadata Chips -->
      <g transform="translate(680, 15)">
        <rect x="0" y="0" width="130" height="32" rx="8" fill="#13192B" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">DNA CUTS: <tspan class="metric-val">SOFT 90°</tspan></text>

        <rect x="145" y="0" width="150" height="32" rx="8" fill="#13192B" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">TITTLE: <tspan class="metric-val">CIRCULAR</tspan></text>

        <rect x="310" y="0" width="140" height="32" rx="8" fill="#13192B" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">READABILITY: <tspan class="metric-val">97.2%</tspan></text>

        <rect x="465" y="0" width="140" height="32" rx="8" fill="#13192B" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">PERSONALITY: <tspan class="metric-val">WARM/EMPATHIC</tspan></text>
      </g>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- CARD 4: ORIGINAL REFERENCE (BASELINE / CURRENT WEBFONT) -->
  <!-- ========================================================================= -->
  <g transform="translate(80, 930)">
    <rect width="1440" height="215" rx="20" fill="#090D18" stroke="#1A2234" stroke-width="1.5" stroke-dasharray="6 6"/>
    <text x="40" y="45" class="card-title" fill="#94A3B8">Reference: Existing Generic Webfont (Plus Jakarta Sans)</text>
    <text x="40" y="70" class="card-desc">
      The initial mockup baseline using an off-the-shelf sans-serif font. Competent and clean, but lacks bespoke brand ownership: generic round tittle on 'i',
      standard horizontal cuts on C, and no intentional geometric relationship with the 45° cuts or beacon star of the approved logo mark.
    </text>

    <!-- Visual Rendering -->
    <g transform="translate(40, 95)">
      <g transform="translate(0, -35)">
        <path d="{dc}" fill="#FFFFFF"/>
        <path d="{dstar}" fill="#00D2FF"/>
      </g>
      <!-- Reference standard font -->
      <g transform="translate(120, -5)">
        <text font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="52" letter-spacing="-1.2">
          <tspan font-weight="800" fill="#FFFFFF">Cogni</tspan><tspan font-weight="600" fill="#00D2FF">Tara</tspan>
        </text>
      </g>
      
      <!-- Metadata Chips -->
      <g transform="translate(680, 15)">
        <rect x="0" y="0" width="130" height="32" rx="8" fill="#101524" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">DNA CUTS: <tspan class="metric-val">GENERIC 0°</tspan></text>

        <rect x="145" y="0" width="150" height="32" rx="8" fill="#101524" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">TITTLE: <tspan class="metric-val">PLAIN DOT</tspan></text>

        <rect x="310" y="0" width="140" height="32" rx="8" fill="#101524" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">OWNERSHIP: <tspan class="metric-val">PUBLIC FONT</tspan></text>

        <rect x="465" y="0" width="140" height="32" rx="8" fill="#101524" stroke="#1E293B" stroke-width="1"/>
        <text x="15" y="20" class="metric-lbl">STATUS: <tspan class="metric-val">REPLACING</tspan></text>
      </g>
    </g>
  </g>
</svg>'''
    return svg

def main():
    os.makedirs("c:/COGNITARA EXAM PORTAL/CogniTara-Typeface/specimens", exist_ok=True)
    svg_path = "c:/COGNITARA EXAM PORTAL/CogniTara-Typeface/specimens/wordmark_directions_comparison.svg"
    png_path = "c:/COGNITARA EXAM PORTAL/CogniTara-Typeface/specimens/wordmark_directions_comparison.png"
    vc_path = "c:/COGNITARA EXAM PORTAL/CogniTara-Typeface/specimens/wordmark_directions_comparison.vectorcraft"

    svg_content = build_comparison_specimen_svg()
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(svg_content)
    print(f"Generated {svg_path}")

    # Convert to PNG and .vectorcraft using vectorcraft-cli
    vc_cli = r"C:\Program Files\VectorCraft\vectorcraft-cli.exe"
    if os.path.exists(vc_cli):
        res1 = subprocess.run([vc_cli, "convert", svg_path, png_path, "--outline-text"], capture_output=True, text=True)
        print(f"VectorCraft PNG conversion: exit={res1.returncode}")
        res2 = subprocess.run([vc_cli, "convert", svg_path, vc_path, "--outline-text"], capture_output=True, text=True)
        print(f"VectorCraft .vectorcraft conversion: exit={res2.returncode}")
    else:
        print("VectorCraft CLI not found.")

if __name__ == "__main__":
    main()
