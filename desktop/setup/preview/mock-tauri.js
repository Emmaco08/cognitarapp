/* Browser-only mock of the Tauri v2 global API used for visual QA / UI development.
 * Injected by preview/render_screens.py (never shipped in the setup binary).
 */
(() => {
  const handlers = {};
  const params = new URLSearchParams(location.search);
  const update = params.get("update") === "1";
  const info = {
    productName: "CogniTara Studio",
    version: "2.2.2",
    preview: false,
    platform: "windows",
    defaultDir: "C:\\Program Files\\CogniTara Studio",
    dataDir: "C:\\ProgramData\\CogniTara",
    requiredBytes: 438 * 1024 * 1024,
    existing: update ? { version: "2.1.0", installDir: "C:\\Program Files\\CogniTara Studio", perMachine: true } : null,
    location: {
      path: "C:\\Program Files\\CogniTara Studio",
      drive: "C:",
      freeBytes: 118.4 * 1024 * 1024 * 1024,
      requiredBytes: 438 * 1024 * 1024,
      needsAdmin: true,
      problem: null,
    },
  };
  const emit = (ev, payload) => (handlers[ev] || []).forEach((cb) => cb({ event: ev, payload }));
  let simTimer = 0;
  const simulate = (opts) => {
    let p = 0;
    const steps = [
      [6, "Preparing installer…"], [22, "Unpacking application package…"], [48, "Extracting CogniTara engine…"],
      [66, "Extracting Studio interface…"], [92, "Installing program files…"], [96, "Configuring data folder…"], [99, "Creating shortcuts…"],
    ];
    clearInterval(simTimer);
    simTimer = setInterval(() => {
      p += 0.6;
      const s = steps.find((x) => p <= x[0]) || steps[steps.length - 1];
      emit("setup://progress", { percent: Math.min(p, 99), step: s[1], detail: "Installing to " + opts.installDir });
      if (p >= 100) {
        clearInterval(simTimer);
        emit("setup://finished", { ok: true, code: 0, title: "", message: "", detail: "", appExe: opts.installDir + "\\CogniTara Studio.exe", installDir: opts.installDir });
      }
    }, 60);
  };
  window.__mockEmit = emit;
  window.__TAURI__ = {
    core: {
      invoke: async (cmd, args) => {
        switch (cmd) {
          case "get_setup_info": return info;
          case "check_location": return Object.assign({}, info.location, { path: args.path });
          case "choose_folder": return "D:\\Apps\\CogniTara Studio";
          case "start_install": if (params.get("sim") === "1") simulate(args.options); return null;
          case "win_close": return true;
          default: return null;
        }
      },
    },
    event: {
      listen: async (ev, cb) => { (handlers[ev] = handlers[ev] || []).push(cb); return () => {}; },
    },
  };
})();
