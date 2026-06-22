import chromium from "@sparticuz/chromium";
import { existsSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type LaunchOptions } from "puppeteer-core";

const COMMON_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-zygote",
];

function findLocalChromeExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    process.platform === "win32"
      ? join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.platform === "win32"
      ? join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : null,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export async function getChromiumLaunchOptions(): Promise<LaunchOptions> {
  const localExecutablePath = findLocalChromeExecutable();

  if (localExecutablePath) {
    return {
      args: COMMON_ARGS,
      executablePath: localExecutablePath,
      headless: true,
    };
  }

  if (process.platform !== "linux") {
    throw new Error(
      "Chrome was not found. Configure PUPPETEER_EXECUTABLE_PATH for local PDF exports.",
    );
  }

  chromium.setGraphicsMode = false;
  const headless = "shell" as const;

  return {
    args: puppeteer.defaultArgs({
      args: [...chromium.args, ...COMMON_ARGS],
      headless,
    }),
    executablePath: await chromium.executablePath(),
    headless,
  };
}

export { puppeteer };
