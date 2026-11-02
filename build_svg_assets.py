"""
build_svg_assets.py
Production SVG Asset Engine for CogniTara Brand Identity
- Symbol: The Luminary C (Strictly Preserved - Architectural C with 45-degree radial cuts + Forward Tara Beacon)
- Wordmark: CogniTara Type (Proprietary Custom Vector Typography - Direction 3: Luminary Modern)
"""

import math

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

def pt_str(p):
    return f"{p[0]:.2f},{p[1]:.2f}"

# ===========================================================================
# APPROVED LOGO SYMBOL: THE LUMINARY C (STRICTLY PRESERVED & UNCHANGED)
# ===========================================================================
def get_luminary_c_paths(cx, cy, scale=1.0):
    ro = 72.0 * scale
    ri = 44.0 * scale
    
    # Outer arc counter-clockwise: 45 -> 135 -> 225 -> 315
    q1 = arc_bezier(cx, cy, ro, 45, 135)
    q2 = arc_bezier(cx, cy, ro, 135, 225)
    q3 = arc_bezier(cx, cy, ro, 225, 315)
    
    # Top terminal cut: 315 outer to 315 inner
    p_top_inner = (cx + ri * math.cos(math.radians(315)), cy + ri * math.sin(math.radians(315)))
    
    # Inner arc clockwise: 315 -> 225 -> 135 -> 45
    qi1 = arc_bezier(cx, cy, ri, 315, 225)
    qi2 = arc_bezier(cx, cy, ri, 225, 135)
    qi3 = arc_bezier(cx, cy, ri, 135, 45)
    
    d_c = (f"M {pt_str(q1[0])} "
           f"C {pt_str(q1[1])} {pt_str(q1[2])} {pt_str(q1[3])} "
           f"C {pt_str(q2[1])} {pt_str(q2[2])} {pt_str(q2[3])} "
           f"C {pt_str(q3[1])} {pt_str(q3[2])} {pt_str(q3[3])} "
           f"L {pt_str(p_top_inner)} "
           f"C {pt_str(qi1[1])} {pt_str(qi1[2])} {pt_str(qi1[3])} "
           f"C {pt_str(qi2[1])} {pt_str(qi2[2])} {pt_str(qi2[3])} "
           f"C {pt_str(qi3[1])} {pt_str(qi3[2])} {pt_str(qi3[3])} Z")
    
    # Forward-Pointing Tara Star Beacon
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

