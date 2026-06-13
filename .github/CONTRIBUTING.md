# Contributing to WrtNova

Thanks for your interest. This project is small and deliberately
framework-free, and it has a handful of invariants that are easy to violate by
accident. Please skim this whole file before your first PR. The authoritative
references are [SPEC.md](../docs/SPEC.md) (design) and `CLAUDE.md` (the hard rules,
restated below).

## Getting set up

Requires Node 22+.

```sh
npm install
npm run build:css
npm run embed
npx wrangler pages dev public
```

## Run this before every PR

```sh
npm run ci
```

It must pass. It runs the type check, the unit tests, and the four invariant
gates described below. CI runs the same on Node 22.

## The invariants (do not violate these)

These are enforced by CI gates where possible, but several are conventions you
have to follow by hand.

1. **`wrtnova.sh` is the source of truth, and it lives in another repo.**
   Do not edit it as part of frontend work. The canonical copy is at
   https://github.com/LongQT-sea/wrtnova.sh. After any script change, run
   `npm run embed` to regenerate `public/wrtnova.sh` (which is git-ignored).

2. **The section marker is byte-load-bearing.** The exact three lines
   `# ===================` / `# End config section` / `# ===================`
   split the per-build config block from the embedded body. Changing its
   wording or spacing breaks the build. The `check-marker` gate guards it.

3. **Checkbox off-state is `''`, never `'0'`.** Use the helpers
   (`checkboxVal()` in build.js, `gv()` in networks.js, `flag(v)` in merges).
   The `check-no-zero` gate fails on any `'0'` off-state emission.

4. **Shared logic has exactly one definition.** Logic used by more than one
   page (or by tests) lives in a single typed `.mjs` module and is imported,
   never copy-pasted. The `check-no-dupes` gate enforces this.

5. **No framework, no bundler.** Native DOM and native HTML primitives
   (`<dialog>`, `<details>`, `<select>`) only. Code sharing uses native ES
   modules loaded with `<script type="module">`. The only build steps are the
   Tailwind CLI and `embed-wrtnova.mjs`.

6. **Stay within the byte budget.** CSS <= 15 KB gzipped is a hard limit; JS is
   ratcheted by `check-budget`. Lazy-load heavy assets (e.g. Monaco) only on
   the page that needs them.

7. **ASCII only in code and comments.** The sole exception is locale string
   values in `i18n.js`. No box-drawing, em dashes, arrows, or other non-ASCII.

8. **Mobile-first.** Every feature must work at 375px width; breakpoint is
   768px; touch targets >= 44px; input font >= 16px.

9. **`/builder` is the reference implementation.** Before adding or changing a
   feature on `/networks`, read how `/builder` does the equivalent thing and
   mirror it.

## Architecture in one paragraph

The DOM is a view, never the state. Each page owns one typed config store
(`store.mjs`); every derived view (config preview, package chips, visibility,
VLAN-conflict warning) is a pure selector of the store. Build payloads read the
store, not the form. Programmatic changes go through the store first
(`applyStorePatch`). Normalize values once, at the store boundary. See SPEC.md
sections 9-12 for the details.

## Comment style

Comments explain *why*, not *what*. Keep them terse and present-tense, use ASCII
`->` for mappings, and reserve banners for real section breaks. Match the voice
of the surrounding code (`wrtnova.sh` is the house standard).

## Commits and PRs

- Use [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `style:`.
- One logical change per commit; one conventional prefix per commit (no
  `feat(a): X; fix(b): Y` compound messages).
- Reference SPEC.md sections by number when implementing a spec'd feature.
- Describe what you tested. For UI changes, confirm the 375px layout.

## Reporting bugs and requesting features

Use the GitHub issue templates. For security issues, do **not** open a public
issue - see [SECURITY.md](SECURITY.md).
