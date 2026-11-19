# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller specification for CogniTara v2 Engine (`cognitara-engine.exe`).
Builds a console-less `--onedir` bundle consumed by Electron `extraResources`.
"""

import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

ROOT_DIR = os.path.abspath(os.path.join(SPECPATH, ".."))
ICON_PATH = os.path.join(ROOT_DIR, "CogniTara-Brand-Identity", "cognitara-favicon.ico")

datas = [
    (os.path.join(ROOT_DIR, "templates"), "templates"),
    (os.path.join(ROOT_DIR, "static"), "static"),
]
datas += collect_data_files("bleach")
datas += collect_data_files("tinycss2")
datas += collect_data_files("docx")

hiddenimports = [
    "waitress",
    "waitress.server",
    "waitress.wasyncore",
    "cryptography",
    "cryptography.hazmat.primitives.asymmetric.ed25519",
    "cryptography.hazmat.primitives.ciphers.aead",
    "cryptography.hazmat.primitives.serialization",
    "flask_wtf",
    "flask_wtf.csrf",
    "flask_limiter",
    "flask_limiter.util",
    "limits",
    "limits.storage",
    "limits.strategies",
    "bleach",
    "bleach.css_sanitizer",
    "tinycss2",
    "webencodings",
    "docx",
    "openpyxl",
    "PIL",
    "PIL.Image",
    "werkzeug.middleware.proxy_fix",
    "sqlite3",
]
hiddenimports += collect_submodules("cognitara")
hiddenimports += collect_submodules("cryptography")

block_cipher = None

a = Analysis(
    [os.path.join(ROOT_DIR, "wsgi.py")],
    pathex=[ROOT_DIR],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "matplotlib",
        "scipy",
        "pytest",
        "playwright",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="cognitara-engine",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=ICON_PATH if os.path.exists(ICON_PATH) else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="engine",
)
