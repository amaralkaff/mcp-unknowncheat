import { connect } from "puppeteer-real-browser";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = path.join(__dirname, "..", "cookies.json");
const CLOUDFLARE_INDICATORS = ["Just a moment", "cf-browser-verification", "Checking your browser"];
const NAV_TIMEOUT = 30_000;
const NAV_TIMEOUT_RETRY = 60_000;
const CF_WAIT_MS = 15_000;

type BrowserInstance = {
  browser: Awaited<ReturnType<typeof connect>>["browser"];
  page: Awaited<ReturnType<typeof connect>>["page"];
};

let instance: BrowserInstance | null = null;

async function loadCookies(page: BrowserInstance["page"]): Promise<void> {
  try {
    const file = Bun.file(COOKIES_PATH);
    if (await file.exists()) {
      const cookies = await file.json();
      if (Array.isArray(cookies) && cookies.length > 0) {
        await page.setCookie(...cookies);
        console.error("[browser] Loaded cookies from", COOKIES_PATH);
      }
    }
  } catch (err) {
    console.error("[browser] Cookie load failed (starting fresh):", err);
  }
}

async function saveCookies(page: BrowserInstance["page"]): Promise<void> {
  try {
    const cookies = await page.cookies();
    await Bun.write(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  } catch (err) {
    console.error("[browser] Cookie save failed:", err);
  }
}

async function launchBrowser(): Promise<BrowserInstance> {
  console.error("[browser] Launching Chrome...");
  const { browser, page } = await connect({
    headless: false,
    turnstile: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    customConfig: {},
    connectOption: {
      defaultViewport: null,
    },
    disableXvfb: false,
  });

  browser.on("disconnected", () => {
    console.error("[browser] Browser disconnected");
    instance = null;
  });

  await loadCookies(page);
  return { browser, page };
}

export async function getPage(): Promise<BrowserInstance["page"]> {
  if (!instance) {
    instance = await launchBrowser();
  }
  return instance.page;
}

export async function ensureFreshBrowser(): Promise<BrowserInstance["page"]> {
  if (instance) {
    try {
      await instance.browser.close();
    } catch {
      // ignore — may already be dead
    }
    instance = null;
  }
  instance = await launchBrowser();
  return instance.page;
}

function hasCloudflareChallenge(html: string): boolean {
  return CLOUDFLARE_INDICATORS.some((indicator) => html.includes(indicator));
}

function isDetachedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    msg.includes("Detached Frame") ||
    msg.includes("Execution context was destroyed") ||
    msg.includes("Target closed") ||
    msg.includes("Session closed")
  );
}

export async function navigateWithRetry(url: string): Promise<{ page: BrowserInstance["page"]; html: string }> {
  let page = await getPage();
  let retried = false;

  const attempt = async (timeout: number): Promise<string> => {
    await page.goto(url, { waitUntil: "networkidle2", timeout });

    let html = await page.content();

    if (hasCloudflareChallenge(html)) {
      console.error("[browser] Cloudflare challenge detected, waiting", CF_WAIT_MS, "ms...");
      await new Promise((res) => setTimeout(res, CF_WAIT_MS));
      html = await page.content();

      if (hasCloudflareChallenge(html)) {
        throw new Error("CloudflareBlockError: Challenge did not resolve after waiting");
      }
    }

    await saveCookies(page);
    return html;
  };

  try {
    const html = await attempt(NAV_TIMEOUT);
    return { page, html };
  } catch (err) {
    if (isDetachedError(err) && !retried) {
      console.error("[browser] Detached frame error, relaunching browser and retrying...");
      retried = true;
      page = await ensureFreshBrowser();
      const html = await attempt(NAV_TIMEOUT_RETRY);
      return { page, html };
    }
    throw err;
  }
}

export async function closeBrowser(): Promise<void> {
  if (instance) {
    try {
      await instance.browser.close();
    } catch {
      // ignore
    }
    instance = null;
  }
}
