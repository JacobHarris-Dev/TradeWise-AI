import { spawnSync } from "node:child_process";
import { join } from "node:path";

const isWindows = process.platform === "win32";
const pythonExecutable = isWindows ? "python.exe" : "python";
const pythonBinDir = isWindows ? "Scripts" : "bin";

function canSpawn(command, args) {
  const result = spawnSync(command, args, {
    stdio: "ignore",
    shell: false,
  });

  return !result.error && result.status === 0;
}

export function getNpmCommand() {
  return isWindows ? "npm.cmd" : "npm";
}

export function resolveBackendPython(rootDir, backendDir) {
  const explicitPythonPath = process.env.ML_BACKEND_PYTHON_PATH?.trim();
  if (explicitPythonPath && canSpawn(explicitPythonPath, ["--version"])) {
    return {
      command: explicitPythonPath,
      args: [],
      source: explicitPythonPath,
    };
  }

  const preferredEnvName = process.env.ML_BACKEND_PYTHON_ENV?.trim();
  const preferredCandidates = preferredEnvName
    ? [
        join(backendDir, preferredEnvName, pythonBinDir, pythonExecutable),
        join(rootDir, preferredEnvName, pythonBinDir, pythonExecutable),
      ]
    : [];

  const venvCandidates = [
    ...preferredCandidates,
    join(rootDir, ".venv312", pythonBinDir, pythonExecutable),
    join(backendDir, "venv", pythonBinDir, pythonExecutable),
    join(backendDir, "venv311", pythonBinDir, pythonExecutable),
    join(backendDir, ".venv", pythonBinDir, pythonExecutable),
    join(rootDir, ".venv", pythonBinDir, pythonExecutable),
  ];

  for (const candidate of venvCandidates) {
    if (canSpawn(candidate, ["--version"])) {
      return {
        command: candidate,
        args: [],
        source: candidate,
      };
    }
  }

  const pathCandidates = isWindows
    ? [
        { command: "py", args: ["-3"], source: "py -3" },
        { command: "python", args: [], source: "python" },
      ]
    : [
        { command: "python3", args: [], source: "python3" },
        { command: "python", args: [], source: "python" },
      ];

  for (const candidate of pathCandidates) {
    if (canSpawn(candidate.command, [...candidate.args, "--version"])) {
      return candidate;
    }
  }

  return {
    command: pathCandidates[0].command,
    args: pathCandidates[0].args,
    source: pathCandidates[0].source,
  };
}

export function getBackendStartupHelp(rootDir, backendDir) {
  const backendVenv = join(backendDir, ".venv");
  const repoVenv = join(rootDir, ".venv");
  const preferredEnvName = process.env.ML_BACKEND_PYTHON_ENV?.trim();

  if (isWindows) {
    return [
      "Unable to start the Python backend on Windows.",
      `Checked: ${backendVenv} and ${repoVenv}`,
      "Expected one of: a working virtualenv, `py -3`, or `python` on PATH.",
      "Create or repair a virtualenv, then install backend requirements.",
      "Example:",
      `  py -3 -m venv ${backendVenv}`,
      `  ${join(backendVenv, "Scripts", "python.exe")} -m pip install -r ${join(backendDir, "requirements.txt")}`,
    ].join("\n");
  }

  return [
    "Unable to start the Python backend.",
    `Checked: ${backendVenv} and ${repoVenv}`,
    preferredEnvName
      ? `Also checked preferred env: ${join(backendDir, preferredEnvName)}`
      : "Tip: set ML_BACKEND_PYTHON_ENV=.venv312 to force the Python 3.12 backend env.",
    "Expected one of: a working virtualenv, `python3`, or `python` on PATH.",
    "Create or repair a virtualenv, then install backend requirements.",
  ].join("\n");
}
