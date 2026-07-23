import assert from "node:assert/strict";
import test from "node:test";

import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "./demo-accounts";

test("demo accounts cover every response role with distinct emails", () => {
  assert.deepEqual(
    DEMO_ACCOUNTS.map((account) => account.role),
    ["operator", "controller", "admin"],
  );
  assert.equal(
    new Set(DEMO_ACCOUNTS.map((account) => account.email)).size,
    DEMO_ACCOUNTS.length,
  );
  assert.ok(DEMO_PASSWORD.length >= 16);
});
