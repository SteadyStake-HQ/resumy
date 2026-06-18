import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const venvDir = join(rootDir, ".venv");
const requirementsPath = join(rootDir, "taskiq_worker", "requirements.txt");

function getVenvExecutable(name) {
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

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function getPythonLauncher() {
  return process.platform === "win32" ? "py" : "python3";
}

const pythonBin = getVenvExecutable("python");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
  }
}

if (!existsSync(requirementsPath)) {
  throw new Error("taskiq_worker/requirements.txt was not found.");
}

if (!existsSync(pythonBin)) {
  console.log("[taskiq:setup] creating .venv");
  run(getPythonLauncher(), ["-m", "venv", ".venv"]);
}

console.log("[taskiq:setup] upgrading pip");
run(pythonBin, ["-m", "pip", "install", "--upgrade", "pip"]);

console.log("[taskiq:setup] installing Taskiq sidecar dependencies");
run(pythonBin, ["-m", "pip", "install", "-r", requirementsPath]);

console.log("[taskiq:setup] ready. npm run dev can now auto-start Taskiq.");
