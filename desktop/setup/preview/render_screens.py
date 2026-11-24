"""Render every CogniTara setup screen at 460x620 with Playwright (visual QA).

Usage:
    python desktop/setup/preview/render_screens.py [OUT_DIR]

Uses preview/mock-tauri.js in place of the real Tauri runtime. Produces
dark + light PNGs for: options, options (update), installing 40%/85%, finish, error.
"""

from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
UI = HERE.parent / "ui" / "index.html"
MOCK = (HERE / "mock-tauri.js").read_text(encoding="utf-8")
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "screens"

DIR = r"C:\Program Files\CogniTara Studio"

SCENES = [
    ("01_options", "", None),
    ("02_options_update", "?update=1", None),
    ("03_installing_40", "", f"""
        CogniSetup.show('installing');
        CogniSetup.setProgress(41.6, 'Extracting CogniTara engine…', 'Installing to {DIR.replace(chr(92), chr(92) * 2)}');
        CogniSetup.showTip(0);
    """),
    ("04_installing_85", "", f"""
        CogniSetup.show('installing');
        CogniSetup.setProgress(86.4, 'Installing program files…', 'Installing to {DIR.replace(chr(92), chr(92) * 2)}');
        CogniSetup.showTip(2);
    """),
    ("05_finish", "", f"""
        CogniSetup.state.result = {{ ok: true, appExe: 'x', installDir: '{DIR.replace(chr(92), chr(92) * 2)}' }};
        CogniSetup.showFinish(CogniSetup.state.result);
    """),
    ("06_error", "", f"""
        CogniSetup.showError({{ ok: false, code: 1223, title: 'Administrator permission is needed',
          message: 'Installing to {DIR.replace(chr(92), chr(92) * 2)} requires administrator approval. Choose Try again and accept the Windows prompt, or pick a folder inside your user profile.',
          detail: 'UAC elevation was cancelled (Win32 error 1223).', installDir: '{DIR.replace(chr(92), chr(92) * 2)}' }});
    """),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for theme in ("dark", "light"):
            for name, query, script in SCENES:
                ctx = browser.new_context(viewport={"width": 460, "height": 620}, device_scale_factor=2)
                ctx.add_init_script(MOCK)
                ctx.add_init_script(f"try{{localStorage.setItem('ct-setup-theme','{theme}')}}catch(e){{}}")
                page = ctx.new_page()
                page.goto(UI.as_uri() + query)
                page.wait_for_function("window.CogniSetup && document.fonts.status === 'loaded'")
                page.wait_for_timeout(500)
                if script:
                    page.evaluate(script)
                page.wait_for_timeout(1900)
                path = OUT / f"setup_{name}_{theme}.png"
                page.screenshot(path=str(path))
                print("wrote", path)
                ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
