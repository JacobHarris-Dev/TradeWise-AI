import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getBackendStartupHelp, resolveBackendPython } from "./dev-utils.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const backendDir = join(rootDir, "backend");
const backendPython = resolveBackendPython(rootDir, backendDir);
const backendPort = process.env.ML_BACKEND_PORT ?? "8000";

const child = spawn(
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
  {
    cwd: backendDir,
    env: {
      ...process.env,
      ML_BACKEND_PORT: backendPort,
    },
    stdio: "inherit",
    shell: false,
  },
);

child.on("error", (error) => {
  console.error(`${getBackendStartupHelp(rootDir, backendDir)}\n\nOriginal error: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(0);
  }

  process.exit(code ?? 0);
});
