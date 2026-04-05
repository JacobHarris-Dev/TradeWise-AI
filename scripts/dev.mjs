import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const frontendDir = join(rootDir, "frontend");
const backendDir = join(rootDir, "backend");
const backendVenvPython = join(backendDir, ".venv", "bin", "python");
const backendPython = existsSync(backendVenvPython) ? backendVenvPython : "python3";

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

function spawnService(command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: "inherit",
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

  return child;
}

frontend = spawnService(
  "npm",
  ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", frontendPort],
  frontendDir,
  frontendEnv,
);

backend = spawnService(
  backendPython,
  [
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
);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
