"""
generate_type_specimens.py
Generates comprehensive visual typography specimen sheets for CogniTara Type:
1. cognitara_type_specimen_full.svg: Complete character set, anatomy, metrics, and scale
2. cognitara_type_in_context.svg: Real-world enterprise UI, dashboard, code, and portal applications
Converts both to high-resolution PNG and native .vectorcraft using vectorcraft-cli.
"""

import os
import subprocess

def build_full_specimen_svg():
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 2200" width="1600" height="2200">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;family=JetBrains+Mono:wght@400;500;600&amp;display=swap');
      @font-face {
        font-family: 'CogniTara Type';
        src: url('../fonts/CogniTaraType-Regular.woff2') format('woff2'),
             url('../fonts/CogniTaraType-Regular.ttf') format('truetype');
        font-weight: 400;
      }
      @font-face {
        font-family: 'CogniTara Type';
        src: url('../fonts/CogniTaraType-Bold.woff2') format('woff2'),
             url('../fonts/CogniTaraType-Bold.ttf') format('truetype');
        font-weight: 700;
      }

      .ct-title { font-family: 'CogniTara Type', 'Plus Jakarta Sans', sans-serif; font-weight: 700; fill: #FFFFFF; }
      .ct-body { font-family: 'CogniTara Type', 'Plus Jakarta Sans', sans-serif; font-weight: 400; fill: #CBD5E1; }
      .mono-tag { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; fill: #00D2FF; letter-spacing: 1.5px; }
      .mono-meta { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 500; fill: #64748B; }
      .mono-val { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; fill: #38BDF8; }
      .spec-h2 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 20px; font-weight: 700; fill: #FFFFFF; letter-spacing: -0.2px; }
      .spec-desc { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13.5px; font-weight: 400; fill: #94A3B8; line-height: 1.5; }
      .glyph-char { font-family: 'CogniTara Type', 'Plus Jakarta Sans', sans-serif; font-size: 34px; font-weight: 700; fill: #FFFFFF; text-anchor: middle; }
      .glyph-char-reg { font-family: 'CogniTara Type', 'Plus Jakarta Sans', sans-serif; font-size: 34px; font-weight: 400; fill: #E2E8F0; text-anchor: middle; }
      .glyph-code { font-family: 'JetBrains Mono', monospace; font-size: 10px; fill: #64748B; text-anchor: middle; }
    </style>
  </defs>

  <!-- Deep Midnight Navy Canvas -->
  <rect width="100%" height="100%" fill="#070A13"/>
  <circle cx="1450" cy="200" r="450" fill="#00D2FF" opacity="0.03"/>
  <circle cx="150" cy="1100" r="500" fill="#0066FF" opacity="0.03"/>
  <circle cx="1400" cy="1800" r="400" fill="#00D2FF" opacity="0.02"/>

  <!-- ========================================================================= -->
  <!-- 1. HEADER & BRAND TYPOGRAPHY STATEMENT -->
  <!-- ========================================================================= -->
  <g transform="translate(80, 80)">
    <rect x="0" y="0" width="195" height="28" rx="14" fill="#121829" stroke="#00D2FF" stroke-width="1" stroke-opacity="0.4"/>
    <circle cx="16" cy="14" r="4" fill="#00D2FF"/>
    <text x="28" y="18" class="mono-tag">TYPE SPECIFICATION</text>

    <text x="0" y="80" class="ct-title" font-size="54" letter-spacing="-1.5">CogniTara Type</text>
    <text x="0" y="115" class="spec-desc" font-size="16">
      A proprietary geometric-humanist typeface engineered for CogniTara intelligent systems, cognitive software, and enterprise infrastructure.
    </text>

    <!-- Metadata Badges Bar -->
    <g transform="translate(0, 145)">
      <rect x="0" y="0" width="1440" height="56" rx="12" fill="#0D1322" stroke="#1E293B" stroke-width="1"/>
      <text x="30" y="33" class="mono-meta">VERSION: <tspan class="mono-val">1.000</tspan></text>
      <text x="180" y="33" class="mono-meta">CLASSIFICATION: <tspan class="mono-val">ORGANIC GEOMETRIC</tspan></text>
      <text x="440" y="33" class="mono-meta">WEIGHTS: <tspan class="mono-val">REGULAR (400) · BOLD (700)</tspan></text>
      <text x="750" y="33" class="mono-meta">GRID: <tspan class="mono-val">1000 UPM · CAP 700 · X-HEIGHT 520</tspan></text>
      <text x="1110" y="33" class="mono-meta">DNA: <tspan class="mono-val">45° RADIAL CUTS · TARA TITTLE</tspan></text>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- 2. ANATOMY & BRAND DNA HERO HIGHLIGHTS -->
  <!-- ========================================================================= -->
  <g transform="translate(80, 340)">
    <rect width="1440" height="340" rx="18" fill="#0D1322" stroke="#1E293B" stroke-width="1"/>
    
    <text x="40" y="45" class="spec-h2">Anatomy &amp; Brand DNA</text>
    <text x="40" y="70" class="spec-desc">
      How the approved Luminary C symbol and Tara beacon star directly generate the underlying geometry of the typeface.
    </text>

    <!-- Feature 1: The Luminary C Heritage -->
    <g transform="translate(40, 100)">
      <rect width="430" height="205" rx="12" fill="#121829" stroke="#1E293B" stroke-width="1"/>
      <!-- Giant C glyph with 45-degree angle guides -->
      <g transform="translate(60, 150)">
        <text font-family="'CogniTara Type', 'Plus Jakarta Sans', sans-serif" font-size="140" font-weight="700" fill="#FFFFFF">C</text>
        <!-- 45-degree guide line -->
        <line x1="75" y1="-85" x2="115" y2="-125" stroke="#00D2FF" stroke-width="2" stroke-dasharray="3 3"/>
        <line x1="75" y1="5" x2="115" y2="45" stroke="#00D2FF" stroke-width="2" stroke-dasharray="3 3"/>
      </g>
      <g transform="translate(190, 50)">
        <text class="mono-tag" font-size="10">DNA MOTIF 01</text>
        <text font-family="'Plus Jakarta Sans', sans-serif" font-size="16" font-weight="700" fill="#FFFFFF" y="24">45° Radial Cuts</text>
        <text class="spec-desc" font-size="12" y="48">
          Terminals of uppercase C, G, and lowercase c, e, r terminate in precise 45° cuts pointing to origin, matching the approved brand mark.
        </text>
      </g>
    </g>

    <!-- Feature 2: The Tara Beacon Tittle -->
    <g transform="translate(505, 100)">
      <rect width="430" height="205" rx="12" fill="#121829" stroke="#1E293B" stroke-width="1"/>
      <g transform="translate(60, 150)">
        <text font-family="'CogniTara Type', 'Plus Jakarta Sans', sans-serif" font-size="140" font-weight="700" fill="#FFFFFF">i</text>
        <!-- Highlight around tittle -->
        <circle cx="58" cy="-115" r="22" fill="none" stroke="#00D2FF" stroke-width="1.5" stroke-dasharray="2 2"/>
      </g>
      <g transform="translate(190, 50)">
        <text class="mono-tag" font-size="10">DNA MOTIF 02</text>
        <text font-family="'Plus Jakarta Sans', sans-serif" font-size="16" font-weight="700" fill="#FFFFFF" y="24">Tara Beacon Tittle</text>
        <text class="spec-desc" font-size="12" y="48">
          The dot on 'i' and 'j' is engineered as a bespoke 4-point concave star beacon, echoing the Tara guidance signal without decorative clutter.
        </text>
      </g>
    </g>

    <!-- Feature 3: G2 Circular Counters -->
    <g transform="translate(970, 100)">
      <rect width="430" height="205" rx="12" fill="#121829" stroke="#1E293B" stroke-width="1"/>
      <g transform="translate(60, 150)">
        <text font-family="'CogniTara Type', 'Plus Jakarta Sans', sans-serif" font-size="140" font-weight="700" fill="#FFFFFF">o</text>
        <!-- Circle guide -->
        <circle cx="68" cy="-45" r="54" fill="none" stroke="#00D2FF" stroke-width="1.5" stroke-dasharray="3 3"/>
      </g>
      <g transform="translate(190, 50)">
        <text class="mono-tag" font-size="10">DNA MOTIF 03</text>
        <text font-family="'Plus Jakarta Sans', sans-serif" font-size="16" font-weight="700" fill="#FFFFFF" y="24">G2 Optical Balance</text>
        <text class="spec-desc" font-size="12" y="48">
          Pure geometric outer arcs paired with compensated inner counters ensure perfect clarity across low-DPI displays and high-resolution print.
        </text>
      </g>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- 3. COMPLETE GLYPH TABLE - UPPERCASE A-Z -->
  <!-- ========================================================================= -->
  <g transform="translate(80, 720)">
    <rect width="1440" height="290" rx="18" fill="#0D1322" stroke="#1E293B" stroke-width="1"/>
    <text x="40" y="45" class="spec-h2">Uppercase Latin (A–Z) · Bold &amp; Regular Weights</text>
    <text x="40" y="70" class="spec-desc">Structured, architectural proportions with uniform optical rhythm.</text>

    <!-- Row 1: A-M (13 columns) -->
    <g transform="translate(40, 100)">
      <!-- A through M -->
      <g transform="translate(0, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">A</text><text x="49" y="68" class="glyph-code">U+0041</text></g>
      <g transform="translate(105, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">B</text><text x="49" y="68" class="glyph-code">U+0042</text></g>
      <g transform="translate(210, 0)"><rect width="98" height="75" rx="8" fill="#121829" stroke="#00D2FF" stroke-width="1.5"/><text x="49" y="48" class="glyph-char" fill="#00D2FF">C</text><text x="49" y="68" class="glyph-code">U+0043</text></g>
      <g transform="translate(315, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">D</text><text x="49" y="68" class="glyph-code">U+0044</text></g>
      <g transform="translate(420, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">E</text><text x="49" y="68" class="glyph-code">U+0045</text></g>
      <g transform="translate(525, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">F</text><text x="49" y="68" class="glyph-code">U+0046</text></g>
      <g transform="translate(630, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">G</text><text x="49" y="68" class="glyph-code">U+0047</text></g>
      <g transform="translate(735, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">H</text><text x="49" y="68" class="glyph-code">U+0048</text></g>
      <g transform="translate(840, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">I</text><text x="49" y="68" class="glyph-code">U+0049</text></g>
      <g transform="translate(945, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">J</text><text x="49" y="68" class="glyph-code">U+004A</text></g>
      <g transform="translate(1050, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">K</text><text x="49" y="68" class="glyph-code">U+004B</text></g>
      <g transform="translate(1155, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">L</text><text x="49" y="68" class="glyph-code">U+004C</text></g>
      <g transform="translate(1260, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">M</text><text x="49" y="68" class="glyph-code">U+004D</text></g>
    </g>

    <!-- Row 2: N-Z (13 columns) -->
    <g transform="translate(40, 185)">
      <g transform="translate(0, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">N</text><text x="49" y="68" class="glyph-code">U+004E</text></g>
      <g transform="translate(105, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">O</text><text x="49" y="68" class="glyph-code">U+004F</text></g>
      <g transform="translate(210, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">P</text><text x="49" y="68" class="glyph-code">U+0050</text></g>
      <g transform="translate(315, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">Q</text><text x="49" y="68" class="glyph-code">U+0051</text></g>
      <g transform="translate(420, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">R</text><text x="49" y="68" class="glyph-code">U+0052</text></g>
      <g transform="translate(525, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">S</text><text x="49" y="68" class="glyph-code">U+0053</text></g>
      <g transform="translate(630, 0)"><rect width="98" height="75" rx="8" fill="#121829" stroke="#00D2FF" stroke-width="1.5"/><text x="49" y="48" class="glyph-char" fill="#00D2FF">T</text><text x="49" y="68" class="glyph-code">U+0054</text></g>
      <g transform="translate(735, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">U</text><text x="49" y="68" class="glyph-code">U+0055</text></g>
      <g transform="translate(840, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">V</text><text x="49" y="68" class="glyph-code">U+0056</text></g>
      <g transform="translate(945, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">W</text><text x="49" y="68" class="glyph-code">U+0057</text></g>
      <g transform="translate(1050, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">X</text><text x="49" y="68" class="glyph-code">U+0058</text></g>
      <g transform="translate(1155, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">Y</text><text x="49" y="68" class="glyph-code">U+0059</text></g>
      <g transform="translate(1260, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char">Z</text><text x="49" y="68" class="glyph-code">U+005A</text></g>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- 4. COMPLETE GLYPH TABLE - LOWERCASE a-z -->
  <!-- ========================================================================= -->
  <g transform="translate(80, 1040)">
    <rect width="1440" height="290" rx="18" fill="#0D1322" stroke="#1E293B" stroke-width="1"/>
    <text x="40" y="45" class="spec-h2">Lowercase Latin (a–z) · High-Contrast Geometric</text>
    <text x="40" y="70" class="spec-desc">Engineered for long-form reading, UI dashboards, code interfaces, and micro-typography.</text>

    <!-- Row 1: a-m -->
    <g transform="translate(40, 100)">
      <g transform="translate(0, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">a</text><text x="49" y="68" class="glyph-code">U+0061</text></g>
      <g transform="translate(105, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">b</text><text x="49" y="68" class="glyph-code">U+0062</text></g>
      <g transform="translate(210, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">c</text><text x="49" y="68" class="glyph-code">U+0063</text></g>
      <g transform="translate(315, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">d</text><text x="49" y="68" class="glyph-code">U+0064</text></g>
      <g transform="translate(420, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">e</text><text x="49" y="68" class="glyph-code">U+0065</text></g>
      <g transform="translate(525, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">f</text><text x="49" y="68" class="glyph-code">U+0066</text></g>
      <g transform="translate(630, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">g</text><text x="49" y="68" class="glyph-code">U+0067</text></g>
      <g transform="translate(735, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">h</text><text x="49" y="68" class="glyph-code">U+0068</text></g>
      <g transform="translate(840, 0)"><rect width="98" height="75" rx="8" fill="#121829" stroke="#00D2FF" stroke-width="1.5"/><text x="49" y="48" class="glyph-char-reg" fill="#00D2FF">i</text><text x="49" y="68" class="glyph-code">U+0069</text></g>
      <g transform="translate(945, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">j</text><text x="49" y="68" class="glyph-code">U+006A</text></g>
      <g transform="translate(1050, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">k</text><text x="49" y="68" class="glyph-code">U+006B</text></g>
      <g transform="translate(1155, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">l</text><text x="49" y="68" class="glyph-code">U+006C</text></g>
      <g transform="translate(1260, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">m</text><text x="49" y="68" class="glyph-code">U+006D</text></g>
    </g>

    <!-- Row 2: n-z -->
    <g transform="translate(40, 185)">
      <g transform="translate(0, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">n</text><text x="49" y="68" class="glyph-code">U+006E</text></g>
      <g transform="translate(105, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">o</text><text x="49" y="68" class="glyph-code">U+006F</text></g>
      <g transform="translate(210, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">p</text><text x="49" y="68" class="glyph-code">U+0070</text></g>
      <g transform="translate(315, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">q</text><text x="49" y="68" class="glyph-code">U+0071</text></g>
      <g transform="translate(420, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">r</text><text x="49" y="68" class="glyph-code">U+0072</text></g>
      <g transform="translate(525, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">s</text><text x="49" y="68" class="glyph-code">U+0073</text></g>
      <g transform="translate(630, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">t</text><text x="49" y="68" class="glyph-code">U+0074</text></g>
      <g transform="translate(735, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">u</text><text x="49" y="68" class="glyph-code">U+0075</text></g>
      <g transform="translate(840, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">v</text><text x="49" y="68" class="glyph-code">U+0076</text></g>
      <g transform="translate(945, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">w</text><text x="49" y="68" class="glyph-code">U+0077</text></g>
      <g transform="translate(1050, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">x</text><text x="49" y="68" class="glyph-code">U+0078</text></g>
      <g transform="translate(1155, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">y</text><text x="49" y="68" class="glyph-code">U+0079</text></g>
      <g transform="translate(1260, 0)"><rect width="98" height="75" rx="8" fill="#121829"/><text x="49" y="48" class="glyph-char-reg">z</text><text x="49" y="68" class="glyph-code">U+007A</text></g>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- 5. NUMERALS & ESSENTIAL SYMBOLS -->
  <!-- ========================================================================= -->
  <g transform="translate(80, 1360)">
    <rect width="1440" height="230" rx="18" fill="#0D1322" stroke="#1E293B" stroke-width="1"/>
    <text x="40" y="45" class="spec-h2">Numerals (0–9) &amp; Punctuation</text>
    <text x="40" y="70" class="spec-desc">Proportional figures designed for financial interfaces, cognitive metric displays, and code.</text>

    <!-- Digits 0-9 -->
    <g transform="translate(40, 95)">
      <g transform="translate(0, 0)"><rect width="80" height="70" rx="8" fill="#121829"/><text x="40" y="46" class="glyph-char">0</text><text x="40" y="64" class="glyph-code">U+0030</text></g>
      <g transform="translate(88, 0)"><rect width="80" height="70" rx="8" fill="#121829"/><text x="40" y="46" class="glyph-char">1</text><text x="40" y="64" class="glyph-code">U+0031</text></g>
      <g transform="translate(176, 0)"><rect width="80" height="70" rx="8" fill="#121829"/><text x="40" y="46" class="glyph-char">2</text><text x="40" y="64" class="glyph-code">U+0032</text></g>
      <g transform="translate(264, 0)"><rect width="80" height="70" rx="8" fill="#121829"/><text x="40" y="46" class="glyph-char">3</text><text x="40" y="64" class="glyph-code">U+0033</text></g>
      <g transform="translate(352, 0)"><rect width="80" height="70" rx="8" fill="#121829"/><text x="40" y="46" class="glyph-char">4</text><text x="40" y="64" class="glyph-code">U+0034</text></g>
      <g transform="translate(440, 0)"><rect width="80" height="70" rx="8" fill="#121829"/><text x="40" y="46" class="glyph-char">5</text><text x="40" y="64" class="glyph-code">U+0035</text></g>
      <g transform="translate(528, 0)"><rect width="80" height="70" rx="8" fill="#121829"/><text x="40" y="46" class="glyph-char">6</text><text x="40" y="64" class="glyph-code">U+0036</text></g>
      <g transform="translate(616, 0)"><rect width="80" height="70" rx="8" fill="#121829"/><text x="40" y="46" class="glyph-char">7</text><text x="40" y="64" class="glyph-code">U+0037</text></g>
      <g transform="translate(704, 0)"><rect width="80" height="70" rx="8" fill="#121829"/><text x="40" y="46" class="glyph-char">8</text><text x="40" y="64" class="glyph-code">U+0038</text></g>
      <g transform="translate(792, 0)"><rect width="80" height="70" rx="8" fill="#121829"/><text x="40" y="46" class="glyph-char">9</text><text x="40" y="64" class="glyph-code">U+0039</text></g>
      
      <!-- Punctuation -->
      <g transform="translate(900, 0)"><rect width="65" height="70" rx="8" fill="#151E33"/><text x="32" y="46" class="glyph-char-reg">.</text></g>
      <g transform="translate(975, 0)"><rect width="65" height="70" rx="8" fill="#151E33"/><text x="32" y="46" class="glyph-char-reg">,</text></g>
      <g transform="translate(1050, 0)"><rect width="65" height="70" rx="8" fill="#151E33"/><text x="32" y="46" class="glyph-char-reg">:</text></g>
      <g transform="translate(1125, 0)"><rect width="65" height="70" rx="8" fill="#151E33"/><text x="32" y="46" class="glyph-char-reg">;</text></g>
      <g transform="translate(1200, 0)"><rect width="65" height="70" rx="8" fill="#151E33"/><text x="32" y="46" class="glyph-char-reg">!</text></g>
      <g transform="translate(1275, 0)"><rect width="65" height="70" rx="8" fill="#151E33"/><text x="32" y="46" class="glyph-char-reg">?</text></g>
      <g transform="translate(1350, 0)"><rect width="65" height="70" rx="8" fill="#151E33"/><text x="32" y="46" class="glyph-char-reg">/</text></g>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- 6. TYPOGRAPHIC SCALE HIERARCHY -->
  <!-- ========================================================================= -->
  <g transform="translate(80, 1620)">
    <rect width="1440" height="480" rx="18" fill="#0D1322" stroke="#1E293B" stroke-width="1"/>
    <text x="40" y="45" class="spec-h2">Typographic Scale &amp; Performance Hierarchy</text>
    <text x="40" y="70" class="spec-desc">Visual scale progression testing contrast, optical weight, and kerning harmony across optical sizes.</text>

    <g transform="translate(40, 105)">
      <!-- 64pt Display -->
      <g transform="translate(0, 0)">
        <text class="mono-meta" y="32">64PT DISPLAY</text>
        <text x="180" y="42" font-family="'CogniTara Type', 'Plus Jakarta Sans', sans-serif" font-size="56" font-weight="700" fill="#FFFFFF" letter-spacing="-1.5">
          Cognitive Cloud Infrastructure
        </text>
      </g>
      <line x1="0" y1="65" x2="1360" y2="65" stroke="#1E293B" stroke-width="1"/>

      <!-- 42pt Title -->
      <g transform="translate(0, 85)">
        <text class="mono-meta" y="24">42PT TITLE</text>
        <text x="180" y="28" font-family="'CogniTara Type', 'Plus Jakarta Sans', sans-serif" font-size="38" font-weight="700" fill="#FFFFFF" letter-spacing="-0.8">
          Intelligent Systems Powered by Neural Geometry
        </text>
      </g>
      <line x1="0" y1="135" x2="1360" y2="135" stroke="#1E293B" stroke-width="1"/>

      <!-- 28pt Headline -->
      <g transform="translate(0, 155)">
        <text class="mono-meta" y="20">28PT HEADLINE</text>
        <text x="180" y="22" font-family="'CogniTara Type', 'Plus Jakarta Sans', sans-serif" font-size="26" font-weight="600" fill="#38BDF8">
          The Guiding Star for Secure Educational Assessments &amp; Analytics
        </text>
      </g>
      <line x1="0" y1="195" x2="1360" y2="195" stroke="#1E293B" stroke-width="1"/>

      <!-- 18pt Subhead -->
      <g transform="translate(0, 215)">
        <text class="mono-meta" y="16">18PT SUBHEAD</text>
        <text x="180" y="18" font-family="'CogniTara Type', 'Plus Jakarta Sans', sans-serif" font-size="18" font-weight="500" fill="#CBD5E1">
          Engineered for international scalability with zero visual distortion across edge displays, desktop browsers, and mobile devices.
        </text>
      </g>
      <line x1="0" y1="250" x2="1360" y2="250" stroke="#1E293B" stroke-width="1"/>

      <!-- 14pt Body -->
      <g transform="translate(0, 270)">
        <text class="mono-meta" y="14">14PT BODY</text>
        <text x="180" y="16" font-family="'CogniTara Type', 'Plus Jakarta Sans', sans-serif" font-size="14" font-weight="400" fill="#94A3B8" width="1180">
          CogniTara Type was conceived from the geometric blueprint of our core brand symbol: the Luminary C with its 45-degree radial terminals, and the Tara star beacon. Every contour is tuned for sustained optical comfort, cognitive clarity, and enterprise authority.
        </text>
      </g>
      <line x1="0" y1="305" x2="1360" y2="305" stroke="#1E293B" stroke-width="1"/>

      <!-- 11pt Micro / Code -->
      <g transform="translate(0, 325)">
        <text class="mono-meta" y="12">11PT METRIC</text>
        <text x="180" y="14" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="500" fill="#00D2FF">
          UPM: 1000 | ASCENT: 850 | DESCENT: -250 | CAP_H: 700 | X_H: 520 | WEIGHTS: REGULAR_400, BOLD_700 | FORMAT: TTF / WOFF2
        </text>
      </g>
    </g>
  </g>

  <!-- Footer Branding -->
  <g transform="translate(80, 2140)">
    <text font-family="'Plus Jakarta Sans', sans-serif" font-size="13" font-weight="600" fill="#64748B" letter-spacing="1.5">
      COGNITARA TYPEFORGE · PROPRIETARY ENTERPRISE TYPOGRAPHY · ALL RIGHTS RESERVED
    </text>
    <text x="1440" font-family="'JetBrains Mono', monospace" font-size="13" font-weight="600" fill="#00D2FF" text-anchor="end" letter-spacing="1">
      COGNITARA.COM/TYPOGRAPHY
    </text>
  </g>
</svg>'''

def build_in_context_specimen_svg():
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1300" width="1600" height="1300">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;family=JetBrains+Mono:wght@400;500;600&amp;display=swap');
      @font-face {
        font-family: 'CogniTara Type';
        src: url('../fonts/CogniTaraType-Regular.woff2') format('woff2'),
             url('../fonts/CogniTaraType-Regular.ttf') format('truetype');
        font-weight: 400;
      }
      @font-face {
        font-family: 'CogniTara Type';
        src: url('../fonts/CogniTaraType-Bold.woff2') format('woff2'),
             url('../fonts/CogniTaraType-Bold.ttf') format('truetype');
        font-weight: 700;
      }
      .ct-title { font-family: 'CogniTara Type', 'Plus Jakarta Sans', sans-serif; font-weight: 700; fill: #FFFFFF; }
      .ct-body { font-family: 'CogniTara Type', 'Plus Jakarta Sans', sans-serif; font-weight: 400; fill: #94A3B8; }
      .mono-tag { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; fill: #00D2FF; letter-spacing: 1.5px; }
      .mono-val { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; fill: #38BDF8; }
      .card-bg { fill: #0D1322; stroke: #1E293B; stroke-width: 1.5; rx: 16px; }
    </style>
  </defs>

  <rect width="100%" height="100%" fill="#070A13"/>
  <circle cx="1300" cy="200" r="400" fill="#00D2FF" opacity="0.03"/>
  <circle cx="200" cy="900" r="500" fill="#0066FF" opacity="0.03"/>

  <!-- Top Title Bar -->
  <g transform="translate(80, 70)">
    <rect x="0" y="0" width="165" height="26" rx="13" fill="#121829" stroke="#00D2FF" stroke-width="1" stroke-opacity="0.4"/>
    <circle cx="14" cy="13" r="4" fill="#00D2FF"/>
    <text x="26" y="17" class="mono-tag">TYPE IN CONTEXT</text>

    <text x="0" y="65" class="ct-title" font-size="38" letter-spacing="-0.8">CogniTara Type in Enterprise Applications</text>
    <text x="0" y="95" class="ct-body" font-size="15">
      Demonstrating the typeface across real-world digital touchpoints: portal dashboards, exam interfaces, metric widgets, and telemetry streams.
    </text>
  </g>

  <!-- ========================================================================= -->
  <!-- PANEL 1: LIVE EXAM PORTAL HERO HEADER (LEFT 800px) -->
  <!-- ========================================================================= -->
  <g transform="translate(80, 200)">
    <rect width="880" height="480" rx="18" fill="#0A0E1A" stroke="#1E293B" stroke-width="1.5"/>
    
    <!-- Window Bar -->
    <rect width="880" height="42" rx="18" fill="#111827"/>
    <circle cx="25" cy="21" r="5" fill="#EF4444"/>
    <circle cx="45" cy="21" r="5" fill="#F59E0B"/>
    <circle cx="65" cy="21" r="5" fill="#10B981"/>
    <text x="440" y="26" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="11" fill="#64748B">portal.cognitara.com/dashboard</text>

    <!-- Content Inside Window -->
    <g transform="translate(50, 80)">
      <!-- Top Brand Tag -->
      <rect x="0" y="0" width="135" height="24" rx="12" fill="#151E33" stroke="#00D2FF" stroke-width="1" stroke-opacity="0.5"/>
      <text x="12" y="16" class="mono-tag" font-size="10">COGNITARA CORE</text>

      <!-- Headline in CogniTara Type Bold -->
      <text x="0" y="70" class="ct-title" font-size="44" letter-spacing="-1.2">
        Intelligent Assessment
      </text>
      <text x="0" y="120" class="ct-title" font-size="44" fill="#00D2FF" letter-spacing="-1.2">
        &amp; Cognitive Analytics
      </text>

      <!-- Description in CogniTara Type Regular -->
      <text x="0" y="170" class="ct-body" font-size="15" width="600">
        Empowering educators and students with autonomous proctoring, precision telemetry, and verifiable exam credentials built on high-trust infrastructure.
      </text>

      <!-- Action Buttons -->
      <g transform="translate(0, 230)">
        <rect width="180" height="48" rx="10" fill="#00D2FF"/>
        <text x="90" y="29" text-anchor="middle" font-family="'CogniTara Type', 'Plus Jakarta Sans', sans-serif" font-size="14" font-weight="700" fill="#070A13">
          Launch Exam Portal
        </text>

        <rect x="200" width="160" height="48" rx="10" fill="#151E33" stroke="#1E293B" stroke-width="1.5"/>
        <text x="280" y="29" text-anchor="middle" font-family="'CogniTara Type', 'Plus Jakarta Sans', sans-serif" font-size="14" font-weight="600" fill="#FFFFFF">
          View Telemetry
        </text>
      </g>

      <!-- Stats Bar -->
      <g transform="translate(0, 325)">
        <line x1="0" y1="0" x2="780" y2="0" stroke="#1E293B" stroke-width="1"/>
        <g transform="translate(0, 25)">
          <text class="ct-title" font-size="24" fill="#38BDF8">99.98%</text>
          <text class="mono-meta" y="22" font-size="11">SYSTEM RELIABILITY</text>
        </g>
        <g transform="translate(260, 25)">
          <text class="ct-title" font-size="24" fill="#FFFFFF">1.2M+</text>
          <text class="mono-meta" y="22" font-size="11">STUDENTS EVALUATED</text>
        </g>
        <g transform="translate(520, 25)">
          <text class="ct-title" font-size="24" fill="#00D2FF">&lt; 14ms</text>
          <text class="mono-meta" y="22" font-size="11">SUBMISSION LATENCY</text>
        </g>
      </g>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- PANEL 2: TELEMETRY & ANALYTICS WIDGETS (RIGHT 520px) -->
  <!-- ========================================================================= -->
  <g transform="translate(1000, 200)">
    <!-- Widget 1: Realtime Proctoring Node -->
    <rect width="520" height="225" class="card-bg"/>
    <g transform="translate(30, 30)">
      <text class="mono-tag">LIVE TELEMETRY NODE</text>
      <text x="0" y="32" class="ct-title" font-size="20">AI Proctoring Stream</text>
      <text x="0" y="55" class="ct-body" font-size="13">Continuous multi-sensor cognitive gaze &amp; audio monitoring.</text>

      <rect x="0" y="80" width="460" height="42" rx="8" fill="#121829" stroke="#1E293B" stroke-width="1"/>
      <circle cx="22" cy="101" r="5" fill="#10B981"/>
      <text x="38" y="105" font-family="'JetBrains Mono', monospace" font-size="12" fill="#E2E8F0">STATUS: SECURE_CHANNEL_ACTIVE</text>
      <text x="440" y="105" text-anchor="end" class="mono-val">340 FPS</text>

      <g transform="translate(0, 140)">
        <text class="mono-meta" font-size="11">INTEGRITY SCORE: <tspan class="mono-val">99.8 / 100</tspan></text>
        <rect x="0" y="12" width="460" height="8" rx="4" fill="#1E293B"/>
        <rect x="0" y="12" width="455" height="8" rx="4" fill="#00D2FF"/>
      </g>
    </g>

    <!-- Widget 2: Security & Encryption Telemetry -->
    <g transform="translate(0, 255)">
      <rect width="520" height="225" class="card-bg"/>
      <g transform="translate(30, 30)">
        <text class="mono-tag">CRYPTOGRAPHIC LEDGER</text>
        <text x="0" y="32" class="ct-title" font-size="20">Tamper-Proof Verification</text>
        <text x="0" y="55" class="ct-body" font-size="13">SHA-256 state hashing on every assessment interaction.</text>

        <rect x="0" y="80" width="460" height="52" rx="8" fill="#121829" stroke="#1E293B" stroke-width="1"/>
        <text x="18" y="102" font-family="'JetBrains Mono', monospace" font-size="11.5" fill="#94A3B8">HASH: 7f8a92...c3e041</text>
        <text x="18" y="122" font-family="'JetBrains Mono', monospace" font-size="11.5" fill="#38BDF8">BLOCK: #18,492,019 [CONFIRMED]</text>

        <text x="0" y="155" class="mono-meta" font-size="11">ENCRYPTION PROTOCOL: <tspan class="mono-val">AES-256-GCM</tspan></text>
      </g>
    </g>
  </g>

  <!-- ========================================================================= -->
  <!-- PANEL 3: CODE INTEGRATION & API SNIPPET (BOTTOM ROW) -->
  <!-- ========================================================================= -->
  <g transform="translate(80, 720)">
    <rect width="1440" height="480" rx="18" fill="#0D1322" stroke="#1E293B" stroke-width="1.5"/>

    <!-- Left: Typography Pairing System -->
    <g transform="translate(45, 45)">
      <text class="mono-tag">DESIGN SYSTEM ARCHITECTURE</text>
      <text x="0" y="35" class="ct-title" font-size="24">Typography Pairing &amp; Roles</text>
      <text x="0" y="65" class="ct-body" font-size="14">
        A structured, multi-tier typography architecture engineered for high-density cognitive interfaces.
      </text>

      <g transform="translate(0, 100)">
        <!-- Tier 1 -->
        <rect width="640" height="75" rx="10" fill="#121829" stroke="#1E293B" stroke-width="1"/>
        <text x="20" y="32" class="mono-tag">PRIMARY BRAND &amp; HEADINGS</text>
        <text x="20" y="56" font-family="'CogniTara Type', 'Plus Jakarta Sans', sans-serif" font-size="18" font-weight="700" fill="#FFFFFF">
          CogniTara Type Bold · Display, Headlines, Wordmarks
        </text>

        <!-- Tier 2 -->
        <rect y="90" width="640" height="75" rx="10" fill="#121829" stroke="#1E293B" stroke-width="1"/>
        <text x="20" y="122" class="mono-tag">INTERFACES &amp; BODY TEXT</text>
        <text x="20" y="146" font-family="'CogniTara Type', 'Plus Jakarta Sans', sans-serif" font-size="16" font-weight="400" fill="#CBD5E1">
          CogniTara Type Regular · UI Elements, Body Copy, Navigation
        </text>

        <!-- Tier 3 -->
        <rect y="180" width="640" height="75" rx="10" fill="#121829" stroke="#1E293B" stroke-width="1"/>
        <text x="20" y="212" class="mono-tag">TELEMETRY &amp; METRICS</text>
        <text x="20" y="236" font-family="'JetBrains Mono', monospace" font-size="15" font-weight="500" fill="#38BDF8">
          JetBrains Mono / Plus Jakarta Sans · Code, Data, Hashes
        </text>
      </g>
    </g>

    <!-- Right: Code Snippet / Web Integration -->
    <g transform="translate(740, 45)">
      <text class="mono-tag">WEB INTEGRATION (@FONT-FACE)</text>
      <text x="0" y="35" class="ct-title" font-size="24">Production CSS Implementation</text>
      <text x="0" y="65" class="ct-body" font-size="14">
        Directly embed the compiled CogniTara Typeface across your web platform and design tools.
      </text>

      <!-- Terminal / Code Window -->
      <g transform="translate(0, 100)">
        <rect width="640" height="280" rx="10" fill="#070A13" stroke="#1E293B" stroke-width="1.5"/>
        <rect width="640" height="32" rx="10" fill="#121829"/>
        <circle cx="20" cy="16" r="4.5" fill="#EF4444"/>
        <circle cx="36" cy="16" r="4.5" fill="#F59E0B"/>
        <circle cx="52" cy="16" r="4.5" fill="#10B981"/>
        <text x="75" y="20" font-family="'JetBrains Mono', monospace" font-size="11" fill="#64748B">typography.css</text>

        <g transform="translate(25, 60)" font-family="'JetBrains Mono', monospace" font-size="12" fill="#E2E8F0">
          <text y="0"><tspan fill="#38BDF8">@font-face</tspan> {</text>
          <text y="22">  <tspan fill="#94A3B8">font-family:</tspan> <tspan fill="#A5F3FC">'CogniTara Type'</tspan>;</text>
          <text y="44">  <tspan fill="#94A3B8">src:</tspan> <tspan fill="#CBD5E1">url('/fonts/CogniTaraType-Bold.woff2') format('woff2');</tspan></text>
          <text y="66">  <tspan fill="#94A3B8">font-weight:</tspan> <tspan fill="#F59E0B">700</tspan>;</text>
          <text y="88">  <tspan fill="#94A3B8">font-display:</tspan> <tspan fill="#F59E0B">swap</tspan>;</text>
          <text y="110">}</text>
          <text y="140"><tspan fill="#00D2FF">.brand-wordmark</tspan> {</text>
          <text y="162">  <tspan fill="#94A3B8">font-family:</tspan> <tspan fill="#A5F3FC">'CogniTara Type'</tspan>, sans-serif;</text>
          <text y="184">  <tspan fill="#94A3B8">font-weight:</tspan> <tspan fill="#F59E0B">700</tspan>;</text>
          <text y="206">  <tspan fill="#94A3B8">letter-spacing:</tspan> <tspan fill="#F59E0B">-0.02em</tspan>;</text>
          <text y="228">}</text>
        </g>
      </g>
    </g>
  </g>
</svg>'''

def main():
    spec_dir = "c:/COGNITARA EXAM PORTAL/CogniTara-Typeface/specimens"
    os.makedirs(spec_dir, exist_ok=True)
    vc_cli = r"C:\Program Files\VectorCraft\vectorcraft-cli.exe"

    # 1. Full Specimen
    full_svg = os.path.join(spec_dir, "cognitara_type_specimen_full.svg")
    full_png = os.path.join(spec_dir, "cognitara_type_specimen_full.png")
    full_vc = os.path.join(spec_dir, "cognitara_type_specimen_full.vectorcraft")
    with open(full_svg, "w", encoding="utf-8") as f:
        f.write(build_full_specimen_svg())
    print(f"Generated {full_svg}")

    # 2. In-Context Specimen
    context_svg = os.path.join(spec_dir, "cognitara_type_in_context.svg")
    context_png = os.path.join(spec_dir, "cognitara_type_in_context.png")
    context_vc = os.path.join(spec_dir, "cognitara_type_in_context.vectorcraft")
    with open(context_svg, "w", encoding="utf-8") as f:
        f.write(build_in_context_specimen_svg())
    print(f"Generated {context_svg}")

    # Convert with VectorCraft CLI
    if os.path.exists(vc_cli):
        print("[*] Converting Full Specimen with VectorCraft CLI...")
        subprocess.run([vc_cli, "convert", full_svg, full_png, "--outline-text"], capture_output=True)
        subprocess.run([vc_cli, "convert", full_svg, full_vc, "--outline-text"], capture_output=True)

        print("[*] Converting In-Context Specimen with VectorCraft CLI...")
        subprocess.run([vc_cli, "convert", context_svg, context_png, "--outline-text"], capture_output=True)
        subprocess.run([vc_cli, "convert", context_svg, context_vc, "--outline-text"], capture_output=True)
        print("[+] VectorCraft conversions complete!")

if __name__ == "__main__":
    main()
