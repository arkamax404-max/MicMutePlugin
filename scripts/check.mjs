import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { includesCompleteLicense } from "./license-notice.mjs";

const pluginSegment = "arkamax404micmute";
const pluginName = `com.ulanzi.${pluginSegment}.ulanziPlugin`;
const pluginUuid = `com.ulanzi.ulanzistudio.${pluginSegment}`;
const pluginRoot = new URL(`../${pluginName}/`, import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", pluginRoot), "utf8"));

const required = ["Author", "Name", "Icon", "Version", "CodePath", "Type", "UUID", "Actions"];
for (const field of required) {
  if (manifest[field] === undefined || manifest[field] === "") throw new Error(`manifest.json is missing ${field}`);
}
if (manifest.Author !== "Santiago Pérez") throw new Error("Manifest Author must use the approved public display name");
if (manifest.UUID !== pluginUuid || !/^com\.ulanzi\.ulanzistudio\.[A-Za-z0-9_-]+$/.test(manifest.UUID)) {
  throw new Error("Manifest UUID must have the official four-segment shape");
}
if (manifest.Type !== "JavaScript") throw new Error("Manifest Type must be JavaScript");
if (manifest.CodePath !== "dist/plugin.js") throw new Error("Manifest CodePath must use the Ulanzi-supported .js Node entry point");
if (existsSync(new URL("dist/plugin.cjs", pluginRoot))) throw new Error("Obsolete dist/plugin.cjs must be removed");
if (!Array.isArray(manifest.Actions) || manifest.Actions.length === 0) throw new Error("Manifest needs an action");
for (const action of manifest.Actions) {
  const actionSuffix = action.UUID.slice(manifest.UUID.length + 1);
  if (!action.UUID.startsWith(`${manifest.UUID}.`) || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(actionSuffix)) {
    throw new Error(`Invalid action UUID: ${action.UUID}`);
  }
  if (!Array.isArray(action.States) || action.States.length < 3) throw new Error("Toggle action needs mute, live, and unavailable states");
}

const thirdPartyNotice = readFileSync(new URL("THIRD_PARTY_NOTICES.md", pluginRoot), "utf8");
const wsLicense = readFileSync(new URL("../node_modules/ws/LICENSE", import.meta.url), "utf8");
if (!includesCompleteLicense(thirdPartyNotice, wsLicense)) throw new Error("Third-party notices must include the complete ws MIT license");

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? javascriptFiles(path) : /\.(?:js|mjs)$/.test(entry.name) ? [path] : [];
  });
}

for (const file of javascriptFiles(fileURLToPath(new URL("../src/", import.meta.url)))) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
for (const file of javascriptFiles(fileURLToPath(new URL(`../${pluginName}/property-inspector/`, import.meta.url)))) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
console.log(`Validated ${manifest.UUID} and JavaScript syntax.`);
