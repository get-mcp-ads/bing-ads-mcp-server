import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the CLI reports the runtime check on stderr only", () => {
  const cli = readFileSync(new URL("../src/cli.ts", import.meta.url), "utf8");
  assert.match(cli, /nodeRuntimeWarning\(\)/);
  assert.match(cli, /if \(warning\) process\.stderr\.write\(/);
  assert.doesNotMatch(cli, /console\.log|process\.stdout/);
  const doctor = readFileSync(new URL("../scripts/doctor.mjs", import.meta.url), "utf8");
  assert.match(doctor, /nodeRuntimeWarning\(\)/);
});
