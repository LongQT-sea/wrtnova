<!-- Thanks for contributing. Please confirm the checklist before requesting review. -->

## What and why

<!-- Describe the change and the motivation. Link any related issue. -->

## How tested

<!-- What did you run/observe? For UI changes, confirm the 375px mobile layout. -->

## Checklist

- [ ] `npm run check` passes (typecheck + Vitest, including the invariants)
- [ ] `wrtnova.sh` untouched
- [ ] No `'0'` checkbox off-state, and no value equal to a `wrtnova.sh` default
- [ ] All seven locales carry any new message id
- [ ] ASCII-only in code and comments (locale strings excepted)
- [ ] Mobile layout works at 375px (for UI changes)
- [ ] Conventional commit messages, one logical change per commit
