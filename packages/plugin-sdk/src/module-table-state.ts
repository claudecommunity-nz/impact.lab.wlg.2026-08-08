export interface ModuleTableState {
  loading: boolean;
  stale: boolean;
  error: string | null;
}

export type ModuleTableAction =
  | { type: "loading" }
  | { type: "success" }
  | { type: "error"; error: string };

export const initialModuleTableState: ModuleTableState = {
  loading: true,
  stale: false,
  error: null,
};

/**
 * Module-table snapshots have their own lifecycle. The signals snapshot can
 * finish first, so sharing its loading flag produces a brief, false empty
 * state in table-backed pages and widgets.
 */
export function moduleTableStateReducer(
  state: ModuleTableState,
  action: ModuleTableAction,
): ModuleTableState {
  switch (action.type) {
    case "loading":
      return {
        loading: state.loading,
        stale: state.stale || !state.loading,
        error: null,
      };
    case "success":
      return { loading: false, stale: false, error: null };
    case "error":
      return {
        loading: false,
        stale: state.stale || !state.loading,
        error: action.error,
      };
  }
}
