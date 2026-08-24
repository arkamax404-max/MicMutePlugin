const ACTION_UUID = "com.ulanzi.ulanzistudio.arkamax404micmute.toggle";
const form = document.querySelector("#settings");
const panel = document.querySelector(".panel");
const roleField = document.querySelector("#role-field");
const deviceField = document.querySelector("#device-field");
const deviceSelect = form.elements.deviceId;
const status = document.querySelector("#status");
let settings = { targetMode: "default", defaultRole: "console", deviceId: "", deviceName: "" };
let devices = [];
let connected = false;

$UD.on("connected", () => {
  connected = true;
  panel.setAttribute("aria-busy", "false");
  setStatus("Loading capture devices...");
  $UD.sendToPlugin({ type: "requestDevices" });
});

for (const event of ["add", "paramfromapp", "didReceiveSettings"]) {
  $UD.on(event, (message) => {
    const incoming = message.param || message.settings;
    if (!incoming) return;
    settings = { ...settings, ...incoming };
    applySettings();
  });
}

$UD.on("sendToPropertyInspector", (message) => {
  if (message.payload?.type !== "devices") return;
  devices = message.payload.devices || [];
  renderDevices(message.payload.error);
});

form.addEventListener("change", () => {
  const data = new FormData(form);
  settings.targetMode = data.get("targetMode") || "default";
  settings.defaultRole = data.get("defaultRole") || "console";
  settings.deviceId = data.get("deviceId") || settings.deviceId || "";
  settings.deviceName = devices.find((device) => device.id === settings.deviceId)?.name || settings.deviceName || "";
  renderMode();
  $UD.sendParamFromPlugin(settings);
});

function applySettings() {
  for (const input of form.elements.targetMode) input.checked = input.value === settings.targetMode;
  form.elements.defaultRole.value = settings.defaultRole;
  renderMode();
  renderDevices();
}

function renderMode() {
  const specific = settings.targetMode === "specific";
  roleField.hidden = specific;
  deviceField.hidden = !specific;
  if (!specific) setStatus("The selected Windows default role is resolved on every toggle.", "ready");
  else if (!devices.length) setStatus(connected ? "No active capture devices found." : "Connecting to audio service...", "error");
}

function renderDevices(error) {
  deviceSelect.replaceChildren();
  const selected = devices.find((device) => device.id === settings.deviceId);
  if (settings.deviceId && !selected) addOption(settings.deviceId, `${settings.deviceName || "Selected device"} (unavailable)`);
  for (const device of devices) addOption(device.id, device.name);
  if (!devices.length && !settings.deviceId) addOption("", error ? "Audio service unavailable" : "No active devices");
  deviceSelect.value = settings.deviceId;
  deviceSelect.disabled = Boolean(error) || (!devices.length && !settings.deviceId);
  if (error) setStatus(error, "error");
  else if (settings.targetMode === "specific" && settings.deviceId && !selected) setStatus("The fixed device is unavailable. It will not fall back.", "error");
  else if (settings.targetMode === "specific" && selected) setStatus("The fixed endpoint ID is stored exactly as Windows provided it.", "ready");
}

function addOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  deviceSelect.append(option);
}

function setStatus(message, kind = "") {
  status.textContent = message;
  status.dataset.kind = kind;
}

$UD.connect(ACTION_UUID);
