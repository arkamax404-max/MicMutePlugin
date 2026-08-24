export const DEFAULT_SETTINGS = Object.freeze({
  targetMode: "default",
  defaultRole: "console",
  deviceId: "",
  deviceName: "",
});

export function normalizeSettings(value = {}) {
  const targetMode = value.targetMode === "specific" ? "specific" : "default";
  const defaultRole = ["console", "multimedia", "communications"].includes(value.defaultRole)
    ? value.defaultRole
    : "console";
  return {
    targetMode,
    defaultRole,
    deviceId: typeof value.deviceId === "string" ? value.deviceId : "",
    deviceName: typeof value.deviceName === "string" ? value.deviceName : "",
  };
}

export function toTarget(settings) {
  return settings.targetMode === "specific"
    ? { mode: "specific", id: settings.deviceId }
    : { mode: "default", role: settings.defaultRole };
}

export function presentStatus(status, settings) {
  if (!status?.available) {
    return { state: 2, text: settings.targetMode === "specific" ? "UNAVAILABLE" : "NO DEFAULT" };
  }
  return { state: status.muted ? 0 : 1, text: status.muted ? "MUTED" : "LIVE" };
}
