// @ts-check
// Tiny observable state container - the single source of truth per page.
// No framework.
//
// The DOM is a view; this store holds the typed config. One input listener
// normalizes and writes the store; derived views subscribe and are pure
// selectors of the state. set() shallow-merges a partial and notifies only
// when something actually changed.

/**
 * @template T
 * @param {T} initial
 * @returns {{
 *   get: () => T,
 *   set: (patch: Partial<T>) => void,
 *   subscribe: (fn: (state: T) => void) => (() => boolean),
 * }}
 */
export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {                                  // shallow-merge a partial
      let changed = false;
      for (const k in patch) if (state[k] !== patch[k]) { changed = true; break; }
      if (!changed) return;                        // no-op if nothing moved
      state = Object.assign({}, state, patch);
      subs.forEach(fn => fn(state));
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
