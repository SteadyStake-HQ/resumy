import { existsSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const children = new Set();

function assertSupportedRuntime() {
  const pathValue = process.env.PATH ?? "";
  const isWindowsNodeFromMountedProject =
    process.platform === "win32" &&
    (
      rootDir.startsWith("/mnt/") ||
      /^\/?[A-Za-z]:[\\/]/.test(rootDir) && pathValue.includes("/usr/bin")
    );

  if (
    process.env.FORCE_MIXED_WSL_WINDOWS_NODE !== "true" &&
    (
      (process.platform === "win32" && process.env.WSLENV) ||
      isWindowsNodeFromMountedProject
    )
  ) {
    console.error(
      [
        "[dev] Windows Node is being used from inside WSL.",
        "[dev] This can start a mixed Windows/WSL Next.js process that accepts connections but hangs on dynamic routes.",
        "[dev] Install/use Linux Node inside WSL, then reinstall dependencies from WSL:",
        "[dev]   nvm install 22",
        "[dev]   nvm use 22",
        "[dev]   rm -rf node_modules .next",
        "[dev]   npm install",
        "[dev]   npm run taskiq:setup",
        "[dev]   npm run dev",
      ].join("\n"),
    );
    process.exit(1);
  }
}

function loadDotEnv() {
  const envPath = join(rootDir, ".env");

  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function parseLocalPort(urlValue) {
  try {
    const url = new URL(urlValue);

    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      return null;
    }

    return Number(url.port || (url.protocol === "https:" ? 443 : 80));
  } catch {
    return null;
  }
}

function disableTaskiqBridge(reason) {
  console.log(`[taskiq] ${reason}; using local in-process fallback.`);
  process.env.TASKIQ_BRIDGE_URL = "";
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(350);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function commandExists(command) {
  return new Promise((resolve) => {
    const probe = spawn("bash", ["-lc", `command -v ${command}`], {
      cwd: rootDir,
      stdio: "ignore",
    });

    probe.once("exit", (code) => resolve(code === 0));
    probe.once("error", () => resolve(false));
  });
}

function getVenvExecutable(name) {
  const venvDir = join(rootDir, ".venv");
  const candidates =
    process.platform === "win32"
      ? [
          join(venvDir, "Scripts", `${name}.exe`),
          join(venvDir, "Scripts", name),
          join(venvDir, "bin", name),
        ]
      : [
          join(venvDir, "bin", name),
          join(venvDir, "Scripts", `${name}.exe`),
          join(venvDir, "Scripts", name),
        ];

  return candidates.find((candidate) => existsSync(candidate)) ?? "";
}

function getPythonCommand() {
  const venvPython = getVenvExecutable("python");
  return existsSync(venvPython) ? venvPython : "python3";
}

function getTaskiqCommand() {
  const venvTaskiq = getVenvExecutable("taskiq");
  return existsSync(venvTaskiq) ? venvTaskiq : "taskiq";
}

function spawnShell(name, command, options = {}) {
  const child = spawn("bash", ["-lc", command], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
    ...options,
  });

  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (name !== "next") {
      console.log(`[${name}] exited${signal ? ` (${signal})` : code === null ? "" : ` (${code})`}`);
    }
  });
  child.once("error", (error) => {
    children.delete(child);
    console.warn(`[${name}] could not start:`, error.message);
  });

  return child;
}

function spawnCommand(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (name !== "next") {
      console.log(`[${name}] exited${signal ? ` (${signal})` : code === null ? "" : ` (${code})`}`);
    }
  });
  child.once("error", (error) => {
    children.delete(child);
    console.warn(`[${name}] could not start:`, error.message);
  });

  return child;
}

function getNextDevCommandArgs() {
  const args = process.argv.slice(2);
  const hasHostArg = args.some(
    (arg) => arg === "-H" || arg === "--hostname" || arg.startsWith("--hostname="),
  );

  return [
    "dev",
    "--webpack",
    ...(hasHostArg ? [] : ["-H", "0.0.0.0"]),
    ...args,
  ];
}

