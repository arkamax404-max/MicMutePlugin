import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const helper = fileURLToPath(new URL("../com.ulanzi.arkamax404micmute.ulanziPlugin/native/micmute-helper.exe", import.meta.url));
const child = spawn(helper, [], { stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
const responses = new Map();
const lines = createInterface({ input: child.stdout });
let specificRequested = false;

const finished = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Native helper smoke test timed out")), 5000);
  lines.on("line", (line) => {
    const message = JSON.parse(line);
    if (message.id) responses.set(message.id, message);
    if (message.id === "list" && message.result?.devices?.length && !specificRequested) {
      specificRequested = true;
      child.stdin.write(`${JSON.stringify({ id: "specific", command: "status", target: { mode: "specific", id: message.result.devices[0].id } })}\n`);
    }
    const listComplete = responses.has("list");
    const specificComplete = !responses.get("list")?.result?.devices?.length || responses.has("specific");
    if (listComplete && responses.has("status") && specificComplete) {
      clearTimeout(timeout);
      resolve();
    }
  });
  child.on("error", reject);
  child.on("exit", (code) => {
    if (code && !responses.has("status")) reject(new Error(`Native helper exited with ${code}`));
  });
});

child.stdin.write(`${JSON.stringify({ id: "list", command: "list" })}\n`);
child.stdin.write(`${JSON.stringify({ id: "status", command: "status", target: { mode: "default", role: "console" } })}\n`);
await finished;
child.stdin.write(`${JSON.stringify({ command: "shutdown" })}\n`);

const list = responses.get("list");
const status = responses.get("status");
if (!list.ok || !Array.isArray(list.result?.devices)) throw new Error("Native list response has an invalid shape");
if (!status.ok || typeof status.result?.available !== "boolean") throw new Error("Native status response has an invalid shape");
if (responses.has("specific") && (!responses.get("specific").ok || responses.get("specific").result?.id !== list.result.devices[0].id)) {
  throw new Error("Native helper did not preserve the fixed opaque endpoint ID");
}
console.log(`Native helper listed ${list.result.devices.length} active capture device(s); console default available: ${status.result.available}.`);
