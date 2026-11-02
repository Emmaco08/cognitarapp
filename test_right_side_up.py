"""
test_right_side_up.py
Verifies right-side up native SVG geometry for CogniTara wordmark.
"""

import math
import subprocess
import os

# Cap Height = 100 (from y=0 to y=100)
# x-Height = 72 (from y=28 to y=100)
# Baseline = 100
# Descender = 125.5

def get_c_paths_upright():
    # Capital C: center at (48, 50), outer R=48, inner R=38.4
    # 45 deg outer: x = 48 + 48*cos(45) = 81.94, y = 50 - 48*sin(45) = 16.06 (top right)
    # 315 deg outer: x = 81.94, y = 50 + 48*sin(45) = 83.94 (bottom right)
    # 315 deg inner: x = 48 + 38.4*cos(315) = 75.15, y = 50 + 38.4*sin(45) = 77.15
    # 45 deg inner: x = 75.15, y = 50 - 38.4*sin(45) = 22.85
    d_C = ("M 81.94, 16.06 "
           "C 73.2, 5.8 61.3, 0 48, 0 "
           "C 20.4, 0 0, 22.4 0, 50 "
           "C 0, 77.6 20.4, 100 48, 100 "
           "C 61.3, 100 73.2, 94.2 81.94, 83.94 "
           "L 75.15, 77.15 "
           "C 67.8, 85.5 58.4, 90.4 48, 90.4 "
           "C 25.7, 90.4 9.6, 72.3 9.6, 50 "
           "C 9.6, 27.7 25.7, 9.6 48, 9.6 "
           "C 58.4, 9.6 67.8, 14.5 75.15, 22.85 Z")

    # Lowercase o: from y=28 to y=100, center at (34, 64), rx=34, ry=36
    # inner rx=24.4, ry=26.4
    d_o = ("M 34, 28 "
           "C 52.8, 28 68, 44 68, 64 "
           "C 68, 84 52.8, 100 34, 100 "
           "C 15.2, 100 0, 84 0, 64 "
           "C 0, 44 15.2, 28 34, 28 Z "
           "M 34, 37.6 "
           "C 20.5, 37.6 9.6, 49.4 9.6, 64 "
           "C 9.6, 78.6 20.5, 90.4 34, 90.4 "
           "C 47.5, 90.4 58.4, 78.6 58.4, 64 "
           "C 58.4, 49.4 47.5, 37.6 34, 37.6 Z")

    # Lowercase g: bowl from y=28 to y=100, descending hook to y=125.5
    d_g = ("M 32, 28 "
           "C 40.5, 28 48, 33 53.5, 40.5 "
           "L 53.5, 29.5 L 62.5, 29.5 "
           "L 62.5, 100 "
           "C 62.5, 115.5 51.5, 125.5 33.5, 125.5 "
           "C 21, 125.5 10.5, 120.5 5, 112 "
           "L 12, 107.5 "
           "C 16, 114 23.5, 118 33, 118 "
           "C 44.5, 118 53.5, 112.5 53.5, 100 "
           "L 53.5, 86.5 "
           "C 48, 94.5 40, 98.5 31.5, 98.5 "
           "C 14, 98.5 0, 83 0, 63.5 "
           "C 0, 44 14.3, 28 32, 28 Z "
           "M 32, 37.6 "
           "C 19, 37.6 9.6, 49 9.6, 63.5 "
           "C 9.6, 78 19, 89 32, 89 "
           "C 45, 89 53.5, 77.6 53.5, 63.5 "
           "C 53.5, 49 45, 37.6 32, 37.6 Z")

    # Lowercase n: stem from y=29.5 to y=100, arch from y=28 to y=100
    d_n = ("M 0, 29.5 L 9.6, 29.5 L 9.6, 45 "
           "C 14, 34.5 23.5, 28 35, 28 "
           "C 50.5, 28 63.1, 38 63.1, 56.5 "
           "L 63.1, 100 L 53.5, 100 L 53.5, 58 "
           "C 53.5, 45 46, 37.6 35, 37.6 "
           "C 24, 37.6 14, 43.5 9.6, 54.5 "
           "L 9.6, 100 L 0, 100 Z")

    # Lowercase i: stem from y=29.5 to y=100
    d_i_stem = "M 0, 29.5 L 9.6, 29.5 L 9.6, 100 L 0, 100 Z"
    # Refined micro-spark beacon tittle centered at cx=4.8, cy=14
    cx_i = 4.8
    cy_i = 14.0
    r_v = 7.5
    r_h = 7.5
    p = 2.0
    d_i_star = (f"M {cx_i:.2f}, {cy_i - r_v:.2f} "
                f"C {cx_i + p:.2f}, {cy_i - p:.2f} {cx_i + p:.2f}, {cy_i - p:.2f} {cx_i + r_h:.2f}, {cy_i:.2f} "
                f"C {cx_i + p:.2f}, {cy_i + p:.2f} {cx_i + p:.2f}, {cy_i + p:.2f} {cx_i:.2f}, {cy_i + r_v:.2f} "
                f"C {cx_i - p:.2f}, {cy_i + p:.2f} {cx_i - p:.2f}, {cy_i + p:.2f} {cx_i - r_h:.2f}, {cy_i:.2f} "
                f"C {cx_i - p:.2f}, {cy_i - p:.2f} {cx_i - p:.2f}, {cy_i - p:.2f} {cx_i:.2f}, {cy_i - r_v:.2f} Z")

    # Capital T: crossbar from y=0 to y=9.6 with 45-deg chamfers at ends; stem to y=100
    d_T = ("M 0, 0 L 70, 0 L 70, 6.4 L 66.8, 9.6 "
           "L 39.8, 9.6 L 39.8, 100 L 30.2, 100 L 30.2, 9.6 "
           "L 3.2, 9.6 L 0, 6.4 Z")

    # Lowercase a: single-story from y=28 to y=100
    d_a = ("M 31, 28 "
           "C 42, 28 50, 33.5 54, 42 "
           "L 54, 29.5 L 63.6, 29.5 L 63.6, 100 L 54, 100 L 54, 84.5 "
           "C 50, 93.5 42, 100 31, 100 "
           "C 14, 100 0, 84 0, 64 "
           "C 0, 44 14, 28 31, 28 Z "
           "M 32, 37.6 "
           "C 18.5, 37.6 9.6, 49 9.6, 64 "
           "C 9.6, 79 18.5, 90.4 32, 90.4 "
           "C 45.5, 90.4 54, 79 54, 64 "
           "C 54, 49 45.5, 37.6 32, 37.6 Z")

    # Lowercase r: stem from y=29.5 to y=100, arch with 45-deg cut terminal
    d_r = ("M 0, 29.5 L 9.6, 29.5 L 9.6, 46 "
           "C 13, 35 21, 28 32.5, 28 "
           "C 38, 28 43.5, 30.2 47.8, 33.8 "
           "L 45, 41 "
           "C 42, 39 38, 37.6 34, 37.6 "
           "C 23, 37.6 13.5, 42.5 9.6, 54.5 "
           "L 9.6, 100 L 0, 100 Z")

    return d_C, d_o, d_g, d_n, d_i_stem, d_i_star, d_T, d_a, d_r