function parseNextDevPort(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if ((arg === "-p" || arg === "--port") && args[index + 1]) {
      const port = Number(args[index + 1]);
      return Number.isFinite(port) ? port : 3000;
    }

    if (arg.startsWith("--port=")) {
      const port = Number(arg.slice("--port=".length));
      return Number.isFinite(port) ? port : 3000;
    }
  }

  return Number(process.env.PORT || 3000);
}

async function clearStaleNextDevCache() {
  if (process.env.NEXT_CLEAN_DEV_CACHE === "false") {
    return;
  }

  const devPort = parseNextDevPort(process.argv.slice(2));

  if (await isPortOpen(devPort)) {
    console.log(`[next] dev server already listening on port ${devPort}; keeping .next/dev cache.`);
    return;
  }

  rmSync(join(rootDir, ".next", "dev"), { recursive: true, force: true });
}

async function maybeStartTaskiq() {
  if (process.env.TASKIQ_AUTO_START === "false") {
    console.log("[taskiq] auto-start disabled by TASKIQ_AUTO_START=false");
    return;
  }

  const bridgeUrl = process.env.TASKIQ_BRIDGE_URL?.trim();
  const bridgePort = bridgeUrl ? parseLocalPort(bridgeUrl) : null;

  if (!bridgePort) {
    console.log("[taskiq] no local TASKIQ_BRIDGE_URL configured; local fallback remains available");
    return;
  }

  const hasTaskiqWorker = existsSync(join(rootDir, "taskiq_worker", "bridge.py"));
  const hasPython = Boolean(getVenvExecutable("python")) || await commandExists("python3");
  const hasTaskiq = Boolean(getVenvExecutable("taskiq")) || await commandExists("taskiq");

  if (!hasTaskiqWorker || !hasPython || !hasTaskiq) {
    disableTaskiqBridge("Python sidecar is not installed yet");
    console.log(
      "[taskiq] Run `npm run taskiq:setup` once, then restart `npm run dev` to auto-start the bridge and worker.",
    );
    return;
  }

  const redisUrl = process.env.TASKIQ_REDIS_URL?.trim() || "redis://127.0.0.1:6379/0";
  const redisPort = parseLocalPort(redisUrl);

  if (redisPort && !(await isPortOpen(redisPort))) {
    disableTaskiqBridge(`Redis is not running at ${redisUrl}`);
    console.log(
      "[taskiq] Start Redis or leave this fallback enabled; uploads will still process locally.",
    );
    return;
  }

  if (await isPortOpen(bridgePort)) {
    console.log(`[taskiq] bridge already running on ${bridgeUrl}`);
    return;
  }

  const python = getPythonCommand();
  const taskiq = getTaskiqCommand();

  console.log(`[taskiq] starting bridge on ${bridgeUrl}`);
  spawnCommand(
    "taskiq-bridge",
    python,
    ["-m", "uvicorn", "taskiq_worker.bridge:app", "--host", "127.0.0.1", "--port", String(bridgePort)],
  );

  console.log("[taskiq] starting worker");
  spawnCommand(
    "taskiq-worker",
    taskiq,
    [
      "worker",
      "taskiq_worker.broker:broker",
      "taskiq_worker.tasks",
      "--workers",
      "1",
      "--max-async-tasks",
      "1",
    ],
  );
}

function shutdown(signal = "SIGTERM") {
  for (const child of children) {
    child.kill(signal);
  }
}

process.once("SIGINT", () => {
  shutdown("SIGINT");
  process.exit(130);
});
process.once("SIGTERM", () => {
  shutdown("SIGTERM");
  process.exit(143);
});
process.once("exit", () => shutdown());

assertSupportedRuntime();
loadDotEnv();
await clearStaleNextDevCache();
await maybeStartTaskiq();

const next = spawnShell(
  "next",
  `npm exec -- next ${getNextDevCommandArgs().join(" ")}`,
);
next.once("exit", (code) => {
  shutdown();
  process.exit(code ?? 0);
});
