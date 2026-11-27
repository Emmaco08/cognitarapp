/**
 * Electron Builder `afterPack` hook: Flips Electron Fuses on the packaged
 * `CogniTara Studio.exe` binary to harden against reverse engineering and runtime injection:
 * - RunAsNode: false (prevents running arbitrary Node scripts with the Studio binary)
 * - EnableNodeOptionsEnvironmentVariable: false (blocks NODE_OPTIONS injection)
 * - EnableNodeCliInspectArguments: false (blocks --inspect / --inspect-brk remote debugging)
 * - OnlyLoadAppFromAsar: true (prevents loading modified unpacked JS over app.asar)
 */

const path = require("node:path");
const fs = require("node:fs");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");

exports.default = async function afterPack(context) {
  const exeName = context.electronPlatformName === "win32"
    ? `${context.packager.appInfo.productFilename}.exe`
    : context.packager.appInfo.productFilename;
  const exePath = path.join(context.appOutDir, exeName);

  if (!fs.existsSync(exePath)) {
    console.warn(`[afterPack] Skipping fuses: binary not found at ${exePath}`);
    return;
  }

  await flipFuses(exePath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });

  console.log(`[afterPack] Electron security fuses flipped on ${exeName}.`);
};
