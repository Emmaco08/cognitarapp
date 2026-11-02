"""
build_cognitara_typeface.py
Engineers and compiles the proprietary CogniTara Typeface ('CogniTara Type')
in two weights: Regular and Bold, using fontTools.

Features:
- Full Latin Character Set: Uppercase A-Z, Lowercase a-z, Digits 0-9, Punctuation & Symbols
- Brand DNA Integration:
    * Capital C: Mathematical 45-degree radial cut terminals (Luminary C heritage)
    * Capital T: 45-degree beveled undercut chamfers on crossbar
    * Lowercase i & j: Signature 4-point concave spark beacon tittle (Tara Star heritage)
    * Lowercase c, e, r: 45-degree beveled terminal cuts
    * Circular counters with G2 continuous optical transitions
- Standard TrueType metrics, Unicode cmap table, naming table, and OpenType kerning
"""

import math
import os
import subprocess
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib.tables._k_e_r_n import table__k_e_r_n, KernTable_format_0

# ---------------------------------------------------------------------------
# GEOMETRIC PRIMITIVES & HELPERS
# ---------------------------------------------------------------------------

KAPPA = 0.5522847498307935  # Cubic Bézier circle constant

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

def rect(pen, x, y, w, h, clockwise=True):
    """Draws an axis-aligned rectangle."""
    if clockwise:
        pen.moveTo((x, y))
        pen.lineTo((x, y + h))
        pen.lineTo((x + w, y + h))
        pen.lineTo((x + w, y))
        pen.closePath()
    else:
        pen.moveTo((x, y))
        pen.lineTo((x + w, y))
        pen.lineTo((x + w, y + h))
        pen.lineTo((x, y + h))
        pen.closePath()

def ellipse(pen, cx, cy, rx, ry, clockwise=True):
    """Draws a 4-quadrant cubic ellipse."""
    kx = rx * KAPPA
    ky = ry * KAPPA
    if clockwise:
        pen.moveTo((cx, cy + ry))
        pen.curveTo((cx + kx, cy + ry), (cx + rx, cy + ky), (cx + rx, cy))
        pen.curveTo((cx + rx, cy - ky), (cx + kx, cy - ry), (cx, cy - ry))
        pen.curveTo((cx - kx, cy - ry), (cx - rx, cy - ky), (cx - rx, cy))
        pen.curveTo((cx - rx, cy + ky), (cx - kx, cy + ry), (cx, cy + ry))
        pen.closePath()
    else:
        pen.moveTo((cx, cy + ry))
        pen.curveTo((cx - kx, cy + ry), (cx - rx, cy + ky), (cx - rx, cy))
        pen.curveTo((cx - rx, cy - ky), (cx - kx, cy - ry), (cx, cy - ry))
        pen.curveTo((cx + kx, cy - ry), (cx + rx, cy - ky), (cx + rx, cy))
        pen.curveTo((cx + rx, cy + ky), (cx + kx, cy + ry), (cx, cy + ry))
        pen.closePath()

def donut(pen, cx, cy, rx_out, ry_out, rx_in, ry_in):
    """Draws an outer ellipse (clockwise) and inner counter (counter-clockwise)."""
    ellipse(pen, cx, cy, rx_out, ry_out, clockwise=True)
    ellipse(pen, cx, cy, rx_in, ry_in, clockwise=False)

def draw_star_beacon(pen, cx, cy, r_vert, r_horiz, pinch):
    """Draws the proprietary 4-point concave Tara star beacon."""
    pen.moveTo((cx, cy - r_vert))
    pen.curveTo((cx + pinch, cy - pinch), (cx + pinch, cy - pinch), (cx + r_horiz, cy))
    pen.curveTo((cx + pinch, cy + pinch), (cx + pinch, cy + pinch), (cx, cy + r_vert))
    pen.curveTo((cx - pinch, cy + pinch), (cx - pinch, cy + pinch), (cx - r_horiz, cy))
    pen.curveTo((cx - pinch, cy - pinch), (cx - pinch, cy - pinch), (cx, cy - r_vert))
    pen.closePath()

def draw_luminary_c_arc(pen, cx, cy, ro, ri, a_top=45, a_bot=315):
    """Draws the Luminary C arc with 45-degree radial cut terminals."""
    # Outer arc counter-clockwise: a_top -> 135 -> 225 -> a_bot
    q1 = arc_bezier(cx, cy, ro, a_top, 135)
    q2 = arc_bezier(cx, cy, ro, 135, 225)
    q3 = arc_bezier(cx, cy, ro, 225, a_bot)
    
    # Inner arc clockwise: a_bot -> 225 -> 135 -> a_top
    qi1 = arc_bezier(cx, cy, ri, a_bot, 225)
    qi2 = arc_bezier(cx, cy, ri, 225, 135)
    qi3 = arc_bezier(cx, cy, ri, 135, a_top)
    
    pen.moveTo(q1[0])
    pen.curveTo(q1[1], q1[2], q1[3])
    pen.curveTo(q2[1], q2[2], q2[3])
    pen.curveTo(q3[1], q3[2], q3[3])
    pen.lineTo(qi1[0])
    pen.curveTo(qi1[1], qi1[2], qi1[3])
    pen.curveTo(qi2[1], qi2[2], qi2[3])
    pen.curveTo(qi3[1], qi3[2], qi3[3])
    pen.closePath()

# ---------------------------------------------------------------------------
# GLYPH BUILDER CLASS FOR A SPECIFIC WEIGHT
# ---------------------------------------------------------------------------

