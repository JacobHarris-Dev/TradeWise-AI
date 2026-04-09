import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  getBackendStartupHelp,
  getNpmCommand,
  resolveBackendPython,
} from "./dev-utils.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const frontendDir = join(rootDir, "frontend");
const backendDir = join(rootDir, "backend");
const isWin = process.platform === "win32";
const npmCommand = getNpmCommand();
const backendPython = resolveBackendPython(rootDir, backendDir);

const backendHost = process.env.ML_BACKEND_HOST?.trim() || "127.0.0.1";
const backendPort = process.env.ML_BACKEND_PORT?.trim() || "8000";
const frontendHost = process.env.FRONTEND_HOST?.trim() || "127.0.0.1";
const frontendPort = process.env.FRONTEND_PORT?.trim() || "3000";
const backendBaseUrl = process.env.ML_BACKEND_URL?.trim() || `http://${backendHost}:${backendPort}`;

let shuttingDown = false;
let backend;
let frontend;

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

function buildEnv() {
  const rootEnv = loadEnvFile(join(rootDir, ".env"));
  const backendEnvFile = loadEnvFile(join(backendDir, ".env"));

  return {
    frontendEnv: {
      ...rootEnv,
      ...process.env,
      ML_BACKEND_URL: backendBaseUrl,
      FRONTEND_PORT: frontendPort,
      ML_BACKEND_PORT: backendPort,
    },
    backendEnv: {
      ...rootEnv,
      ...backendEnvFile,
      ...process.env,
      ML_BACKEND_HOST: backendHost,
      ML_BACKEND_PORT: backendPort,
    },
  };
}

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

  setTimeout(() => process.exit(exitCode), 300).unref();
}

function spawnService(command, args, cwd, env, options = {}) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: options.shell ?? false,
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

function runCommand(command, args, cwd, env, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
      shell: options.shell ?? false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${options.label ?? command} exited with code ${code ?? 1}`));
    });
  });
}

async function waitForBackend(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "unknown backend error";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL("/health", url));
      if (response.ok) {
        return;
      }
      lastError = `backend returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Backend did not become healthy within ${timeoutMs}ms: ${lastError}`);
}

async function main() {
  const { frontendEnv, backendEnv } = buildEnv();

  console.log("Building frontend for demo...");
  await runCommand(
    npmCommand,
    ["run", "build"],
    frontendDir,
    frontendEnv,
    { shell: isWin, label: "frontend build" },
  );

  console.log(`Starting backend on ${backendBaseUrl} ...`);
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
      backendHost,
      "--port",
      backendPort,
    ],
    backendDir,
    backendEnv,
    { serviceName: "backend" },
  );

  await waitForBackend(backendBaseUrl);
  console.log(`Backend healthy at ${backendBaseUrl}/health`);

  console.log(`Starting frontend on http://${frontendHost}:${frontendPort} ...`);
  frontend = spawnService(
    npmCommand,
    ["run", "start", "--", "--hostname", frontendHost, "--port", frontendPort],
    frontendDir,
    frontendEnv,
    { shell: isWin, serviceName: "frontend" },
  );
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  shutdown(1);
});
