import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const nextBuildDir = join(rootDir, "frontend", ".next");
const isWin = process.platform === "win32";

function removeNextBuildDir() {
  rmSync(nextBuildDir, { recursive: true, force: true });
}

function terminateNodeOnWindows() {
  const result = spawnSync("taskkill", ["/F", "/IM", "node.exe"], {
    stdio: "ignore",
    shell: false,
  });
  return result.status === 0;
}

try {
  removeNextBuildDir();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!isWin) {
    console.error(`Could not clean frontend build output: ${message}`);
    process.exit(1);
  }

  // OneDrive/Windows file locks can hold .next files from stale node processes.
  terminateNodeOnWindows();

  try {
    removeNextBuildDir();
  } catch (retryError) {
    const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
    console.error(
      [
        "Could not clean frontend build output after retry.",
        `Path: ${nextBuildDir}`,
        `Reason: ${retryMessage}`,
        "Close terminals running Next.js, wait for OneDrive sync to settle, then try again.",
      ].join("\n"),
    );
    process.exit(1);
  }
}
