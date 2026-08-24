import { createWriteStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import yazl from "yazl";

const pluginName = "com.ulanzi.arkamax404micmute.ulanziPlugin";
const pluginRoot = new URL(`../${pluginName}/`, import.meta.url);
const pluginPath = fileURLToPath(pluginRoot);
const required = ["manifest.json", "dist/plugin.cjs", "native/micmute-helper.exe", "THIRD_PARTY_NOTICES.md"];
for (const file of required) {
  if (!existsSync(new URL(file, pluginRoot))) throw new Error(`Build output is missing: ${file}`);
}

const releaseDir = new URL("../release/", import.meta.url);
mkdirSync(releaseDir, { recursive: true });
const output = new URL(`../release/${pluginName}.zip`, import.meta.url);
const zip = new yazl.ZipFile();

function addDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) addDirectory(path);
    else zip.addFile(path, `${pluginName}/${relative(pluginPath, path).replaceAll("\\", "/")}`);
  }
}

addDirectory(pluginPath);
zip.end();
await new Promise((resolve, reject) => {
  zip.outputStream.pipe(createWriteStream(output)).on("close", resolve).on("error", reject);
});
console.log(`Created ${basename(output.pathname)} with ${pluginName} as its root.`);