# ===========================================================================
# PROPRIETARY WORDMARK: COGNITARA TYPE (DIRECTION 3: LUMINARY MODERN)
# Exact vector geometry matching font outlines: 45° cuts, G2 counters, Tara tittle
# ===========================================================================
def get_custom_wordmark_group(x0, y0, scale=0.075, cogni_color="#FFFFFF", tara_color="#00D2FF"):
    """
    Returns custom vector outlines for 'CogniTara'.
    - 'Cogni' (Bold 700)
    - 'Tara' (SemiBold 600) with custom Tara Star Beacon tittle on 'i'
    """
    return f'''<g id="custom_wordmark" transform="translate({x0}, {y0}) scale({scale}, {-scale})">
      <!-- Cogni in {cogni_color} (Bold Weight) -->
      <g fill="{cogni_color}">
        <!-- Capital C (Adv: 660, 45-deg radial cuts) -->
        <g transform="translate(0, 0)">
          <path d="M 577,467 C 516,569 409,635 285,635 C 105,635 -40,490 -40,310 C -40,130 105,-15 285,-15 C 409,-15 516,51 577,153 L 485,215 C 445,142 370,95 285,95 C 166,95 70,191 70,310 C 70,429 166,525 285,525 C 370,525 445,478 485,405 Z"/>
        </g>
        <!-- Lowercase o (Adv: 560, G2 circular counter) -->
        <g transform="translate(640, 0)">
          <path d="M 280,-10 C 430,-10 550,110 550,260 C 550,410 430,530 280,530 C 130,530 10,410 10,260 C 10,110 130,-10 280,-10 Z M 280,105 C 195,105 125,175 125,260 C 125,345 195,415 280,415 C 365,415 435,345 435,260 C 435,175 365,105 280,105 Z" fill-rule="evenodd"/>
        </g>
        <!-- Lowercase g (Adv: 560, single-story geometric with 45-deg terminal cut) -->
        <g transform="translate(1220, 0)">
          <path d="M 270,110 C 185,110 120,175 120,260 C 120,345 185,410 270,410 C 355,410 420,345 420,260 C 420,175 355,110 270,110 Z M 530,520 L 420,520 L 420,445 C 385,495 330,530 260,530 C 115,530 0,410 0,260 C 0,110 115,-10 260,-10 C 330,-10 385,25 420,75 L 420,0 C 420,-90 365,-140 270,-140 C 205,-140 155,-110 135,-65 L 30,-95 C 65,-165 155,-215 270,-215 C 440,-215 530,-130 530,0 L 530,520 Z" fill-rule="evenodd"/>
        </g>
        <!-- Lowercase n (Adv: 560, organic geometric arch) -->
        <g transform="translate(1800, 0)">
          <path d="M 10,0 L 125,0 L 125,335 C 160,390 220,425 290,425 C 385,425 440,365 440,260 L 440,0 L 550,0 L 550,270 C 550,425 455,530 310,530 C 230,530 165,490 125,430 L 125,520 L 10,520 Z"/>
        </g>
        <!-- Lowercase i (Adv: 260, stem in cogni_color) -->
        <g transform="translate(2380, 0)">
          <rect x="20" y="0" width="115" height="520" rx="4"/>
          <!-- Signature Tara Beacon 4-point concave spark tittle (in tara_color) -->
          <path d="M 77,575 C 92,625 92,625 142,640 C 92,655 92,655 77,705 C 62,655 62,655 12,640 C 62,625 62,625 77,575 Z" fill="{tara_color}"/>
        </g>
      </g>
      <!-- Tara in {tara_color} (SemiBold Weight) -->
      <g fill="{tara_color}">
        <!-- Capital T (Adv: 560, 45-deg chamfered undercut) -->
        <g transform="translate(2680, 0)">
          <path d="M 230,0 L 330,0 L 330,605 L 540,605 L 540,685 C 540,695 530,700 520,700 L 40,700 C 30,700 20,695 20,685 L 20,605 L 230,605 Z"/>
        </g>
        <!-- Lowercase a (Adv: 530, single-story modern geometric) -->
        <g transform="translate(3250, 0)">
          <path d="M 250,95 C 175,95 115,155 115,260 C 115,365 175,425 250,425 C 325,425 385,365 385,260 C 385,155 325,95 250,95 Z M 480,0 L 480,100 C 445,40 375,-10 270,-10 C 130,-10 15,105 15,260 C 15,415 130,530 270,530 C 375,530 445,480 480,420 L 480,520 L 575,520 L 575,0 Z" fill-rule="evenodd"/>
        </g>
        <!-- Lowercase r (Adv: 380, 45-deg beveled terminal) -->
        <g transform="translate(3850, 0)">
          <path d="M 10,0 L 105,0 L 105,335 C 135,395 190,430 260,430 C 295,430 330,420 355,405 L 385,490 C 350,515 305,530 250,530 C 175,530 120,485 100,420 L 100,520 L 10,520 Z"/>
        </g>
        <!-- Lowercase a (Adv: 530, single-story modern geometric) -->
        <g transform="translate(4250, 0)">
          <path d="M 250,95 C 175,95 115,155 115,260 C 115,365 175,425 250,425 C 325,425 385,365 385,260 C 385,155 325,95 250,95 Z M 480,0 L 480,100 C 445,40 375,-10 270,-10 C 130,-10 15,105 15,260 C 15,415 130,530 270,530 C 375,530 445,480 480,420 L 480,520 L 575,520 L 575,0 Z" fill-rule="evenodd"/>
        </g>
      </g>
    </g>'''

