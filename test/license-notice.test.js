import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { includesCompleteLicense } from "../scripts/license-notice.mjs";

const notice = readFileSync(new URL("../com.ulanzi.arkamax404micmute.ulanziPlugin/THIRD_PARTY_NOTICES.md", import.meta.url), "utf8");
const license = readFileSync(new URL("../node_modules/ws/LICENSE", import.meta.url), "utf8");
const lf = (text) => text.replace(/\r\n?/g, "\n");
const crlf = (text) => lf(text).replaceAll("\n", "\r\n");

test("accepts the complete ws license across LF and CRLF combinations", () => {
  for (const noticeText of [lf(notice), crlf(notice)]) {
    for (const licenseText of [lf(license), crlf(license)]) {
      assert.equal(includesCompleteLicense(noticeText, licenseText), true);
    }
  }
});

test("rejects modified or missing ws license text", () => {
  const modified = notice.replace("Permission is hereby granted", "Permission is not hereby granted");
  assert.equal(includesCompleteLicense(modified, license), false);
  assert.equal(includesCompleteLicense("# Third-Party Notices\n", license), false);
});
