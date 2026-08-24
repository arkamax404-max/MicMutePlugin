import { resolve } from "node:path";
import { HelperManager } from "./helper-manager.js";
import { HostClient } from "./host-client.js";
import { normalizeSettings, presentStatus, toTarget } from "./state.js";

const PLUGIN_UUID = "com.ulanzi.ulanzistudio.arkamax404micmute";
const pluginRoot = resolve(__dirname, "..");
const contexts = new Map();
const host = new HostClient();
const helper = new HelperManager(pluginRoot);
let pollTimer;

host.connect(PLUGIN_UUID);
host.on("error", (error) => console.error(`[Ulanzi host] ${error.message}`));
helper.on("topologyChanged", handleTopologyChange);
helper.on("unavailable", (error) => {
  host.logMessage(error.message, "error");
  for (const context of contexts.keys()) render(context, { available: false });
});
helper.on("diagnostic", (message) => host.logMessage(message, "warn"));

host.onAdd((message) => {
  contexts.set(message.context, { settings: normalizeSettings(message.param), active: true });
  ensurePolling();
  refresh(message.context);
});

host.onSetActive((message) => {
  const action = contexts.get(message.context);
  if (!action) return;
  action.active = message.active === true || message.active === "true";
  if (action.active && action.status) render(message.context, action.status);
});

host.onRun(async (message) => {
  if (!contexts.has(message.context)) {
    contexts.set(message.context, { settings: normalizeSettings(message.param), active: true });
    ensurePolling();
  }
  const action = contexts.get(message.context);
  try {
    const status = await helper.request("toggle", toTarget(action.settings));
    action.status = status;
    render(message.context, status);
    refreshAll();
  } catch (error) {
    host.logMessage(error.message, "error");
    host.showAlert(message.context);
    render(message.context, { available: false });
  }
});

function applySettings(message) {
  const action = contexts.get(message.context) ?? { active: true };
  action.settings = normalizeSettings(message.param);
  contexts.set(message.context, action);
  ensurePolling();
  refresh(message.context);
}

host.onParamFromApp(applySettings);
host.onParamFromPlugin(applySettings);

host.onClear((message) => {
  for (const item of message.param ?? []) contexts.delete(item.context);
  ensurePolling();
});

host.onSendToPlugin(async (message) => {
  if (message.payload?.type !== "requestDevices") return;
  try {
    const result = await helper.request("list");
    host.sendToPropertyInspector({ type: "devices", devices: result.devices }, message.context);
  } catch (error) {
    host.sendToPropertyInspector({ type: "devices", devices: [], error: error.message }, message.context);
  }
});

async function refresh(context) {
  const action = contexts.get(context);
  if (!action) return;
  try {
    action.status = await helper.request("status", toTarget(action.settings));
  } catch (error) {
    action.status = { available: false };
    host.logMessage(error.message, "warn");
  }
  render(context, action.status);
}

function refreshAll() {
  for (const context of contexts.keys()) refresh(context);
}

async function handleTopologyChange() {
  refreshAll();
  try {
    const result = await helper.request("list");
    for (const context of contexts.keys()) {
      host.sendToPropertyInspector({ type: "devices", devices: result.devices }, context);
    }
  } catch (error) {
    host.logMessage(error.message, "warn");
  }
}

function render(context, status) {
  const action = contexts.get(context);
  if (!action?.active) return;
  const view = presentStatus(status, action.settings);
  host.setStateIcon(context, view.state, view.text);
}

function ensurePolling() {
  if (contexts.size && !pollTimer) pollTimer = setInterval(refreshAll, 2000);
  if (!contexts.size && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

process.once("exit", () => helper.stop());
process.once("SIGTERM", () => { helper.stop(); process.exit(0); });
process.once("SIGINT", () => { helper.stop(); process.exit(0); });
