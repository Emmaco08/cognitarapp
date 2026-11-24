# Windows Code Signing Guide — Removing "Unknown Publisher" & SmartScreen Warnings

When an unsigned Windows executable is downloaded from the internet (for example from GitHub Releases), Windows Defender SmartScreen displays **"Windows protected your PC — Publisher: Unknown publisher"**.

No code or manifest change can remove that warning on its own: Windows requires a valid **Authenticode** signature chained to a trusted Certificate Authority (CA) tied to your verified identity or organization.

The GitHub Actions workflow [`.github/workflows/build-windows-desktop.yml`](../.github/workflows/build-windows-desktop.yml) is already wired for automatic code signing. It stays inert while no signing secrets are set, and automatically signs every executable as soon as you add either set of secrets below.

## What Gets Signed Automatically

When signing is enabled in CI, the workflow signs all Windows binaries in order with SHA-256 and an RFC-3161 DigiCert timestamp (`http://timestamp.digicert.com`):

1. `desktop/resources/engine/cognitara-engine.exe` (PyInstaller CBT engine)
2. `desktop/release/win-unpacked/CogniTara Studio.exe` (Electron app executable, signed during `electron-builder`)
3. `desktop/release/CogniTara-Studio-Update-<ver>-x64.exe` (NSIS auto-update package & embedded payload)
4. `desktop/release/CogniTara-Studio-Setup-<ver>-x64.exe` (Custom Tauri v2 Adobe/CorelDRAW-style direct installer)

---

## Option 1 (Recommended): Microsoft Azure Trusted Signing

**Cost:** ~\$9.99/month (Basic tier) — includes cloud HSM storage and instant SmartScreen reputation benefits once identity verification completes.

### 1. Provision Azure Trusted Signing
1. Open the Azure Portal and create a **Trusted Signing Account** (choose a supported region such as `East US`, `West US 2`, or `North Europe`).
2. Under **Identity validations**, submit either an **Organization** or **Individual** identity validation and wait for approval (typically 1–3 business days).
3. Under **Certificate profiles**, create a **Public Trust** certificate profile bound to your approved identity.
4. Create a Microsoft Entra ID **App Registration** (Service Principal), generate a Client Secret, and assign it the **Trusted Signing Certificate Profile Signer** role on your Trusted Signing Account.

### 2. Add GitHub Repository Secrets
In your GitHub repository go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret Name | Example / Value |
|---|---|
| `AZURE_TENANT_ID` | Microsoft Entra Directory (Tenant) ID (GUID) |
| `AZURE_CLIENT_ID` | App Registration Application (Client) ID (GUID) |
| `AZURE_CLIENT_SECRET` | Client secret value |
| `AZURE_SIGNING_ENDPOINT` | e.g. `https://eus.codesigning.azure.net` |
| `AZURE_SIGNING_ACCOUNT` | Your Trusted Signing account name |
| `AZURE_CERT_PROFILE` | Your Public Trust certificate profile name |
| `WIN_PUBLISHER_NAME` | *(Optional)* Exact certificate Subject CN (e.g. `CogniTara Education Technologies`) for `electron-updater` verification |

---

## Option 2: Standard OV Code Signing Certificate (`.pfx`)

**Providers:** Certum Open Source / Standard Code Signing, SSL.com, Sectigo, DigiCert.
*(Note: Industry CA/Browser Forum rules issued after June 2023 require private keys on HSM/USB tokens or cloud KMS; if your CA provides a cloud-exportable `.pfx` or PKCS#12 bundle for CI, use the secrets below.)*

### 1. Base64-Encode Your `.pfx`
On PowerShell:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("cognitara-cert.pfx")) | Set-Clipboard
```
Or on macOS / Linux:
```bash
base64 -w 0 cognitara-cert.pfx
```

### 2. Add GitHub Repository Secrets
In **Settings → Secrets and variables → Actions**, add:

| Secret Name | Value |
|---|---|
| `WIN_CSC_LINK` | Base64 string of your `.pfx` certificate (no line breaks) |
| `WIN_CSC_KEY_PASSWORD` | Password protecting the `.pfx` certificate |
| `WIN_PUBLISHER_NAME` | *(Optional)* Exact certificate Subject CN |

> **Security note:** Never commit `.pfx`, `.p12`, `.cer`, private keys, or passwords into git. Store them exclusively in GitHub Actions Secrets.

---

## SmartScreen Reputation & `electron-updater` Notes

- **SmartScreen reputation:** Even with a valid OV certificate, SmartScreen may initially show a brief warning on brand-new binaries until Microsoft observes downloads across unique PCs. Azure Trusted Signing and EV certificates build SmartScreen reputation significantly faster. You can also submit newly signed `.exe` releases to the [Microsoft Security Intelligence software developer portal](https://www.microsoft.com/en-us/wdsi/filesubmission) to accelerate reputation approval.
- **`electron-updater` publisher verification:** `desktop/electron-builder.yml` intentionally omits a hardcoded `publisherName` while builds are unsigned so in-app auto-updates do not fail signature checks on unsigned releases. Once you configure signing secrets and set `WIN_PUBLISHER_NAME`, CI passes `-c.win.publisherName` automatically.
- **Verify a signed release locally (Windows PowerShell):**
  ```powershell
  Get-AuthenticodeSignature .\CogniTara-Studio-Setup-2.2.0-x64.exe | Format-List
  ```
  Status should report `Valid` with your verified Publisher CN and DigiCert RFC-3161 timestamp.
