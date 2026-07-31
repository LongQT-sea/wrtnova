// Where a config key's control currently lives in the DOM.
//
// The build-time validation sweep has to refuse on the first *visible* offender
// and explain it (FR-015), which means it needs to reach a control that a
// section component owns. Rather than lifting every ref into the store, controls
// register themselves by key while mounted; unmounting deregisters, so a key
// that is currently gated away is simply absent and the sweep skips past it.

const registry = new Map<string, HTMLElement>();

export function registerField(key: string, el: HTMLElement | null): void {
  if (el) registry.set(key, el);
  else registry.delete(key);
}

export function isFieldMounted(key: string): boolean {
  return registry.has(key);
}

/** Scroll a field into view and focus it. Returns false when it is not mounted. */
export function revealField(key: string): boolean {
  const el = registry.get(key);
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.focus({ preventScroll: true });
  return true;
}
