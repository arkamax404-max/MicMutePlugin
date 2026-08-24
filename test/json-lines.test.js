import assert from "node:assert/strict";
import test from "node:test";
import { JsonLineDecoder, encodeLine } from "../src/plugin/json-lines.js";

test("decodes split and batched JSON Lines without losing opaque IDs", () => {
  const decoder = new JsonLineDecoder();
  assert.deepEqual(decoder.push('{"id":"1","result":{"id":"opaque'), []);
  assert.deepEqual(decoder.push('\\\\value"}}\n{"event":"topologyChanged"}\n'), [
    { id: "1", result: { id: "opaque\\value" } },
    { event: "topologyChanged" },
  ]);
});

test("encodes exactly one newline-delimited message", () => {
  assert.equal(encodeLine({ command: "status" }), '{"command":"status"}\n');
});
