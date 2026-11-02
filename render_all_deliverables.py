"""
render_all_deliverables.py
Renders the complete CogniTara motion graphics package across all formats:
1. Master Reveal MP4 (1080p, H.264, 30fps, with Audio)
2. High-Quality Master MOV (ProRes 422 HQ with Audio)
3. Transparent Alpha Master MOV (ProRes 4444 RGBA)
4. Transparent Alpha Master WebM (VP9 RGBA)
5. Silent Master MP4 (1080p, H.264, Audio Off)
6. Short Social Cut MP4 (1080p, 4.0s, H.264, with Audio)
7. Square 1:1 Social MP4 (1080x1080, H.264, with Audio)
8. Vertical 9:16 Story MP4 (1080x1920, H.264, with Audio)
"""

import os
import time
import subprocess

PROJECT_DIR = r"c:\COGNITARA EXAM PORTAL\CogniTara-Motion-Graphics"
RENDERS_DIR = os.path.join(PROJECT_DIR, "renders")
ECPROJ = os.path.join(PROJECT_DIR, "cognitara-motion-identity.ecproj")
EC_CLI = r"C:\Program Files\EffectCraft\effectcraft-cli.exe"

os.makedirs(RENDERS_DIR, exist_ok=True)

jobs = [
    {
        "name": "1. Master Reveal (1080p H.264 with Audio)",
        "comp": "Comp_Master_1080p",
        "out": os.path.join(RENDERS_DIR, "cognitara-logo-reveal-master.mp4"),
        "args": ["--format", "h264", "--fps", "30", "--audio", "on", "--bitrate", "18000"]
    },
    {
        "name": "2. High-Quality Master (ProRes 422 HQ with Audio)",
        "comp": "Comp_Master_1080p",
        "out": os.path.join(RENDERS_DIR, "cognitara-logo-reveal-highquality.mov"),
        "args": ["--format", "prores", "--prores", "hq", "--fps", "30", "--audio", "on"]
    },
    {
        "name": "3. Transparent Alpha Master (ProRes 4444 RGBA)",
        "comp": "Comp_Transparent",
        "out": os.path.join(RENDERS_DIR, "cognitara-logo-reveal-transparent.mov"),
        "args": ["--format", "prores", "--prores", "4444", "--channels", "rgba", "--fps", "30"]
    },
    {
        "name": "4. Transparent Alpha Master (WebM VP9 RGBA)",
        "comp": "Comp_Transparent",
        "out": os.path.join(RENDERS_DIR, "cognitara-logo-reveal-transparent.webm"),
        "args": ["--format", "webm", "--channels", "rgba", "--fps", "30"]
    },
    {
        "name": "5. Silent Master (1080p H.264 Audio Off)",
        "comp": "Comp_Master_1080p",
        "out": os.path.join(RENDERS_DIR, "cognitara-logo-reveal-silent.mp4"),
        "args": ["--format", "h264", "--fps", "30", "--audio", "off"]
    },
    {
        "name": "6. Short Social Cut (1080p 4.0s H.264 with Audio)",
        "comp": "Comp_Short_4s",
        "out": os.path.join(RENDERS_DIR, "cognitara-logo-reveal-short.mp4"),
        "args": ["--format", "h264", "--fps", "30", "--audio", "on"]
    },
    {
        "name": "7. Square 1:1 Social (1080x1080 H.264 with Audio)",
        "comp": "Comp_Square_1080p",
        "out": os.path.join(RENDERS_DIR, "cognitara-logo-reveal-square.mp4"),
        "args": ["--format", "h264", "--fps", "30", "--audio", "on"]
    },
    {
        "name": "8. Vertical 9:16 Story (1080x1920 H.264 with Audio)",
        "comp": "Comp_Vertical_9x16",
        "out": os.path.join(RENDERS_DIR, "cognitara-logo-reveal-vertical.mp4"),
        "args": ["--format", "h264", "--fps", "30", "--audio", "on"]
    }
]

print("=" * 70)
print("STARTING COGNITARA MOTION GRAPHICS RENDER BATCH")
print("=" * 70)

for idx, job in enumerate(jobs, 1):
    print(f"\n[{idx}/{len(jobs)}] Rendering: {job['name']}...")
    t0 = time.time()
    cmd = [
        EC_CLI, "render",
        "--project", ECPROJ,
        "--comp", job["comp"],
        "--out", job["out"]
    ] + job["args"]
    
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        elapsed = time.time() - t0
        size_bytes = os.path.getsize(job["out"]) if os.path.exists(job["out"]) else 0
        size_mb = size_bytes / (1024 * 1024)
        print(f"  -> SUCCESS in {elapsed:.2f}s | Output Size: {size_mb:.2f} MB ({size_bytes:,} bytes)")
    except subprocess.CalledProcessError as err:
        print(f"  -> ERROR rendering {job['name']}: {err.stderr}")

print("\n" + "=" * 70)
print("RENDER BATCH COMPLETED!")
print("=" * 70)
