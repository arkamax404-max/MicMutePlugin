import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function findCmake() {
  try {
    return execFileSync(process.platform === "win32" ? "where.exe" : "which", ["cmake"], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
  } catch {
    const programFiles = process.env["ProgramFiles(x86)"];
    const vswhere = programFiles && join(programFiles, "Microsoft Visual Studio", "Installer", "vswhere.exe");
    if (!vswhere || !existsSync(vswhere)) throw new Error("CMake was not found. Install Visual Studio C++ Build Tools with CMake.");
    const installation = execFileSync(vswhere, [
      "-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.CMake.Project", "-property", "installationPath",
    ], { encoding: "utf8" }).trim();
    const bundled = join(installation, "Common7", "IDE", "CommonExtensions", "Microsoft", "CMake", "CMake", "bin", "cmake.exe");
    if (!existsSync(bundled)) throw new Error("Visual Studio is installed without its CMake component.");
    return bundled;
  }
}

const cmake = findCmake();
execFileSync(cmake, ["-S", "native", "-B", "build/native", "-A", "x64"], { stdio: "inherit" });
execFileSync(cmake, ["--build", "build/native", "--config", "Release"], { stdio: "inherit" });
