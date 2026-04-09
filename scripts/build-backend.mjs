import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getBackendStartupHelp, resolveBackendPython } from "./dev-utils.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const backendDir = join(rootDir, "backend");
const backendPython = resolveBackendPython(rootDir, backendDir);

const result = spawnSync(
  backendPython.command,
  [
    ...backendPython.args,
    "-m",
    "compileall",
    "-q",
    "-f",
    join("src", "tradewise_backend"),
  ],
  {
    cwd: backendDir,
    env: process.env,
    stdio: "inherit",
    shell: false,
  },
);

if (result.error) {
  console.error(`${getBackendStartupHelp(rootDir, backendDir)}\n\nOriginal error: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 0);
