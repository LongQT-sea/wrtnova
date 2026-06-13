<!-- Thanks for contributing. Please confirm the checklist before requesting review. -->

## What and why

<!-- Describe the change and the motivation. Link any related issue. -->

## How tested

<!-- What did you run/observe? For UI changes, confirm the 375px mobile layout. -->

## Checklist

- [ ] `npm run ci` passes (typecheck, tests, invariant gates)
- [ ] Regenerated artifacts if needed (`npm run build:css`, `npm run embed`)
- [ ] No `'0'` checkbox off-state (used `checkboxVal()` / `gv()` / `flag()`)
- [ ] ASCII-only in code and comments (locale strings excepted)
- [ ] Mobile layout works at 375px (for UI changes)
- [ ] Mirrored `/builder` behavior for any `/networks` change
- [ ] Conventional commit messages, one logical change per commit
