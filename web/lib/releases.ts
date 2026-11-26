const FALLBACK_RELEASE_URL = "https://github.com/Emmaco08/cognitarapp/releases/latest";

let cachedRelease: { url: string; version: string; expiresAt: number } | null = null;

export async function resolveLatestWindowsInstaller(): Promise<{ url: string; version: string }> {
  const now = Date.now();
  if (cachedRelease && cachedRelease.expiresAt > now) {
    return { url: cachedRelease.url, version: cachedRelease.version };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("https://api.github.com/repos/Emmaco08/cognitarapp/releases/latest", {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "CogniTara-Cloud/2.3",
      },
      cache: "no-store",
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json().catch(() => null)) as {
        tag_name?: string;
        html_url?: string;
        assets?: Array<{ name?: string; browser_download_url?: string }>;
      } | null;
      const version = String(data?.tag_name || "v2.2.7");
      const exeAsset = Array.isArray(data?.assets)
        ? data.assets.find((a) => typeof a?.name === "string" && a.name.toLowerCase().endsWith(".exe"))
        : null;
      const url = exeAsset?.browser_download_url || data?.html_url || FALLBACK_RELEASE_URL;
      cachedRelease = { url, version, expiresAt: now + 5 * 60 * 1000 };
      return { url, version };
    }
  } catch {
    // Fallback cleanly if GitHub API is unreachable
  }

  return { url: FALLBACK_RELEASE_URL, version: "v2.2.7" };
}