SVG_DEFS = '''<defs>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&amp;display=swap');
    .sub-text { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; font-weight: 600; letter-spacing: 3.5px; }
  </style>
</defs>'''

# 1. Primary Horizontal Logo (Dark Navy background container)
def build_primary_svg():
    dc, dstar = get_luminary_c_paths(cx=95, cy=80, scale=0.65)
    wordmark = get_custom_wordmark_group(x0=178, y0=95, scale=0.076, cogni_color="#FFFFFF", tara_color="#00D2FF")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 160" width="580" height="160">
{SVG_DEFS}
  <rect width="100%" height="100%" fill="#0A0E1A" rx="20"/>
  <!-- The Luminary C Mark (Strictly Preserved) -->
  <g id="symbol">
    <path d="{dc}" fill="#FFFFFF" />
    <path d="{dstar}" fill="#00D2FF" />
  </g>
  <!-- Proprietary CogniTara Type Wordmark -->
  {wordmark}
  <text x="180" y="124" class="sub-text" font-size="10.5" fill="#94A3B8">
    INTELLIGENT SYSTEMS &amp; SOFTWARE
  </text>
</svg>'''

# 1b. Primary Light Horizontal Logo (Clean White background container)
def build_primary_light_svg():
    dc, dstar = get_luminary_c_paths(cx=95, cy=80, scale=0.65)
    wordmark = get_custom_wordmark_group(x0=178, y0=95, scale=0.076, cogni_color="#0A0E1A", tara_color="#0066FF")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 160" width="580" height="160">
{SVG_DEFS}
  <rect width="100%" height="100%" fill="#FFFFFF" rx="20" stroke="#E2E8F0" stroke-width="1.5"/>
  <!-- The Luminary C Mark (Strictly Preserved) -->
  <g id="symbol">
    <path d="{dc}" fill="#0A0E1A" />
    <path d="{dstar}" fill="#0066FF" />
  </g>
  <!-- Proprietary CogniTara Type Wordmark -->
  {wordmark}
  <text x="180" y="124" class="sub-text" font-size="10.5" fill="#64748B">
    INTELLIGENT SYSTEMS &amp; SOFTWARE
  </text>
</svg>'''

# 2. Standalone Symbol (The Luminary C on Dark Navy) - STRICTLY UNCHANGED
def build_symbol_svg():
    dc, dstar = get_luminary_c_paths(cx=100, cy=100, scale=1.0)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
{SVG_DEFS}
  <rect width="100%" height="100%" fill="#0A0E1A" rx="36"/>
  <g id="symbol">
    <path d="{dc}" fill="#FFFFFF" />
    <path d="{dstar}" fill="#00D2FF" />
  </g>
</svg>'''

# 3. Wordmark Only (Dark Navy container)
def build_wordmark_svg():
    wordmark = get_custom_wordmark_group(x0=32, y0=78, scale=0.082, cogni_color="#FFFFFF", tara_color="#00D2FF")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 130" width="460" height="130">
{SVG_DEFS}
  <rect width="100%" height="100%" fill="#0A0E1A" rx="18"/>
  <!-- Proprietary CogniTara Type Wordmark -->
  {wordmark}
  <text x="35" y="108" class="sub-text" font-size="11" fill="#94A3B8">
    INTELLIGENT SYSTEMS &amp; SOFTWARE
  </text>
</svg>'''

# 4. Solid Monochrome Black (On Pure White)
def build_black_svg():
    dc, dstar = get_luminary_c_paths(cx=95, cy=80, scale=0.65)
    wordmark = get_custom_wordmark_group(x0=178, y0=95, scale=0.076, cogni_color="#000000", tara_color="#000000")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 160" width="580" height="160">
{SVG_DEFS}
  <rect width="100%" height="100%" fill="#FFFFFF" rx="20"/>
  <g id="symbol">
    <path d="{dc}" fill="#000000" />
    <path d="{dstar}" fill="#000000" />
  </g>
  <!-- Proprietary CogniTara Type Wordmark -->
  {wordmark}
  <text x="180" y="124" class="sub-text" font-size="10.5" fill="#334155">
    INTELLIGENT SYSTEMS &amp; SOFTWARE
  </text>