def test():
    d_C, d_o, d_g, d_n, d_i_stem, d_i_star, d_T, d_a, d_r = get_c_paths_upright()
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 200" width="700" height="200">
  <rect width="100%" height="100%" fill="#0A0E1A"/>
  <!-- Cogni in White -->
  <g fill="#FFFFFF" transform="translate(50, 50)">
    <path d="{d_C}" transform="translate(0, 0)"/>
    <path d="{d_o}" transform="translate(94, 0)"/>
    <path d="{d_g}" transform="translate(173, 0)"/>
    <path d="{d_n}" transform="translate(247, 0)"/>
    <path d="{d_i_stem}" transform="translate(321, 0)"/>
  </g>
  <!-- Dot on i in Cyan -->
  <g fill="#00D2FF" transform="translate(50, 50)">
    <path d="{d_i_star}" transform="translate(321, 0)"/>
  </g>
  <!-- Tara in Cyan -->
  <g fill="#00D2FF" transform="translate(50, 50)">
    <path d="{d_T}" transform="translate(347, 0)"/>
    <path d="{d_a}" transform="translate(425, 0)"/>
    <path d="{d_r}" transform="translate(497, 0)"/>
    <path d="{d_a}" transform="translate(551, 0)"/>
  </g>
</svg>'''
    with open("test_upright.svg", "w") as f:
        f.write(svg)
    subprocess.run([r"C:\Program Files\VectorCraft\vectorcraft-cli.exe", "convert", "test_upright.svg", "test_upright.png"])
    print("test_upright.png generated!")

test()
