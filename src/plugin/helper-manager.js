import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { JsonLineDecoder, encodeLine } from "./json-lines.js";

export class HelperManager extends EventEmitter {
  #child;
  #decoder = new JsonLineDecoder();
  #nextId = 1;
  #pending = new Map();
  #stopping = false;
  #restartTimer;
  #restartDelay = 250;

  constructor(pluginRoot, spawnProcess = spawn) {
    super();
    this.helperPath = join(pluginRoot, "native", "micmute-helper.exe");
    this.spawnProcess = spawnProcess;
  }

  start() {
    if (this.#child || this.#stopping) return;
    const child = this.spawnProcess(this.helperPath, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.#child = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this.#onData(chunk));
    child.stderr.on("data", (message) => this.emit("diagnostic", message.trim()));
    child.on("error", (error) => this.#onExit(error));
    child.on("exit", (code, signal) => this.#onExit(new Error(`Audio helper exited (${code ?? signal})`)));
  }

  async request(command, target) {
    this.start();
    if (!this.#child?.stdin.writable) throw new Error("Audio helper is unavailable");
    const id = String(this.#nextId++);
    const message = target ? { id, command, target } : { id, command };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Audio helper timed out: ${command}`));
      }, 4000);
      this.#pending.set(id, { resolve, reject, timeout });
      this.#child.stdin.write(encodeLine(message));
    });
  }

  stop() {
    this.#stopping = true;
    clearTimeout(this.#restartTimer);
    if (this.#child?.stdin.writable) this.#child.stdin.write(encodeLine({ command: "shutdown" }));
  }

  #onData(chunk) {
    let messages;
    try {
      messages = this.#decoder.push(chunk);
    } catch (error) {
      this.emit("diagnostic", `Invalid helper response: ${error.message}`);
      return;
    }
    for (const message of messages) {
      if (message.event) {
        this.emit(message.event, message);
        continue;
      }
      const pending = this.#pending.get(String(message.id));
      if (!pending) continue;
      clearTimeout(pending.timeout);
      this.#pending.delete(String(message.id));
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(`${message.error?.code ?? "HELPER_ERROR"}: ${message.error?.message ?? "Unknown helper error"}`));
    }
  }

  #onExit(error) {
    if (!this.#child) return;
    this.#child = undefined;
    for (const { reject, timeout } of this.#pending.values()) {
      clearTimeout(timeout);
      reject(error);
    }
    this.#pending.clear();
    this.emit("unavailable", error);
    if (!this.#stopping) {
      clearTimeout(this.#restartTimer);
      this.#restartTimer = setTimeout(() => this.start(), this.#restartDelay);
      this.#restartDelay = Math.min(this.#restartDelay * 2, 5000);
    }
  }
}
