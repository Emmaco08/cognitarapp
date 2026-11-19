import { contextBridge, ipcRenderer } from "electron";

export interface CogniTaraDesktopBridge {
  getBootstrapState: () => Promise<any>;
  getTelemetry: () => Promise<any>;
  getLicenseStatus: () => Promise<any>;
  activateLicenseKey: (licenseKey: string) => Promise<any>;
  importLicenseFile: () => Promise<any>;
  checkInLicense: () => Promise<any>;
  recheckLicense: () => Promise<any>;
  startServer: () => Promise<any>;
  stopServer: () => Promise<any>;
  extendExam: (examId: number, examType: string, minutes: number) => Promise<any>;
  pauseAllExams: () => Promise<any>;
  resumeAttempt: (attemptId: number, examType: string) => Promise<any>;
  listBackups: () => Promise<any>;
  createHotBackup: (kind?: string) => Promise<any>;
  restoreBackup: (filename: string) => Promise<any>;
  chooseBackupDir: () => Promise<any>;
  saveSchoolProfile: (payload: {
    school_name: string;
    school_motto: string;
    academic_session: string;
    current_term: string;
    logo_data_url?: string | null;
  }) => Promise<any>;
  saveSuperAdmin: (payload: {
    full_name: string;
    username: string;
    password: string;
    recovery_codes: string[];
  }) => Promise<any>;
  completeOnboarding: (payload: { selectedLanIp?: string }) => Promise<any>;
  getSettings: () => Promise<any>;
  updateSettings: (partial: Record<string, unknown>) => Promise<any>;
  windowAction: (action: "minimize" | "maximize" | "close") => Promise<void>;
  setWindowMode: (mode: "boot" | "studio") => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  openWindowsDateSettings: () => Promise<void>;
  exportDataBackup: () => Promise<any>;
  onServerStateChanged: (cb: (state: string) => void) => () => void;
  onLicenseLockTriggered: (cb: (license: any) => void) => () => void;
}

const api: CogniTaraDesktopBridge = {
  getBootstrapState: () => ipcRenderer.invoke("studio:bootstrap"),
  getTelemetry: () => ipcRenderer.invoke("studio:telemetry"),
  getLicenseStatus: () => ipcRenderer.invoke("license:status"),
  activateLicenseKey: (licenseKey) => ipcRenderer.invoke("license:activateKey", licenseKey),
  importLicenseFile: () => ipcRenderer.invoke("license:importFile"),
  checkInLicense: () => ipcRenderer.invoke("license:checkIn"),
  recheckLicense: () => ipcRenderer.invoke("license:recheck"),
  startServer: () => ipcRenderer.invoke("server:start"),
  stopServer: () => ipcRenderer.invoke("server:stop"),
  extendExam: (examId, examType, minutes) =>
    ipcRenderer.invoke("live:extend", { exam_id: examId, exam_type: examType, minutes }),
  pauseAllExams: () => ipcRenderer.invoke("live:pauseAll"),
  resumeAttempt: (attemptId, examType) =>
    ipcRenderer.invoke("live:resume", { attempt_id: attemptId, exam_type: examType }),
  listBackups: () => ipcRenderer.invoke("backups:list"),
  createHotBackup: (kind = "manual") => ipcRenderer.invoke("backups:create", kind),
  restoreBackup: (filename) => ipcRenderer.invoke("backups:restore", filename),
  chooseBackupDir: () => ipcRenderer.invoke("backups:chooseDir"),
  saveSchoolProfile: (payload) => ipcRenderer.invoke("setup:school", payload),
  saveSuperAdmin: (payload) => ipcRenderer.invoke("setup:superadmin", payload),
  completeOnboarding: (payload) => ipcRenderer.invoke("setup:complete", payload),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (partial) => ipcRenderer.invoke("settings:update", partial),
  windowAction: (action) => ipcRenderer.invoke("window:action", action),
  setWindowMode: (mode) => ipcRenderer.invoke("window:setMode", mode),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  openWindowsDateSettings: () => ipcRenderer.invoke("shell:dateSettings"),
  exportDataBackup: () => ipcRenderer.invoke("backups:exportAndOpen"),
  onServerStateChanged: (cb) => {
    const listener = (_evt: Electron.IpcRendererEvent, state: string) => cb(state);
    ipcRenderer.on("server:stateChanged", listener);
    return () => ipcRenderer.removeListener("server:stateChanged", listener);
  },
  onLicenseLockTriggered: (cb) => {
    const listener = (_evt: Electron.IpcRendererEvent, lic: any) => cb(lic);
    ipcRenderer.on("license:locked", listener);
    return () => ipcRenderer.removeListener("license:locked", listener);
  },
};

contextBridge.exposeInMainWorld("cognitaraDesktop", api);