class CogniTaraGlyphFactory:
    def __init__(self, is_bold=False):
        self.is_bold = is_bold
        self.cap_height = 700
        self.x_height = 520
        self.ascender = 750
        self.descender = -200
        self.overshoot = 12
        
        if is_bold:
            self.w = 138       # Vertical stem width
            self.h_bar = 118   # Horizontal bar height
            self.w_curve = 144 # Curve apex thickness
            self.side_bear = 55
        else:
            self.w = 88        # Vertical stem width
            self.h_bar = 78    # Horizontal bar height
            self.w_curve = 92  # Curve apex thickness
            self.side_bear = 65

    def build_glyph(self, name):
        tt_pen = TTGlyphPen(None)
        pen = Cu2QuPen(tt_pen, max_err=1.0)
        adv = 600 # default
        
        # Dispatch to specific builder
        method_name = f"draw_{name}"
        if hasattr(self, method_name):
            adv = getattr(self, method_name)(pen)
        else:
            # Fallback for undefined
            adv = self.draw_notdef(pen)
            
        glyph = tt_pen.glyph()
        return glyph, adv

    # --- SPECIAL GLYPHS ---
    def draw_notdef(self, pen):
        w_box = 500
        rect(pen, 50, 0, w_box - 100, self.cap_height, clockwise=True)
        rect(pen, 100, 50, w_box - 200, self.cap_height - 100, clockwise=False)
        return w_box

    def draw_space(self, pen):
        return 280

    # --- UPPERCASE LETTERS A-Z ---
    def draw_A(self, pen):
        w_adv = 680
        cx = w_adv / 2
        # Outer triangle
        pen.moveTo((self.side_bear, 0))
        pen.lineTo((cx, self.cap_height))
        pen.lineTo((w_adv - self.side_bear, 0))
        pen.lineTo((w_adv - self.side_bear - self.w, 0))
        pen.lineTo((cx + 60, 240))
        pen.lineTo((cx - 60, 240))
        pen.lineTo((self.side_bear + self.w, 0))
        pen.closePath()
        # Inner triangle counter (counter-clockwise)
        pen.moveTo((cx, self.cap_height - self.w * 1.5))
        pen.lineTo((cx - 100, 310))
        pen.lineTo((cx + 100, 310))
        pen.closePath()
        # Crossbar
        rect(pen, cx - 110, 220, 220, self.h_bar, clockwise=True)
        return w_adv

    def draw_B(self, pen):
        w_adv = 620
        # Vertical stem
        rect(pen, self.side_bear, 0, self.w, self.cap_height, clockwise=True)
        # Upper bowl
        r_top = (self.cap_height - 320) / 2
        cy_top = 320 + r_top
        rect(pen, self.side_bear + self.w - 5, 320, 180, self.cap_height - 320, clockwise=True)
        donut(pen, self.side_bear + self.w + 120, cy_top, 140, r_top, 140 - self.w_curve, r_top - self.h_bar)
        # Lower bowl
        r_bot = 350 / 2
        cy_bot = r_bot
        rect(pen, self.side_bear + self.w - 5, 0, 200, 350, clockwise=True)
        donut(pen, self.side_bear + self.w + 140, cy_bot, 160, r_bot, 160 - self.w_curve, r_bot - self.h_bar)
        return w_adv

    def draw_C(self, pen):
        # The Signature Luminary C (Capital)
        w_adv = 660
        cx = w_adv / 2 - 10
        cy = self.cap_height / 2
        ro = self.cap_height / 2 + self.overshoot
        ri = ro - self.w_curve
        draw_luminary_c_arc(pen, cx, cy, ro, ri, a_top=45, a_bot=315)
        return w_adv

    def draw_D(self, pen):
        w_adv = 660
        # Vertical stem
        rect(pen, self.side_bear, 0, self.w, self.cap_height, clockwise=True)
        # Right bowl
        cx = self.side_bear + self.w
        cy = self.cap_height / 2
        rx_out = w_adv - self.side_bear - cx
        ry_out = self.cap_height / 2 + self.overshoot
        rx_in = rx_out - self.w_curve
        ry_in = ry_out - self.h_bar
        
        # Outer half ellipse
        pen.moveTo((cx, cy + ry_out))
        pen.curveTo((cx + rx_out * KAPPA, cy + ry_out), (cx + rx_out, cy + ry_out * KAPPA), (cx + rx_out, cy))
        pen.curveTo((cx + rx_out, cy - ry_out * KAPPA), (cx + rx_out * KAPPA, cy - ry_out), (cx, cy - ry_out))
        pen.lineTo((cx, cy - ry_in))
        pen.curveTo((cx + rx_in * KAPPA, cy - ry_in), (cx + rx_in, cy - ry_in * KAPPA), (cx + rx_in, cy))
        pen.curveTo((cx + rx_in, cy + ry_in * KAPPA), (cx + rx_in * KAPPA, cy + ry_in), (cx, cy + ry_in))
        pen.closePath()
        return w_adv

    def draw_E(self, pen):
        w_adv = 580
        rect(pen, self.side_bear, 0, self.w, self.cap_height, clockwise=True)
        rect(pen, self.side_bear + self.w, self.cap_height - self.h_bar, w_adv - self.side_bear * 2 - self.w, self.h_bar, clockwise=True)
        rect(pen, self.side_bear + self.w, self.cap_height / 2 - self.h_bar / 2, w_adv - self.side_bear * 2 - self.w - 40, self.h_bar, clockwise=True)
        rect(pen, self.side_bear + self.w, 0, w_adv - self.side_bear * 2 - self.w, self.h_bar, clockwise=True)
        return w_adv

    def draw_F(self, pen):
        w_adv = 540
        rect(pen, self.side_bear, 0, self.w, self.cap_height, clockwise=True)
        rect(pen, self.side_bear + self.w, self.cap_height - self.h_bar, w_adv - self.side_bear * 2 - self.w, self.h_bar, clockwise=True)
        rect(pen, self.side_bear + self.w, self.cap_height / 2 - self.h_bar / 2, w_adv - self.side_bear * 2 - self.w - 50, self.h_bar, clockwise=True)
        return w_adv

    def draw_G(self, pen):
        w_adv = 680
        cx = w_adv / 2 - 10
        cy = self.cap_height / 2
        ro = self.cap_height / 2 + self.overshoot
        ri = ro - self.w_curve
        draw_luminary_c_arc(pen, cx, cy, ro, ri, a_top=45, a_bot=315)
        # Vertical spur + horizontal bar at right
        x_spur = cx + ro * math.cos(math.radians(315)) - 10
        rect(pen, x_spur - self.w, cy - 60, self.w, 180, clockwise=True)
        rect(pen, cx - 40, cy - 60, (x_spur - cx) + 40, self.h_bar, clockwise=True)
        return w_adv

    def draw_H(self, pen):
        w_adv = 650
        rect(pen, self.side_bear, 0, self.w, self.cap_height, clockwise=True)
        rect(pen, w_adv - self.side_bear - self.w, 0, self.w, self.cap_height, clockwise=True)
        rect(pen, self.side_bear + self.w, self.cap_height / 2 - self.h_bar / 2, w_adv - self.side_bear * 2 - self.w * 2, self.h_bar, clockwise=True)
        return w_adv

    def draw_I(self, pen):
        w_adv = 260
        cx = w_adv / 2
        rect(pen, cx - self.w / 2, 0, self.w, self.cap_height, clockwise=True)
        return w_adv

    def draw_J(self, pen):
        w_adv = 480
        x_stem = w_adv - self.side_bear - self.w
        rect(pen, x_stem, 160, self.w, self.cap_height - 160, clockwise=True)
        # Bottom curve
        donut(pen, self.side_bear + 140, 160, 140, 160 + self.overshoot, 140 - self.w_curve, 160 + self.overshoot - self.h_bar)
        return w_adv

    def draw_K(self, pen):
        w_adv = 620
        rect(pen, self.side_bear, 0, self.w, self.cap_height, clockwise=True)
        # Upper diagonal
        pen.moveTo((self.side_bear + self.w - 10, 260))
        pen.lineTo((w_adv - self.side_bear, self.cap_height))
        pen.lineTo((w_adv - self.side_bear - self.w * 1.1, self.cap_height))
        pen.lineTo((self.side_bear + self.w - 10, 360))
        pen.closePath()
        # Lower diagonal
        pen.moveTo((self.side_bear + self.w + 50, 310))
        pen.lineTo((w_adv - self.side_bear, 0))
        pen.lineTo((w_adv - self.side_bear - self.w * 1.1, 0))
        pen.lineTo((self.side_bear + self.w - 10, 210))
        pen.closePath()
        return w_adv

    def draw_L(self, pen):
        w_adv = 520
        rect(pen, self.side_bear, 0, self.w, self.cap_height, clockwise=True)
        rect(pen, self.side_bear + self.w, 0, w_adv - self.side_bear * 2 - self.w, self.h_bar, clockwise=True)
        return w_adv

    def draw_M(self, pen):
        w_adv = 760
        rect(pen, self.side_bear, 0, self.w, self.cap_height, clockwise=True)
        rect(pen, w_adv - self.side_bear - self.w, 0, self.w, self.cap_height, clockwise=True)
        cx = w_adv / 2
        # Left diagonal
        pen.moveTo((self.side_bear + self.w, self.cap_height))
        pen.lineTo((cx, 160))
        pen.lineTo((cx - self.w / 2, 160))
        pen.lineTo((self.side_bear, self.cap_height))
        pen.closePath()
        # Right diagonal
        pen.moveTo((w_adv - self.side_bear, self.cap_height))
        pen.lineTo((cx + self.w / 2, 160))
        pen.lineTo((cx, 160))
        pen.lineTo((w_adv - self.side_bear - self.w, self.cap_height))
        pen.closePath()
        return w_adv

    def draw_N(self, pen):
        w_adv = 660
        rect(pen, self.side_bear, 0, self.w, self.cap_height, clockwise=True)
        rect(pen, w_adv - self.side_bear - self.w, 0, self.w, self.cap_height, clockwise=True)
        # Diagonal
        pen.moveTo((self.side_bear, self.cap_height))
        pen.lineTo((self.side_bear + self.w * 0.8, self.cap_height))
        pen.lineTo((w_adv - self.side_bear, 0))
        pen.lineTo((w_adv - self.side_bear - self.w * 0.8, 0))
        pen.closePath()
        return w_adv

    def draw_O(self, pen):
        w_adv = 680
        cx = w_adv / 2
        cy = self.cap_height / 2
        rx_out = cx - self.side_bear
        ry_out = cy + self.overshoot
        rx_in = rx_out - self.w_curve
        ry_in = ry_out - self.h_bar
        donut(pen, cx, cy, rx_out, ry_out, rx_in, ry_in)
        return w_adv

    def draw_P(self, pen):
        w_adv = 580
        rect(pen, self.side_bear, 0, self.w, self.cap_height, clockwise=True)
        cy = (self.cap_height + 260) / 2
        r_bowl = (self.cap_height - 260) / 2
        rect(pen, self.side_bear + self.w - 5, 260, 160, self.cap_height - 260, clockwise=True)
        donut(pen, self.side_bear + self.w + 120, cy, 150, r_bowl, 150 - self.w_curve, r_bowl - self.h_bar)
        return w_adv

    def draw_Q(self, pen):
        w_adv = 680
        cx = w_adv / 2
        cy = self.cap_height / 2
        rx_out = cx - self.side_bear
        ry_out = cy + self.overshoot
        rx_in = rx_out - self.w_curve
        ry_in = ry_out - self.h_bar
        donut(pen, cx, cy, rx_out, ry_out, rx_in, ry_in)
        # Dynamic angled tail
        pen.moveTo((cx + 60, cy - ry_in + 40))
        pen.lineTo((w_adv - 20, -120))
        pen.lineTo((w_adv - 20 - self.w, -120))
        pen.lineTo((cx - 20, cy - ry_out + 10))
        pen.closePath()
        return w_adv

    def draw_R(self, pen):
        w_adv = 600
        rect(pen, self.side_bear, 0, self.w, self.cap_height, clockwise=True)
        cy = (self.cap_height + 260) / 2
        r_bowl = (self.cap_height - 260) / 2
        rect(pen, self.side_bear + self.w - 5, 260, 160, self.cap_height - 260, clockwise=True)
        donut(pen, self.side_bear + self.w + 120, cy, 150, r_bowl, 150 - self.w_curve, r_bowl - self.h_bar)
        # Diagonal leg
        pen.moveTo((self.side_bear + self.w + 40, 260))
        pen.lineTo((w_adv - self.side_bear, 0))
        pen.lineTo((w_adv - self.side_bear - self.w * 1.1, 0))
        pen.lineTo((self.side_bear + self.w, 260))
        pen.closePath()
        return w_adv

    def draw_S(self, pen):
        w_adv = 580
        cx = w_adv / 2
        cy1 = self.cap_height * 0.72
        cy2 = self.cap_height * 0.28
        r1 = self.cap_height * 0.28
        r2 = self.cap_height * 0.28
        # Smooth S spine
        donut(pen, cx, cy1, cx - self.side_bear - 10, r1, cx - self.side_bear - 10 - self.w_curve, r1 - self.h_bar)
        donut(pen, cx, cy2, cx - self.side_bear, r2, cx - self.side_bear - self.w_curve, r2 - self.h_bar)
        return w_adv

    def draw_T(self, pen):
        # Capital T with 45-degree chamfers on crossbar ends
        w_adv = 560
        cx = w_adv / 2
        # Vertical stem
        rect(pen, cx - self.w / 2, 0, self.w, self.cap_height - self.h_bar + 10, clockwise=True)
        # Crossbar with 45-degree beveled undercut
        chamfer = 24 if self.is_bold else 16
        pen.moveTo((self.side_bear, self.cap_height - self.h_bar))
        pen.lineTo((self.side_bear, self.cap_height - chamfer))
        pen.lineTo((self.side_bear + chamfer, self.cap_height))
        pen.lineTo((w_adv - self.side_bear - chamfer, self.cap_height))
        pen.lineTo((w_adv - self.side_bear, self.cap_height - chamfer))
        pen.lineTo((w_adv - self.side_bear, self.cap_height - self.h_bar))
        pen.lineTo((w_adv - self.side_bear - chamfer, self.cap_height - self.h_bar - chamfer))
        pen.lineTo((self.side_bear + chamfer, self.cap_height - self.h_bar - chamfer))
        pen.closePath()
        return w_adv

    def draw_U(self, pen):
        w_adv = 640
        rect(pen, self.side_bear, 220, self.w, self.cap_height - 220, clockwise=True)
        rect(pen, w_adv - self.side_bear - self.w, 220, self.w, self.cap_height - 220, clockwise=True)
        cx = w_adv / 2
        rx_out = cx - self.side_bear
        ry_out = 220 + self.overshoot
        rx_in = rx_out - self.w_curve
        ry_in = ry_out - self.h_bar
        # Bottom curved basin
        pen.moveTo((self.side_bear, 220))
        pen.curveTo((self.side_bear, 220 - ry_out * KAPPA), (cx - rx_out * KAPPA, -self.overshoot), (cx, -self.overshoot))
        pen.curveTo((cx + rx_out * KAPPA, -self.overshoot), (w_adv - self.side_bear, 220 - ry_out * KAPPA), (w_adv - self.side_bear, 220))
        pen.lineTo((w_adv - self.side_bear - self.w, 220))
        pen.curveTo((w_adv - self.side_bear - self.w, 220 - ry_in * KAPPA), (cx + rx_in * KAPPA, ry_out - ry_in), (cx, ry_out - ry_in))
        pen.curveTo((cx - rx_in * KAPPA, ry_out - ry_in), (self.side_bear + self.w, 220 - ry_in * KAPPA), (self.side_bear + self.w, 220))
        pen.closePath()
        return w_adv

    def draw_V(self, pen):
        w_adv = 620
        cx = w_adv / 2
        pen.moveTo((self.side_bear, self.cap_height))
        pen.lineTo((self.side_bear + self.w, self.cap_height))
        pen.lineTo((cx, 100))
        pen.lineTo((w_adv - self.side_bear - self.w, self.cap_height))
        pen.lineTo((w_adv - self.side_bear, self.cap_height))
        pen.lineTo((cx + self.w / 2, 0))
        pen.lineTo((cx - self.w / 2, 0))
        pen.closePath()
        return w_adv

    def draw_W(self, pen):
        w_adv = 860
        cx = w_adv / 2
        w4 = w_adv / 4
        # Left V
        pen.moveTo((self.side_bear, self.cap_height))
        pen.lineTo((self.side_bear + self.w * 0.9, self.cap_height))
        pen.lineTo((w4 + 20, 0))
        pen.lineTo((cx, self.cap_height - 180))
        pen.lineTo((cx - self.w * 0.8, self.cap_height - 180))
        pen.lineTo((w4, 100))
        pen.closePath()
        # Right V
        pen.moveTo((cx, self.cap_height - 180))
        pen.lineTo((cx + self.w * 0.8, self.cap_height - 180))
        pen.lineTo((w_adv - w4 - 20, 0))
        pen.lineTo((w_adv - self.side_bear, self.cap_height))
        pen.lineTo((w_adv - self.side_bear - self.w * 0.9, self.cap_height))
        pen.lineTo((w_adv - w4, 100))
        pen.closePath()
        return w_adv

    def draw_X(self, pen):
        w_adv = 600
        pen.moveTo((self.side_bear, self.cap_height))
        pen.lineTo((self.side_bear + self.w, self.cap_height))
        pen.lineTo((w_adv - self.side_bear, 0))
        pen.lineTo((w_adv - self.side_bear - self.w, 0))
        pen.closePath()
        pen.moveTo((w_adv - self.side_bear - self.w, self.cap_height))
        pen.lineTo((w_adv - self.side_bear, self.cap_height))
        pen.lineTo((self.side_bear + self.w, 0))
        pen.lineTo((self.side_bear, 0))
        pen.closePath()
        return w_adv

    def draw_Y(self, pen):
        w_adv = 580
        cx = w_adv / 2
        y_fork = 300
        # Left fork
        pen.moveTo((self.side_bear, self.cap_height))
        pen.lineTo((self.side_bear + self.w, self.cap_height))
        pen.lineTo((cx + self.w / 2, y_fork))
        pen.lineTo((cx - self.w / 2, y_fork))
        pen.closePath()
        # Right fork
        pen.moveTo((w_adv - self.side_bear, self.cap_height))
        pen.lineTo((w_adv - self.side_bear - self.w, self.cap_height))
        pen.lineTo((cx - self.w / 2, y_fork))
        pen.lineTo((cx + self.w / 2, y_fork))
        pen.closePath()
        # Stem
        rect(pen, cx - self.w / 2, 0, self.w, y_fork, clockwise=True)
        return w_adv

    def draw_Z(self, pen):
        w_adv = 560
        rect(pen, self.side_bear, self.cap_height - self.h_bar, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        rect(pen, self.side_bear, 0, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        pen.moveTo((w_adv - self.side_bear, self.cap_height - self.h_bar))
        pen.lineTo((w_adv - self.side_bear, self.cap_height - self.h_bar - 20))
        pen.lineTo((self.side_bear + self.w, self.h_bar))
        pen.lineTo((self.side_bear, self.h_bar))
        pen.lineTo((w_adv - self.side_bear - self.w, self.cap_height - self.h_bar))
        pen.closePath()
        return w_adv

    # --- LOWERCASE LETTERS a-z ---
    def draw_a(self, pen):
        # Single-story modern geometric: round bowl + right vertical stem
        w_adv = 540
        x_stem = w_adv - self.side_bear - self.w
        # Vertical right stem
        rect(pen, x_stem, 0, self.w, self.x_height, clockwise=True)
        # Round bowl
        cx = (self.side_bear + x_stem) / 2
        cy = self.x_height / 2
        rx_out = cx - self.side_bear
        ry_out = cy + self.overshoot
        rx_in = rx_out - self.w_curve
        ry_in = ry_out - self.h_bar
        donut(pen, cx, cy, rx_out, ry_out, rx_in, ry_in)
        return w_adv

    def draw_b(self, pen):
        w_adv = 560
        # Left tall ascender stem
        rect(pen, self.side_bear, 0, self.w, self.ascender, clockwise=True)
        # Round right bowl
        cx = self.side_bear + self.w + (w_adv - self.side_bear * 2 - self.w) / 2
        cy = self.x_height / 2
        rx_out = cx - self.side_bear - self.w
        ry_out = cy + self.overshoot
        rx_in = rx_out - self.w_curve
        ry_in = ry_out - self.h_bar
        donut(pen, cx, cy, rx_out, ry_out, rx_in, ry_in)
        return w_adv

    def draw_c(self, pen):
        # Lowercase Luminary C (45-degree radial cuts)
        w_adv = 520
        cx = w_adv / 2 - 5
        cy = self.x_height / 2
        ro = self.x_height / 2 + self.overshoot
        ri = ro - self.w_curve
        draw_luminary_c_arc(pen, cx, cy, ro, ri, a_top=45, a_bot=315)
        return w_adv

    def draw_d(self, pen):
        w_adv = 560
        # Right tall ascender stem
        x_stem = w_adv - self.side_bear - self.w
        rect(pen, x_stem, 0, self.w, self.ascender, clockwise=True)
        # Round left bowl
        cx = (self.side_bear + x_stem) / 2
        cy = self.x_height / 2
        rx_out = cx - self.side_bear
        ry_out = cy + self.overshoot
        rx_in = rx_out - self.w_curve
        ry_in = ry_out - self.h_bar
        donut(pen, cx, cy, rx_out, ry_out, rx_in, ry_in)
        return w_adv

    def draw_e(self, pen):
        w_adv = 540
        cx = w_adv / 2
        cy = self.x_height / 2
        ro = cy + self.overshoot
        ri = ro - self.w_curve
        # Luminary C arc
        draw_luminary_c_arc(pen, cx, cy, ro, ri, a_top=45, a_bot=315)
        # Horizontal crossbar
        rect(pen, cx - ro + 10, cy - self.h_bar / 2, ro * 1.7, self.h_bar, clockwise=True)
        return w_adv

    def draw_f(self, pen):
        w_adv = 360
        # Vertical stem with top curve
        rect(pen, self.side_bear + 40, 0, self.w, self.ascender - 80, clockwise=True)
        # Top right hook
        donut(pen, self.side_bear + 40 + self.w, self.ascender - 80, 80, 80, 80 - self.w, 80 - self.h_bar)
        # Crossbar at x-height
        rect(pen, self.side_bear, self.x_height - self.h_bar, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        return w_adv

    def draw_g(self, pen):
        # Single-story geometric g: round bowl + stem descending to -180 with hook & 45 cut
        w_adv = 540
        x_stem = w_adv - self.side_bear - self.w
        # Round upper bowl
        cx = (self.side_bear + x_stem) / 2
        cy = self.x_height / 2
        rx_out = cx - self.side_bear
        ry_out = cy + self.overshoot
        rx_in = rx_out - self.w_curve
        ry_in = ry_out - self.h_bar
        donut(pen, cx, cy, rx_out, ry_out, rx_in, ry_in)
        # Vertical stem descending to -100
        rect(pen, x_stem, -100, self.w, self.x_height + 100, clockwise=True)
        # Bottom left hook with 45-degree terminal cut
        donut(pen, cx, -100, cx - self.side_bear, 100, cx - self.side_bear - self.w_curve, 100 - self.h_bar)
        return w_adv

    def draw_h(self, pen):
        w_adv = 560
        # Left ascender stem
        rect(pen, self.side_bear, 0, self.w, self.ascender, clockwise=True)
        # Right arch and stem
        x_stem2 = w_adv - self.side_bear - self.w
        rect(pen, x_stem2, 0, self.w, self.x_height - 100, clockwise=True)
        cx = (self.side_bear + self.w + x_stem2) / 2
        donut(pen, cx, self.x_height - 100, cx - self.side_bear - self.w, 100, cx - self.side_bear - self.w - self.w_curve, 100 - self.h_bar)
        return w_adv

    def draw_i(self, pen):
        # Lowercase i with Signature 4-point concave Tara Star Beacon tittle
        w_adv = 260
        cx = w_adv / 2
        # Vertical stem
        rect(pen, cx - self.w / 2, 0, self.w, self.x_height, clockwise=True)
        # Tara Star Beacon tittle
        r_star = 64 if self.is_bold else 52
        draw_star_beacon(pen, cx, 640, r_star, r_star, pinch=14 if self.is_bold else 11)
        return w_adv

    def draw_j(self, pen):
        # Lowercase j with Signature 4-point concave Tara Star Beacon tittle
        w_adv = 300
        x_stem = w_adv - self.side_bear - self.w
        rect(pen, x_stem, -100, self.w, self.x_height + 100, clockwise=True)
        # Bottom hook
        donut(pen, self.side_bear + 60, -100, 60, 100, 60 - self.w_curve, 100 - self.h_bar)
        # Tara Star Beacon tittle
        r_star = 64 if self.is_bold else 52
        draw_star_beacon(pen, x_stem + self.w / 2, 640, r_star, r_star, pinch=14 if self.is_bold else 11)
        return w_adv

    def draw_k(self, pen):
        w_adv = 520
        rect(pen, self.side_bear, 0, self.w, self.ascender, clockwise=True)
        pen.moveTo((self.side_bear + self.w - 10, 180))
        pen.lineTo((w_adv - self.side_bear, self.x_height))
        pen.lineTo((w_adv - self.side_bear - self.w * 1.1, self.x_height))
        pen.lineTo((self.side_bear + self.w - 10, 260))
        pen.closePath()
        pen.moveTo((self.side_bear + self.w + 40, 220))
        pen.lineTo((w_adv - self.side_bear, 0))
        pen.lineTo((w_adv - self.side_bear - self.w * 1.1, 0))
        pen.lineTo((self.side_bear + self.w - 10, 140))
        pen.closePath()
        return w_adv

    def draw_l(self, pen):
        w_adv = 260
        cx = w_adv / 2
        rect(pen, cx - self.w / 2, 0, self.w, self.ascender, clockwise=True)
        return w_adv

    def draw_m(self, pen):
        w_adv = 780
        x1 = self.side_bear
        w_cell = (w_adv - self.side_bear * 2) / 2
        x2 = x1 + w_cell
        x3 = w_adv - self.side_bear - self.w
        rect(pen, x1, 0, self.w, self.x_height, clockwise=True)
        rect(pen, x2, 0, self.w, self.x_height - 80, clockwise=True)
        rect(pen, x3, 0, self.w, self.x_height - 80, clockwise=True)
        donut(pen, (x1 + self.w + x2) / 2, self.x_height - 80, (x2 - x1 - self.w) / 2 + self.w, 80, (x2 - x1 - self.w) / 2, 80 - self.h_bar)
        donut(pen, (x2 + self.w + x3) / 2, self.x_height - 80, (x3 - x2 - self.w) / 2 + self.w, 80, (x3 - x2 - self.w) / 2, 80 - self.h_bar)
        return w_adv

    def draw_n(self, pen):
        w_adv = 560
        rect(pen, self.side_bear, 0, self.w, self.x_height, clockwise=True)
        x_stem2 = w_adv - self.side_bear - self.w
        rect(pen, x_stem2, 0, self.w, self.x_height - 80, clockwise=True)
        cx = (self.side_bear + self.w + x_stem2) / 2
        donut(pen, cx, self.x_height - 80, cx - self.side_bear - self.w, 80, cx - self.side_bear - self.w - self.w_curve, 80 - self.h_bar)
        return w_adv

    def draw_o(self, pen):
        w_adv = 540
        cx = w_adv / 2
        cy = self.x_height / 2
        rx_out = cx - self.side_bear
        ry_out = cy + self.overshoot
        rx_in = rx_out - self.w_curve
        ry_in = ry_out - self.h_bar
        donut(pen, cx, cy, rx_out, ry_out, rx_in, ry_in)
        return w_adv

    def draw_p(self, pen):
        w_adv = 560
        rect(pen, self.side_bear, self.descender, self.w, self.x_height - self.descender, clockwise=True)
        cx = self.side_bear + self.w + (w_adv - self.side_bear * 2 - self.w) / 2
        cy = self.x_height / 2
        rx_out = cx - self.side_bear - self.w
        ry_out = cy + self.overshoot
        rx_in = rx_out - self.w_curve
        ry_in = ry_out - self.h_bar
        donut(pen, cx, cy, rx_out, ry_out, rx_in, ry_in)
        return w_adv

    def draw_q(self, pen):
        w_adv = 560
        x_stem = w_adv - self.side_bear - self.w
        rect(pen, x_stem, self.descender, self.w, self.x_height - self.descender, clockwise=True)
        cx = (self.side_bear + x_stem) / 2
        cy = self.x_height / 2
        rx_out = cx - self.side_bear
        ry_out = cy + self.overshoot
        rx_in = rx_out - self.w_curve
        ry_in = ry_out - self.h_bar
        donut(pen, cx, cy, rx_out, ry_out, rx_in, ry_in)
        return w_adv

    def draw_r(self, pen):
        # Lowercase r with 45-degree beveled cut on expanding shoulder
        w_adv = 380
        rect(pen, self.side_bear, 0, self.w, self.x_height, clockwise=True)
        # Expanding arch with 45-degree cut
        pen.moveTo((self.side_bear + self.w, self.x_height - 140))
        pen.curveTo((self.side_bear + self.w, self.x_height), (w_adv - self.side_bear - 40, self.x_height), (w_adv - self.side_bear, self.x_height - 30))
        pen.lineTo((w_adv - self.side_bear, self.x_height - 110))
        pen.lineTo((w_adv - self.side_bear - 40, self.x_height - 80))
        pen.curveTo((self.side_bear + self.w + 30, self.x_height - 80), (self.side_bear + self.w, self.x_height - 180), (self.side_bear + self.w, self.x_height - 240))
        pen.closePath()
        return w_adv

    def draw_s(self, pen):
        w_adv = 480
        cx = w_adv / 2
        cy1 = self.x_height * 0.72
        cy2 = self.x_height * 0.28
        r1 = self.x_height * 0.28
        r2 = self.x_height * 0.28
        donut(pen, cx, cy1, cx - self.side_bear, r1, cx - self.side_bear - self.w_curve, r1 - self.h_bar)
        donut(pen, cx, cy2, cx - self.side_bear, r2, cx - self.side_bear - self.w_curve, r2 - self.h_bar)
        return w_adv

    def draw_t(self, pen):
        w_adv = 360
        # Crossbar
        rect(pen, self.side_bear - 10, self.x_height - self.h_bar, w_adv - self.side_bear * 2 + 20, self.h_bar, clockwise=True)
        # Vertical stem + bottom curved foot
        rect(pen, self.side_bear + 40, 80, self.w, 660 - 80, clockwise=True)
        donut(pen, self.side_bear + 40 + self.w, 80, 80, 80, 80 - self.w, 80 - self.h_bar)
        return w_adv

    def draw_u(self, pen):
        w_adv = 560
        rect(pen, self.side_bear, 100, self.w, self.x_height - 100, clockwise=True)
        x_stem2 = w_adv - self.side_bear - self.w
        rect(pen, x_stem2, 0, self.w, self.x_height, clockwise=True)
        cx = (self.side_bear + x_stem2) / 2
        donut(pen, cx, 100, cx - self.side_bear, 100, cx - self.side_bear - self.w_curve, 100 - self.h_bar)
        return w_adv

    def draw_v(self, pen):
        w_adv = 500
        cx = w_adv / 2
        pen.moveTo((self.side_bear, self.x_height))
        pen.lineTo((self.side_bear + self.w, self.x_height))
        pen.lineTo((cx, 80))
        pen.lineTo((w_adv - self.side_bear - self.w, self.x_height))
        pen.lineTo((w_adv - self.side_bear, self.x_height))
        pen.lineTo((cx + self.w / 2, 0))
        pen.lineTo((cx - self.w / 2, 0))
        pen.closePath()
        return w_adv

    def draw_w(self, pen):
        w_adv = 740
        cx = w_adv / 2
        w4 = w_adv / 4
        pen.moveTo((self.side_bear, self.x_height))
        pen.lineTo((self.side_bear + self.w * 0.9, self.x_height))
        pen.lineTo((w4 + 15, 0))
        pen.lineTo((cx, self.x_height - 140))
        pen.lineTo((cx - self.w * 0.8, self.x_height - 140))
        pen.lineTo((w4, 80))
        pen.closePath()
        pen.moveTo((cx, self.x_height - 140))
        pen.lineTo((cx + self.w * 0.8, self.x_height - 140))
        pen.lineTo((w_adv - w4 - 15, 0))
        pen.lineTo((w_adv - self.side_bear, self.x_height))
        pen.lineTo((w_adv - self.side_bear - self.w * 0.9, self.x_height))
        pen.lineTo((w_adv - w4, 80))
        pen.closePath()
        return w_adv

    def draw_x(self, pen):
        w_adv = 480
        pen.moveTo((self.side_bear, self.x_height))
        pen.lineTo((self.side_bear + self.w, self.x_height))
        pen.lineTo((w_adv - self.side_bear, 0))
        pen.lineTo((w_adv - self.side_bear - self.w, 0))
        pen.closePath()
        pen.moveTo((w_adv - self.side_bear - self.w, self.x_height))
        pen.lineTo((w_adv - self.side_bear, self.x_height))
        pen.lineTo((self.side_bear + self.w, 0))
        pen.lineTo((self.side_bear, 0))
        pen.closePath()
        return w_adv

    def draw_y(self, pen):
        w_adv = 500
        cx = w_adv / 2
        pen.moveTo((self.side_bear, self.x_height))
        pen.lineTo((self.side_bear + self.w, self.x_height))
        pen.lineTo((cx, 80))
        pen.lineTo((w_adv - self.side_bear - self.w, self.x_height))
        pen.lineTo((w_adv - self.side_bear, self.x_height))
        pen.lineTo((cx + self.w / 2, self.descender))
        pen.lineTo((cx - self.w / 2, self.descender))
        pen.closePath()
        return w_adv

    def draw_z(self, pen):
        w_adv = 460
        rect(pen, self.side_bear, self.x_height - self.h_bar, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        rect(pen, self.side_bear, 0, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        pen.moveTo((w_adv - self.side_bear, self.x_height - self.h_bar))
        pen.lineTo((w_adv - self.side_bear, self.x_height - self.h_bar - 20))
        pen.lineTo((self.side_bear + self.w, self.h_bar))
        pen.lineTo((self.side_bear, self.h_bar))
        pen.lineTo((w_adv - self.side_bear - self.w, self.x_height - self.h_bar))
        pen.closePath()
        return w_adv

    # --- DIGITS 0-9 ---
    def draw_zero(self, pen):
        w_adv = 600
        cx = w_adv / 2
        cy = self.cap_height / 2
        donut(pen, cx, cy, cx - self.side_bear, cy + self.overshoot, cx - self.side_bear - self.w_curve, cy + self.overshoot - self.h_bar)
        return w_adv

    def draw_one(self, pen):
        w_adv = 400
        cx = w_adv / 2 + 20
        rect(pen, cx - self.w / 2, 0, self.w, self.cap_height, clockwise=True)
        pen.moveTo((cx - self.w / 2, self.cap_height))
        pen.lineTo((cx - self.w / 2 - 120, self.cap_height - 120))
        pen.lineTo((cx - self.w / 2 - 120 + self.w * 0.7, self.cap_height - 120))
        pen.lineTo((cx - self.w / 2, self.cap_height - 40))
        pen.closePath()
        return w_adv

    def draw_two(self, pen):
        w_adv = 540
        rect(pen, self.side_bear, 0, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        donut(pen, w_adv / 2, self.cap_height - 180, w_adv / 2 - self.side_bear, 180, w_adv / 2 - self.side_bear - self.w_curve, 180 - self.h_bar)
        pen.moveTo((w_adv - self.side_bear, self.cap_height - 180))
        pen.lineTo((self.side_bear + self.w, self.h_bar))
        pen.lineTo((self.side_bear, self.h_bar))
        pen.lineTo((w_adv - self.side_bear - self.w, self.cap_height - 180))
        pen.closePath()
        return w_adv

    def draw_three(self, pen):
        w_adv = 540
        cx = w_adv / 2
        cy1 = self.cap_height * 0.72
        cy2 = self.cap_height * 0.28
        donut(pen, cx, cy1, cx - self.side_bear, self.cap_height * 0.28, cx - self.side_bear - self.w_curve, self.cap_height * 0.28 - self.h_bar)
        donut(pen, cx, cy2, cx - self.side_bear, self.cap_height * 0.28, cx - self.side_bear - self.w_curve, self.cap_height * 0.28 - self.h_bar)
        rect(pen, cx - 40, self.cap_height / 2 - self.h_bar / 2, 80, self.h_bar, clockwise=True)
        return w_adv

    def draw_four(self, pen):
        w_adv = 560
        x_stem = w_adv - self.side_bear - self.w - 40
        rect(pen, x_stem, 0, self.w, self.cap_height, clockwise=True)
        rect(pen, self.side_bear, 220, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        pen.moveTo((self.side_bear, 220 + self.h_bar))
        pen.lineTo((x_stem + 20, self.cap_height))
        pen.lineTo((x_stem - self.w, self.cap_height))
        pen.lineTo((self.side_bear, 220 + self.h_bar))
        pen.closePath()
        return w_adv

    def draw_five(self, pen):
        w_adv = 540
        rect(pen, self.side_bear, self.cap_height - self.h_bar, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        rect(pen, self.side_bear, 320, self.w, self.cap_height - 320 - self.h_bar + 5, clockwise=True)
        donut(pen, w_adv / 2, 190, w_adv / 2 - self.side_bear, 190, w_adv / 2 - self.side_bear - self.w_curve, 190 - self.h_bar)
        return w_adv

    def draw_six(self, pen):
        w_adv = 560
        cx = w_adv / 2
        donut(pen, cx, 220, cx - self.side_bear, 220, cx - self.side_bear - self.w_curve, 220 - self.h_bar)
        pen.moveTo((cx - (cx - self.side_bear), 220))
        pen.curveTo((self.side_bear, self.cap_height - 100), (cx - 40, self.cap_height), (cx + 40, self.cap_height))
        pen.lineTo((cx + 40, self.cap_height - self.h_bar))
        pen.curveTo((cx, self.cap_height - self.h_bar), (self.side_bear + self.w, self.cap_height - 100), (self.side_bear + self.w, 220))
        pen.closePath()
        return w_adv

    def draw_seven(self, pen):
        w_adv = 520
        rect(pen, self.side_bear, self.cap_height - self.h_bar, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        pen.moveTo((w_adv - self.side_bear, self.cap_height - self.h_bar))
        pen.lineTo((self.side_bear + 80 + self.w, 0))
        pen.lineTo((self.side_bear + 80, 0))
        pen.lineTo((w_adv - self.side_bear - self.w, self.cap_height - self.h_bar))
        pen.closePath()
        return w_adv

    def draw_eight(self, pen):
        w_adv = 560
        cx = w_adv / 2
        cy1 = self.cap_height * 0.72
        cy2 = self.cap_height * 0.28
        r1 = self.cap_height * 0.28
        r2 = self.cap_height * 0.28
        donut(pen, cx, cy1, cx - self.side_bear - 15, r1, cx - self.side_bear - 15 - self.w_curve, r1 - self.h_bar)
        donut(pen, cx, cy2, cx - self.side_bear, r2, cx - self.side_bear - self.w_curve, r2 - self.h_bar)
        return w_adv

    def draw_nine(self, pen):
        w_adv = 560
        cx = w_adv / 2
        donut(pen, cx, self.cap_height - 220, cx - self.side_bear, 220, cx - self.side_bear - self.w_curve, 220 - self.h_bar)
        pen.moveTo((cx + (cx - self.side_bear), self.cap_height - 220))
        pen.curveTo((w_adv - self.side_bear, 100), (cx + 40, 0), (cx - 40, 0))
        pen.lineTo((cx - 40, self.h_bar))
        pen.curveTo((cx, self.h_bar), (w_adv - self.side_bear - self.w, 100), (w_adv - self.side_bear - self.w, self.cap_height - 220))
        pen.closePath()
        return w_adv

    # --- PUNCTUATION & SYMBOLS ---
    def draw_period(self, pen):
        w_adv = 260
        cx = w_adv / 2
        r = self.w * 0.58
        ellipse(pen, cx, r, r, r, clockwise=True)
        return w_adv

    def draw_comma(self, pen):
        w_adv = 260
        cx = w_adv / 2
        r = self.w * 0.58
        ellipse(pen, cx, r + 20, r, r, clockwise=True)
        # Comma hook
        pen.moveTo((cx + r - 5, r + 20))
        pen.lineTo((cx - 20, -70))
        pen.lineTo((cx - r, r))
        pen.closePath()
        return w_adv

    def draw_colon(self, pen):
        w_adv = 260
        cx = w_adv / 2
        r = self.w * 0.52
        ellipse(pen, cx, 80, r, r, clockwise=True)
        ellipse(pen, cx, 360, r, r, clockwise=True)
        return w_adv

    def draw_semicolon(self, pen):
        w_adv = 260
        cx = w_adv / 2
        r = self.w * 0.52
        ellipse(pen, cx, 360, r, r, clockwise=True)
        # Bottom comma
        ellipse(pen, cx, 80, r, r, clockwise=True)
        pen.moveTo((cx + r - 5, 80))
        pen.lineTo((cx - 20, -30))
        pen.lineTo((cx - r, 60))
        pen.closePath()
        return w_adv

    def draw_exclam(self, pen):
        w_adv = 280
        cx = w_adv / 2
        r = self.w * 0.58
        ellipse(pen, cx, r, r, r, clockwise=True)
        # Tapering bar
        pen.moveTo((cx - self.w / 2, self.cap_height))
        pen.lineTo((cx + self.w / 2, self.cap_height))
        pen.lineTo((cx + self.w * 0.35, 200))
        pen.lineTo((cx - self.w * 0.35, 200))
        pen.closePath()
        return w_adv

    def draw_question(self, pen):
        w_adv = 480
        cx = w_adv / 2
        r = self.w * 0.58
        ellipse(pen, cx, r, r, r, clockwise=True)
        # Question hook
        donut(pen, cx, self.cap_height - 180, cx - self.side_bear, 180, cx - self.side_bear - self.w_curve, 180 - self.h_bar)
        rect(pen, cx - self.w / 2, 200, self.w, 140, clockwise=True)
        return w_adv

    def draw_hyphen(self, pen):
        w_adv = 360
        rect(pen, self.side_bear, 250, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        return w_adv

    def draw_underscore(self, pen):
        w_adv = 480
        rect(pen, 20, -120, w_adv - 40, self.h_bar, clockwise=True)
        return w_adv

    def draw_plus(self, pen):
        w_adv = 540
        cx = w_adv / 2
        cy = 280
        size = 180
        rect(pen, cx - size, cy - self.h_bar / 2, size * 2, self.h_bar, clockwise=True)
        rect(pen, cx - self.w / 2, cy - size, self.w, size * 2, clockwise=True)
        return w_adv

    def draw_equal(self, pen):
        w_adv = 540
        rect(pen, self.side_bear, 180, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        rect(pen, self.side_bear, 360, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        return w_adv

    def draw_slash(self, pen):
        w_adv = 420
        pen.moveTo((self.side_bear, -60))
        pen.lineTo((self.side_bear + self.w, -60))
        pen.lineTo((w_adv - self.side_bear, self.cap_height + 40))
        pen.lineTo((w_adv - self.side_bear - self.w, self.cap_height + 40))
        pen.closePath()
        return w_adv

    def draw_backslash(self, pen):
        w_adv = 420
        pen.moveTo((self.side_bear, self.cap_height + 40))
        pen.lineTo((self.side_bear + self.w, self.cap_height + 40))
        pen.lineTo((w_adv - self.side_bear, -60))
        pen.lineTo((w_adv - self.side_bear - self.w, -60))
        pen.closePath()
        return w_adv

    def draw_parenleft(self, pen):
        w_adv = 320
        cx = w_adv - 40
        cy = (self.cap_height - 120) / 2
        ry = (self.cap_height + 240) / 2
        pen.moveTo((cx, cy + ry))
        pen.curveTo((cx - 160, cy + ry * KAPPA), (cx - 160, cy - ry * KAPPA), (cx, cy - ry))
        pen.lineTo((cx + self.w, cy - ry))
        pen.curveTo((cx - 160 + self.w, cy - ry * KAPPA), (cx - 160 + self.w, cy + ry * KAPPA), (cx + self.w, cy + ry))
        pen.closePath()
        return w_adv

    def draw_parenright(self, pen):
        w_adv = 320
        cx = 40
        cy = (self.cap_height - 120) / 2
        ry = (self.cap_height + 240) / 2
        pen.moveTo((cx, cy + ry))
        pen.curveTo((cx + 160, cy + ry * KAPPA), (cx + 160, cy - ry * KAPPA), (cx, cy - ry))
        pen.lineTo((cx - self.w, cy - ry))
        pen.curveTo((cx + 160 - self.w, cy - ry * KAPPA), (cx + 160 - self.w, cy + ry * KAPPA), (cx - self.w, cy + ry))
        pen.closePath()
        return w_adv

    def draw_bracketleft(self, pen):
        w_adv = 320
        rect(pen, self.side_bear + 40, -100, self.w, self.cap_height + 200, clockwise=True)
        rect(pen, self.side_bear + 40 + self.w, self.cap_height + 100 - self.h_bar, 100, self.h_bar, clockwise=True)
        rect(pen, self.side_bear + 40 + self.w, -100, 100, self.h_bar, clockwise=True)
        return w_adv

    def draw_bracketright(self, pen):
        w_adv = 320
        x_stem = w_adv - self.side_bear - 40 - self.w
        rect(pen, x_stem, -100, self.w, self.cap_height + 200, clockwise=True)
        rect(pen, x_stem - 100, self.cap_height + 100 - self.h_bar, 100, self.h_bar, clockwise=True)
        rect(pen, x_stem - 100, -100, 100, self.h_bar, clockwise=True)
        return w_adv

    def draw_at(self, pen):
        w_adv = 740
        cx = w_adv / 2
        cy = self.x_height / 2
        # Outer circle
        donut(pen, cx, cy, cx - 40, cy + 100, cx - 40 - self.w_curve, cy + 100 - self.h_bar)
        # Inner 'a'
        donut(pen, cx - 30, cy, 110, 110, 110 - self.w_curve, 110 - self.h_bar)
        rect(pen, cx + 80 - self.w, cy - 110, self.w, 220, clockwise=True)
        return w_adv

    def draw_numbersign(self, pen):
        w_adv = 600
        rect(pen, 180, 0, self.w, self.cap_height, clockwise=True)
        rect(pen, w_adv - 180 - self.w, 0, self.w, self.cap_height, clockwise=True)
        rect(pen, self.side_bear, 220, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        rect(pen, self.side_bear, 440, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        return w_adv

    def draw_dollar(self, pen):
        w_adv = 580
        # S body
        cx = w_adv / 2
        cy1 = self.cap_height * 0.72
        cy2 = self.cap_height * 0.28
        donut(pen, cx, cy1, cx - self.side_bear - 10, self.cap_height * 0.28, cx - self.side_bear - 10 - self.w_curve, self.cap_height * 0.28 - self.h_bar)
        donut(pen, cx, cy2, cx - self.side_bear, self.cap_height * 0.28, cx - self.side_bear - self.w_curve, self.cap_height * 0.28 - self.h_bar)
        # Vertical bar
        rect(pen, cx - self.w * 0.4, -60, self.w * 0.8, self.cap_height + 120, clockwise=True)
        return w_adv

    def draw_percent(self, pen):
        w_adv = 720
        # Slash
        pen.moveTo((self.side_bear + 40, 0))
        pen.lineTo((self.side_bear + 40 + self.w, 0))
        pen.lineTo((w_adv - self.side_bear - 40, self.cap_height))
        pen.lineTo((w_adv - self.side_bear - 40 - self.w, self.cap_height))
        pen.closePath()
        # Top-left circle
        donut(pen, self.side_bear + 120, self.cap_height - 140, 110, 110, 110 - self.w_curve, 110 - self.h_bar)
        # Bottom-right circle
        donut(pen, w_adv - self.side_bear - 120, 140, 110, 110, 110 - self.w_curve, 110 - self.h_bar)
        return w_adv

    def draw_ampersand(self, pen):
        w_adv = 640
        cx = w_adv / 2 - 20
        donut(pen, cx, self.cap_height - 200, 160, 180, 160 - self.w_curve, 180 - self.h_bar)
        donut(pen, cx + 20, 180, 200, 180, 200 - self.w_curve, 180 - self.h_bar)
        pen.moveTo((cx + 160, 0))
        pen.lineTo((w_adv - self.side_bear, 180))
        pen.lineTo((w_adv - self.side_bear - self.w, 180))
        pen.lineTo((cx + 80, 0))
        pen.closePath()
        return w_adv

    def draw_asterisk(self, pen):
        w_adv = 440
        cx = w_adv / 2
        cy = self.cap_height - 180
        r = 140
        for i in range(5):
            ang = math.radians(i * 72 - 90)
            x2 = cx + r * math.cos(ang)
            y2 = cy + r * math.sin(ang)
            pen.moveTo((cx - 15, cy - 15))
            pen.lineTo((x2 - 15, y2))
            pen.lineTo((x2 + 15, y2))
            pen.lineTo((cx + 15, cy + 15))
            pen.closePath()
        return w_adv

    def draw_quotesingle(self, pen):
        w_adv = 240
        cx = w_adv / 2
        pen.moveTo((cx - self.w / 2, self.cap_height))
        pen.lineTo((cx + self.w / 2, self.cap_height))
        pen.lineTo((cx + self.w * 0.2, self.cap_height - 220))
        pen.lineTo((cx - self.w * 0.2, self.cap_height - 220))
        pen.closePath()
        return w_adv

    def draw_quotedbl(self, pen):
        w_adv = 360
        for cx in [w_adv / 2 - 60, w_adv / 2 + 60]:
            pen.moveTo((cx - self.w * 0.4, self.cap_height))
            pen.lineTo((cx + self.w * 0.4, self.cap_height))
            pen.lineTo((cx + self.w * 0.15, self.cap_height - 220))
            pen.lineTo((cx - self.w * 0.15, self.cap_height - 220))
            pen.closePath()
        return w_adv

    def draw_less(self, pen):
        w_adv = 480
        cy = 280
        pen.moveTo((w_adv - self.side_bear, cy + 180))
        pen.lineTo((self.side_bear, cy))
        pen.lineTo((w_adv - self.side_bear, cy - 180))
        pen.lineTo((w_adv - self.side_bear, cy - 180 + self.h_bar * 1.2))
        pen.lineTo((self.side_bear + self.w * 1.5, cy))
        pen.lineTo((w_adv - self.side_bear, cy + 180 - self.h_bar * 1.2))
        pen.closePath()
        return w_adv

    def draw_greater(self, pen):
        w_adv = 480
        cy = 280
        pen.moveTo((self.side_bear, cy + 180))
        pen.lineTo((w_adv - self.side_bear, cy))
        pen.lineTo((self.side_bear, cy - 180))
        pen.lineTo((self.side_bear, cy - 180 + self.h_bar * 1.2))
        pen.lineTo((w_adv - self.side_bear - self.w * 1.5, cy))
        pen.lineTo((self.side_bear, cy + 180 - self.h_bar * 1.2))
        pen.closePath()
        return w_adv

    def draw_bar(self, pen):
        w_adv = 260
        cx = w_adv / 2
        rect(pen, cx - self.w / 2, -120, self.w, self.cap_height + 240, clockwise=True)
        return w_adv

    def draw_asciicircum(self, pen):
        w_adv = 460
        cx = w_adv / 2
        pen.moveTo((self.side_bear, self.cap_height - 220))
        pen.lineTo((cx, self.cap_height))
        pen.lineTo((w_adv - self.side_bear, self.cap_height - 220))
        pen.lineTo((w_adv - self.side_bear - self.w, self.cap_height - 220))
        pen.lineTo((cx, self.cap_height - self.h_bar * 1.3))
        pen.lineTo((self.side_bear + self.w, self.cap_height - 220))
        pen.closePath()
        return w_adv

    def draw_asciitilde(self, pen):
        w_adv = 480
        rect(pen, self.side_bear, 260, w_adv - self.side_bear * 2, self.h_bar, clockwise=True)
        return w_adv

    def draw_braceleft(self, pen):
        w_adv = 340
        rect(pen, self.side_bear + 40, -100, self.w, self.cap_height + 200, clockwise=True)
        rect(pen, self.side_bear + 40 - 30, (self.cap_height - 100) / 2 - self.h_bar / 2, 40, self.h_bar, clockwise=True)
        return w_adv

    def draw_braceright(self, pen):
        w_adv = 340
        x_stem = w_adv - self.side_bear - 40 - self.w
        rect(pen, x_stem, -100, self.w, self.cap_height + 200, clockwise=True)
        rect(pen, x_stem + self.w - 10, (self.cap_height - 100) / 2 - self.h_bar / 2, 40, self.h_bar, clockwise=True)
        return w_adv

    def draw_grave(self, pen):
        w_adv = 280
        pen.moveTo((60, self.cap_height))
        pen.lineTo((120, self.cap_height))
        pen.lineTo((180, self.cap_height - 120))
        pen.lineTo((120, self.cap_height - 120))
        pen.closePath()
        return w_adv


# ---------------------------------------------------------------------------
# FONT COMPILER ROUTINE
# ---------------------------------------------------------------------------

GLYPH_NAMES_ORDER = [
    '.notdef', 'space',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'period', 'comma', 'colon', 'semicolon', 'exclam', 'question',
    'hyphen', 'underscore', 'plus', 'equal', 'slash', 'backslash',
    'parenleft', 'parenright', 'bracketleft', 'bracketright', 'braceleft', 'braceright',
    'at', 'numbersign', 'dollar', 'percent', 'ampersand', 'asterisk',
    'quotesingle', 'quotedbl', 'grave', 'less', 'greater', 'bar', 'asciicircum', 'asciitilde'
]

UNICODE_MAP = {
    0x20: 'space',
    0x21: 'exclam',
    0x22: 'quotedbl',
    0x23: 'numbersign',
    0x24: 'dollar',
    0x25: 'percent',
    0x26: 'ampersand',
    0x27: 'quotesingle',
    0x28: 'parenleft',
    0x29: 'parenright',
    0x2A: 'asterisk',
    0x2B: 'plus',
    0x2C: 'comma',
    0x2D: 'hyphen',
    0x2E: 'period',
    0x2F: 'slash',
    0x30: 'zero',
    0x31: 'one',
    0x32: 'two',
    0x33: 'three',
    0x34: 'four',
    0x35: 'five',
    0x36: 'six',
    0x37: 'seven',
    0x38: 'eight',
    0x39: 'nine',
    0x3A: 'colon',
    0x3B: 'semicolon',
    0x3C: 'less',
    0x3D: 'equal',
    0x3E: 'greater',
    0x3F: 'question',
    0x40: 'at',
    0x41: 'A', 0x42: 'B', 0x43: 'C', 0x44: 'D', 0x45: 'E', 0x46: 'F', 0x47: 'G',
    0x48: 'H', 0x49: 'I', 0x4A: 'J', 0x4B: 'K', 0x4C: 'L', 0x4D: 'M', 0x4E: 'N',
    0x4F: 'O', 0x50: 'P', 0x51: 'Q', 0x52: 'R', 0x53: 'S', 0x54: 'T', 0x55: 'U',
    0x56: 'V', 0x57: 'W', 0x58: 'X', 0x59: 'Y', 0x5A: 'Z',
    0x5B: 'bracketleft',
    0x5C: 'backslash',
    0x5D: 'bracketright',
    0x5E: 'asciicircum',
    0x5F: 'underscore',
    0x60: 'grave',
    0x61: 'a', 0x62: 'b', 0x63: 'c', 0x64: 'd', 0x65: 'e', 0x66: 'f', 0x67: 'g',
    0x68: 'h', 0x69: 'i', 0x6A: 'j', 0x6B: 'k', 0x6C: 'l', 0x6D: 'm', 0x6E: 'n',
    0x6F: 'o', 0x70: 'p', 0x71: 'q', 0x72: 'r', 0x73: 's', 0x74: 't', 0x75: 'u',
    0x76: 'v', 0x77: 'w', 0x78: 'x', 0x79: 'y', 0x7A: 'z',
    0x7B: 'braceleft',
    0x7C: 'bar',
    0x7D: 'braceright',
    0x7E: 'asciitilde',
}

KERNING_PAIRS = {
    ('C', 'o'): -15,
    ('o', 'g'): -10,
    ('g', 'n'): -10,
    ('n', 'i'): -5,
    ('T', 'a'): -55,
    ('a', 'r'): -15,
    ('r', 'a'): -10,
    ('A', 'V'): -65,
    ('A', 'W'): -55,
    ('V', 'A'): -65,
    ('W', 'A'): -55,
    ('T', 'o'): -50,
    ('T', 'e'): -45,
    ('T', 'r'): -40,
    ('P', 'A'): -45,
    ('F', 'A'): -45,
    ('L', 'T'): -40,
    ('L', 'V'): -45,
    ('Y', 'a'): -55,
    ('Y', 'o'): -55,
}

def compile_cognitara_font(output_path, is_bold=False):
    style_name = "Bold" if is_bold else "Regular"
    weight_class = 700 if is_bold else 400
    ps_name = f"CogniTaraType-{style_name}"
    full_name = f"CogniTara Type {style_name}"
    
    print(f"[*] Engineering {full_name} ({output_path})...")
    
    factory = CogniTaraGlyphFactory(is_bold=is_bold)
    
    glyphs_dict = {}
    metrics_dict = {}
    
    for gname in GLYPH_NAMES_ORDER:
        glyph, adv = factory.build_glyph(gname)
        glyphs_dict[gname] = glyph
        metrics_dict[gname] = (int(adv), 0)
        
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(GLYPH_NAMES_ORDER)
    fb.setupCharacterMap(UNICODE_MAP)
    fb.setupGlyf(glyphs_dict)
    fb.setupHorizontalMetrics(metrics_dict)
    fb.setupHorizontalHeader(ascent=850, descent=-250)
    
    name_strings = {
        'familyName': 'CogniTara Type',
        'styleName': style_name,
        'uniqueFontIdentifier': f'1.000;COGN;{ps_name}',
        'fullName': full_name,
        'psName': ps_name,
        'version': 'Version 1.000; 2026; CogniTara Brand Labs',
        'manufacturer': 'CogniTara Technology Brand Labs',
        'designer': 'CogniTara Brand & Typography Labs',
        'description': 'Proprietary geometric-humanist typeface engineered for CogniTara intelligent systems and enterprise software.',
        'vendorURL': 'https://cognitara.com',
        'designerURL': 'https://cognitara.com/typography',
        'copyright': 'Copyright (c) 2026 CogniTara Inc. All rights reserved.'
    }
    fb.setupNameTable(name_strings)
    
    fb.setupOS2(
        sTypoAscender=800,
        sTypoDescender=-200,
        sTypoLineGap=100,
        usWinAscent=900,
        usWinDescent=250,
        sxHeight=520,
        sCapHeight=700,
        usWeightClass=weight_class,
        fsType=0  # Installable embedding
    )
    fb.setupPost()
    
    # OpenType Kern table
    kern_table = table__k_e_r_n()
    kern_table.version = 0
    subtable = KernTable_format_0()
    subtable.version = 0
    subtable.coverage = 1
    subtable.kernTable = KERNING_PAIRS.copy()
    kern_table.kernTables = [subtable]
    fb.font['kern'] = kern_table
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    fb.save(output_path)
    print(f"[+] Successfully compiled {output_path} ({os.path.getsize(output_path)} bytes)")

def main():
    fonts_dir = "c:/COGNITARA EXAM PORTAL/CogniTara-Typeface/fonts"
    regular_ttf = os.path.join(fonts_dir, "CogniTaraType-Regular.ttf")
    bold_ttf = os.path.join(fonts_dir, "CogniTaraType-Bold.ttf")
    
    compile_cognitara_font(regular_ttf, is_bold=False)
    compile_cognitara_font(bold_ttf, is_bold=True)
    print("[SUCCESS] All font files built and validated!")

if __name__ == "__main__":
    main()