</svg>'''

# 5. Solid Monochrome White (On Pure Midnight Navy)
def build_white_svg():
    dc, dstar = get_luminary_c_paths(cx=95, cy=80, scale=0.65)
    wordmark = get_custom_wordmark_group(x0=178, y0=95, scale=0.076, cogni_color="#FFFFFF", tara_color="#FFFFFF")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 160" width="580" height="160">
{SVG_DEFS}
  <rect width="100%" height="100%" fill="#0A0E1A" rx="20"/>
  <g id="symbol">
    <path d="{dc}" fill="#FFFFFF" />
    <path d="{dstar}" fill="#FFFFFF" />
  </g>
  <!-- Proprietary CogniTara Type Wordmark -->
  {wordmark}
  <text x="180" y="124" class="sub-text" font-size="10.5" fill="#E2E8F0">
    INTELLIGENT SYSTEMS &amp; SOFTWARE
  </text>
</svg>'''

# 6. App Icon (512x512 with midnight navy squircle) - STRICTLY UNCHANGED
def build_app_icon_svg():
    dc, dstar = get_luminary_c_paths(cx=256, cy=256, scale=2.15)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
{SVG_DEFS}
  <rect width="512" height="512" rx="115" fill="#0A0E1A" />
  <rect x="1.5" y="1.5" width="509" height="509" rx="113.5" fill="none" stroke="#00D2FF" stroke-width="2" stroke-opacity="0.2" />
  <g id="symbol">
    <path d="{dc}" fill="#FFFFFF" />
    <path d="{dstar}" fill="#00D2FF" />
  </g>
</svg>'''

# 7. Social Preview (1200x630 banner showcase)
def build_social_preview_svg():
    dc, dstar = get_luminary_c_paths(cx=260, cy=315, scale=1.9)
    wordmark = get_custom_wordmark_group(x0=480, y0=335, scale=0.145, cogni_color="#FFFFFF", tara_color="#00D2FF")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
{SVG_DEFS}
  <rect width="1200" height="630" fill="#0A0E1A" />
  <circle cx="260" cy="315" r="280" fill="#00D2FF" opacity="0.06" />
  <circle cx="260" cy="315" r="180" fill="#0066FF" opacity="0.08" />
  
  <rect x="480" y="195" width="245" height="30" rx="15" fill="#121829" stroke="#00D2FF" stroke-width="1" stroke-opacity="0.4" />
  <circle cx="496" cy="210" r="4.5" fill="#00D2FF" />
  <text x="510" y="215" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="11.5" font-weight="700" fill="#38BDF8" letter-spacing="2">
    PROPRIETARY TYPEFACE
  </text>
  
  <g id="symbol">
    <path d="{dc}" fill="#FFFFFF" />
    <path d="{dstar}" fill="#00D2FF" />
  </g>
  
  <!-- Custom Vector Wordmark -->
  {wordmark}
  <text x="484" y="385" class="sub-text" font-size="15" fill="#94A3B8">
    INTELLIGENT SYSTEMS &amp; SOFTWARE
  </text>
  
  <line x1="80" y1="530" x2="1120" y2="530" stroke="#1E293B" stroke-width="1.5" />
  <text x="80" y="565" font-family="'Plus Jakarta Sans', sans-serif" font-size="13" font-weight="600" fill="#64748B" letter-spacing="1.5">
    VECTORCRAFT NATIVE SYSTEM · COGNITARA TYPE GEOMETRIC ENGINE
  </text>
  <text x="1120" y="565" text-anchor="end" font-family="'Plus Jakarta Sans', monospace, sans-serif" font-size="13" font-weight="600" fill="#00D2FF" letter-spacing="1.5">
    COGNITARA.COM
  </text>
</svg>'''
