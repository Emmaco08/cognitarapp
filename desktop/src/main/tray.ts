import path from "path";
import { app, BrowserWindow, Menu, nativeImage, shell, Tray } from "electron";
import { ServerLifecycleState } from "./types";

export interface TrayCallbacks {
  getWindow: () => BrowserWindow | null;
  getServerState: () => ServerLifecycleState;
  getPort: () => number;
  onToggleServer: () => void;
  onRequestQuit: () => void;
}

export class StudioTray {
  private tray: Tray | null = null;
  private readonly callbacks: TrayCallbacks;

  constructor(callbacks: TrayCallbacks) {
    this.callbacks = callbacks;
  }

  public init(): void {
    const assetBase = app.isPackaged
      ? path.join(app.getAppPath(), "assets")
      : path.resolve(__dirname, "..", "..", "assets");

    const iconFile =
      process.platform === "win32"
        ? path.join(assetBase, "cognitara-favicon.ico")
        : path.join(assetBase, "cognitara-app-icon.png");

    const icon = nativeImage.createFromPath(iconFile);
    this.tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    this.tray.setToolTip("CogniTara Studio");
    this.tray.on("click", () => this.showWindow());
    this.tray.on("double-click", () => this.showWindow());
    this.refresh();
  }

  public showWindow(): void {
    const win = this.callbacks.getWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  public refresh(): void {
    if (!this.tray) return;
    const state = this.callbacks.getServerState();
    const port = this.callbacks.getPort();
    const isRunning = state === "running";
    const statusLabel =
      state === "running"
        ? `Server running (:${port})`
        : state === "starting"
        ? "Starting server…"
        : state === "stopping"
        ? "Stopping server…"
        : state === "locked"
        ? "Licence attention needed"
        : "Server stopped";

    this.tray.setToolTip(`CogniTara Studio | ${statusLabel}`);
    const menu = Menu.buildFromTemplate([
      { label: `CogniTara Studio · ${statusLabel}`, enabled: false },
      { type: "separator" },
      {
        label: isRunning ? "Stop server" : "Start server",
        enabled: state === "stopped" || state === "running",
        click: () => this.callbacks.onToggleServer(),
      },
      {
        label: "Open CogniTara Studio",
        click: () => this.showWindow(),
      },
      { type: "separator" },
      {
        label: "Open Admin & Teacher Portal",
        enabled: isRunning,
        click: () => shell.openExternal(`http://127.0.0.1:${port}/login?role=Admin`),
      },
      {
        label: "Open Student Login",
        enabled: isRunning,
        click: () => shell.openExternal(`http://127.0.0.1:${port}/login?role=student`),
      },
      {
        label: "Open Common Entrance Portal",
        enabled: isRunning,
        click: () => shell.openExternal(`http://127.0.0.1:${port}/ce_login`),
      },
      { type: "separator" },
      {
        label: "Quit CogniTara",
        click: () => this.callbacks.onRequestQuit(),
      },
    ]);
    this.tray.setContextMenu(menu);
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
