import assert from "node:assert/strict";
import test from "node:test";

import {
  initialModuleTableState,
  moduleTableStateReducer,
} from "./module-table-state";

test("module tables remain loading until their own snapshot resolves", () => {
  const loading = moduleTableStateReducer(initialModuleTableState, {
    type: "loading",
  });
  assert.deepEqual(loading, {
    loading: true,
    stale: false,
    error: null,
  });

  const loaded = moduleTableStateReducer(loading, { type: "success" });
  assert.deepEqual(loaded, {
    loading: false,
    stale: false,
    error: null,
  });
});

test("refresh failures retain last-known rows as stale", () => {
  const loaded = moduleTableStateReducer(initialModuleTableState, {
    type: "success",
  });
  const refreshing = moduleTableStateReducer(loaded, { type: "loading" });
  assert.equal(refreshing.loading, false);
  assert.equal(refreshing.stale, true);

  const failed = moduleTableStateReducer(refreshing, {
    type: "error",
    error: "temporary timeout",
  });
  assert.deepEqual(failed, {
    loading: false,
    stale: true,
    error: "temporary timeout",
  });
});
