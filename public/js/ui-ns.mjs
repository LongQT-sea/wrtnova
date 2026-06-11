// @ts-check
// The shared UI namespace object, imported by every UI module.
//
// All pages are ES modules now and import { ui } from here. The object still
// carries the cross-file UI METHODS (DOM helpers, i18n ui.S/ui.t, tzdata combo,
// page callbacks like ui.startBuild / ui.computeFinalPackages) - de-globalizing
// those is a later step. Pure logic is no longer bridged through it: modules
// import the typed .mjs (config-merge, render-config, store, ...) directly, so
// the shared-boot shim is gone.
//
// It remains aliased to window.WrtNova so the dev harnesses (scripts/dev/*) can
// probe page state. Dropping that alias is safe only once those read state
// another way; keeping it is harmless (it is the module-scoped object either way).

export const ui = (typeof window !== 'undefined')
  ? (/** @type {any} */ (window).WrtNova = /** @type {any} */ (window).WrtNova || {})
  : /** @type {any} */ ({});
