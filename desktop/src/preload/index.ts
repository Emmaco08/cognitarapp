import { contextBridge, ipcRenderer } from "electron";

export interface CogniTaraDesktopBridge {
  getBootstrapState: () => Promise<any>;
  getTelemetry: () => Promise<any>;
  getLicenseStatus: () => Promise<any>;
  activateLicenseKey: (licenseKey: string) => Promise<any>;
  importLicenseFile: () => Promise<any>;
  startTrialLicense: (schoolName?: string) => Promise<any>;
  checkInLicense: () => Promise<any>;
  recheckLicense: () => Promise<any>;
  repairCorruptVault: () => Promise<any>;
  activateCloudLicense: (licenseKey?: string) => Promise<any>;
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
  windowAction: (action: "minimize" | "maximize" | "close") => Promise<any>;
  setWindowMode: (mode: "boot" | "studio") => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  openWindowsDateSettings: () => Promise<void>;
  exportDataBackup: () => Promise<any>;
  // Direct In-App Auto-Updates (electron-updater)
  getUpdateState: () => Promise<any>;
  checkForUpdates: () => Promise<any>;
  downloadUpdate: () => Promise<any>;
  installUpdateNow: () => Promise<any>;
  // CogniTara Cloud Auth (Neon + Vercel + Offline Cache)
  getCloudSession: () => Promise<any>;
  cloudSignUp: (payload: {
    full_name: string;
    school_name: string;
    email: string;
    password: string;
    phone?: string;
    referral_code?: string;
  }) => Promise<any>;
  cloudSignIn: (payload: { email: string; password: string }) => Promise<any>;
  cloudSync: () => Promise<any>;
  cloudSignOut: () => Promise<any>;
  cloudVerifyOtp: (payload: { email: string; code: string; purpose?: string }) => Promise<any>;
  cloudResendOtp: (payload: { email: string; purpose?: string }) => Promise<any>;
  // Paystack In-App Billing, Plans, Discount & Redeem Codes
  getBillingPlans: () => Promise<any>;
  validatePromoCode: (payload: { code: string; plan_id?: string | null; currency?: string }) => Promise<any>;
  redeemVoucherCode: (payload: { code: string; plan_id?: string | null; currency?: string }) => Promise<any>;
  startPaystackCheckout: (payload: { plan_id: string; currency?: string; promo_code?: string }) => Promise<any>;
  verifyPaystackReference: (reference: string) => Promise<any>;
  // Main-to-renderer push subscriptions
  onServerStateChanged: (cb: (state: string) => void) => () => void;
  onLicenseLockTriggered: (cb: (license: any) => void) => () => void;
  onUpdateStatusChanged: (cb: (status: any) => void) => () => void;
  onCloudSessionChanged: (cb: (session: any) => void) => () => void;
  onBillingCompleted: (cb: (result: any) => void) => () => void;
  onWindowMaximizedChanged: (cb: (maximized: boolean) => void) => () => void;
}

const api: CogniTaraDesktopBridge = {
  getBootstrapState: () => ipcRenderer.invoke("studio:bootstrap"),
  getTelemetry: () => ipcRenderer.invoke("studio:telemetry"),
  getLicenseStatus: () => ipcRenderer.invoke("license:status"),
  activateLicenseKey: (licenseKey) => ipcRenderer.invoke("license:activateKey", licenseKey),
  importLicenseFile: () => ipcRenderer.invoke("license:importFile"),
  startTrialLicense: (schoolName) => ipcRenderer.invoke("license:startTrial", schoolName),
  checkInLicense: () => ipcRenderer.invoke("license:checkIn"),
  recheckLicense: () => ipcRenderer.invoke("license:recheck"),
  repairCorruptVault: () => ipcRenderer.invoke("license:repairVault"),
  activateCloudLicense: (licenseKey) => ipcRenderer.invoke("cloud:activateLicense", licenseKey),
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
  getUpdateState: () => ipcRenderer.invoke("updater:getState"),
  checkForUpdates: () => ipcRenderer.invoke("updater:check"),
  downloadUpdate: () => ipcRenderer.invoke("updater:download"),
  installUpdateNow: () => ipcRenderer.invoke("updater:install"),
  getCloudSession: () => ipcRenderer.invoke("cloud:getSession"),
  cloudSignUp: (payload) => ipcRenderer.invoke("cloud:signUp", payload),
  cloudSignIn: (payload) => ipcRenderer.invoke("cloud:signIn", payload),
  cloudVerifyOtp: (payload) => ipcRenderer.invoke("cloud:verifyOtp", payload),
  cloudResendOtp: (payload) => ipcRenderer.invoke("cloud:resendOtp", payload),
  cloudSync: () => ipcRenderer.invoke("cloud:sync"),
  cloudSignOut: () => ipcRenderer.invoke("cloud:signOut"),
  getBillingPlans: () => ipcRenderer.invoke("billing:getPlans"),
  validatePromoCode: (payload) => ipcRenderer.invoke("billing:validatePromo", payload),
  redeemVoucherCode: (payload) => ipcRenderer.invoke("billing:redeemCode", payload),
  startPaystackCheckout: (payload) => ipcRenderer.invoke("billing:startPaystack", payload),
  verifyPaystackReference: (reference) => ipcRenderer.invoke("billing:verifyPaystack", reference),
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
  onUpdateStatusChanged: (cb) => {
    const listener = (_evt: Electron.IpcRendererEvent, status: any) => cb(status);
    ipcRenderer.on("updater:statusChanged", listener);
    return () => ipcRenderer.removeListener("updater:statusChanged", listener);
  },
  onCloudSessionChanged: (cb) => {
    const listener = (_evt: Electron.IpcRendererEvent, session: any) => cb(session);
    ipcRenderer.on("cloud:sessionChanged", listener);
    return () => ipcRenderer.removeListener("cloud:sessionChanged", listener);
  },
  onBillingCompleted: (cb) => {
    const listener = (_evt: Electron.IpcRendererEvent, result: any) => cb(result);
    ipcRenderer.on("billing:completed", listener);
    return () => ipcRenderer.removeListener("billing:completed", listener);
  },
  onWindowMaximizedChanged: (cb) => {
    const listener = (_evt: Electron.IpcRendererEvent, maximized: boolean) => cb(Boolean(maximized));
    ipcRenderer.on("window:maximizedChanged", listener);
    return () => ipcRenderer.removeListener("window:maximizedChanged", listener);
  },
};

contextBridge.exposeInMainWorld("cognitaraDesktop", api);
