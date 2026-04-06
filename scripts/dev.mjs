import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const frontendDir = join(rootDir, "frontend");
const backendDir = join(rootDir, "backend");

const isWin = process.platform === "win32";
const backendVenvPython = isWin
  ? join(backendDir, ".venv", "Scripts", "python.exe")
  : join(backendDir, ".venv", "bin", "python");
const backendPython = existsSync(backendVenvPython)
  ? { command: backendVenvPython, args: [] }
  : isWin
    ? { command: "python", args: [] }
    : { command: "python3", args: [] };
const npmCommand = "npm";

function getBackendStartupHelp(rootPath, backendPath) {
  return [
    "Unable to start backend service.",
    `Workspace root: ${rootPath}`,
    `Backend dir: ${backendPath}`,
    "Ensure backend dependencies are installed and Python is available.",
  ].join("\n");
}


function loadEnvFile(envPath) {
  if (!existsSync(envPath)) {
    return {};
  }

  const loaded = {};
  const contents = readFileSync(envPath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    let value = match[2].trim();
    const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
    const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
    if (isSingleQuoted || isDoubleQuoted) {
      value = value.slice(1, -1);
    }
    loaded[match[1]] = value;
  }

  return loaded;
}

const rootEnv = loadEnvFile(join(rootDir, ".env"));
const backendLocalEnv = loadEnvFile(join(backendDir, ".env"));
const backendPort =
  process.env.ML_BACKEND_PORT ??
  backendLocalEnv.ML_BACKEND_PORT ??
  rootEnv.ML_BACKEND_PORT ??
  "8000";
const frontendPort = process.env.FRONTEND_PORT ?? rootEnv.FRONTEND_PORT ?? "3000";

const frontendEnv = {
  ...rootEnv,
  ...process.env,
  ML_BACKEND_URL:
    process.env.ML_BACKEND_URL ??
    rootEnv.ML_BACKEND_URL ??
    `http://127.0.0.1:${backendPort}`,
  FRONTEND_PORT: frontendPort,
  ML_BACKEND_PORT: backendPort,
};

const backendEnv = {
  ...rootEnv,
  ...backendLocalEnv,
  ...process.env,
  ML_BACKEND_PORT: backendPort,
};

let shuttingDown = false;
let frontend;
let backend;

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  try {
    frontend?.kill("SIGTERM");
  } catch {}
  try {
    backend?.kill("SIGTERM");
  } catch {}

  setTimeout(() => {
    process.exit(exitCode);
  }, 300).unref();
}

function spawnService(command, args, cwd, env, options = {}) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: "inherit",
    ...(options.spawnOptions ?? {}),
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    if (signal) {
      shutdown(0);
      return;
    }
    shutdown(code ?? 0);
  });

  child.on("error", (error) => {
    if (shuttingDown) {
      return;
    }

    const detail =
      options.serviceName === "backend"
        ? `${getBackendStartupHelp(rootDir, backendDir)}\n\nOriginal error: ${error.message}`
        : `Unable to start ${options.serviceName ?? "service"}.\n\nOriginal error: ${error.message}`;

    console.error(detail);
    shutdown(1);
  });

  return child;
}

frontend = spawnService(
  npmCommand,
  ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", frontendPort],
  frontendDir,
  frontendEnv,
  // Windows: plain spawn("npm") gets ENOENT; shell finds npm.cmd on PATH.
  { spawnOptions: { shell: isWin }, serviceName: "frontend" },
);

backend = spawnService(
  backendPython.command,
  [
    ...backendPython.args,
    "-m",
    "uvicorn",
    "tradewise_backend.main:app",
    "--app-dir",
    "src",
    "--host",
    "127.0.0.1",
    "--port",
    backendPort,
    "--reload",
  ],
  backendDir,
  backendEnv,
  { serviceName: "backend" },
);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
