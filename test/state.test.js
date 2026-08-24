import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSettings, presentStatus, toTarget } from "../src/plugin/state.js";

test("normalizes unknown settings to an explicit console default", () => {
  assert.deepEqual(normalizeSettings({ targetMode: "other", defaultRole: "voice" }), {
    targetMode: "default", defaultRole: "console", deviceId: "", deviceName: "",
  });
});

test("preserves opaque fixed endpoint IDs", () => {
  const settings = normalizeSettings({ targetMode: "specific", deviceId: "{0.0.1.00000000}.opaque\\id", deviceName: "Desk mic" });
  assert.deepEqual(toTarget(settings), { mode: "specific", id: "{0.0.1.00000000}.opaque\\id" });
});

test("maps helper status to all manifest states", () => {
  const defaults = normalizeSettings();
  assert.deepEqual(presentStatus({ available: true, muted: true }, defaults), { state: 0, text: "MUTED" });
  assert.deepEqual(presentStatus({ available: true, muted: false }, defaults), { state: 1, text: "LIVE" });
  assert.deepEqual(presentStatus({ available: false }, defaults), { state: 2, text: "NO DEFAULT" });
  assert.equal(presentStatus({ available: false }, normalizeSettings({ targetMode: "specific" })).text, "UNAVAILABLE");
});
