// Structural invariants for toggle markup.
// Run: node --test  (no dependency; Node built-in test runner)
//
// Every toggle on both pages must use the single shape documented in
// src/style.css, because the styling is plain descendant CSS with no fallback
// for a row that is put together differently:
//
//   <label class="toggle-label">
//     <span class="toggle-wrap"> input + track + thumb </span>
//     <div> <span class="toggle-text">Title</span>
//           <p class="form-help mt-0">Description</p> </div>
//   </label>
//
// A half-converted row still renders - it just renders wrong, with the title
// stranded outside the card and the description wearing the title's styling.
// Nothing else in `npm run ci` notices that, so it is asserted here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PAGES = ['public/builder/index.html', 'public/networks/index.html'];

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// Slice out the lines of the element opened on `lines[start]`, using the
// closing tag at the same indentation. The pages are consistently indented,
// which is what makes this good enough without pulling in a parser.
function block(lines, start, tag) {
  const indent = lines[start].match(/^\s*/)[0];
  const close = indent + `</${tag}>`;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === close) return out.join('\n');
    out.push(lines[i]);
  }
  return out.join('\n');
}

for (const page of PAGES) {
  // A .form-row must never hold both a .form-label and a .toggle-label: that
  // is the pre-conversion shape, where the title sits outside the card.
  // Deliberately does not assume `class` is the last attribute - the two
  // `<div class="form-row" id="row-psk-vlan">` rows were missed that way.
  test(`${page}: no toggle row keeps its title outside the card`, () => {
    const lines = read(page).split('\n');
    const offenders = [];
    lines.forEach((line, i) => {
      if (!line.includes('<div') || !line.includes('form-row')) return;
      const body = block(lines, i, 'div');
      if (body.includes('toggle-label') && body.includes('form-label')) {
        offenders.push(`${page}:${i + 1} ${line.trim()}`);
      }
    });
    assert.deepEqual(offenders, [], `form-row with both a form-label and a toggle-label:\n${offenders.join('\n')}`);
  });

  // Every .toggle-label wraps its text in a <div>, so `.toggle-text` is always
  // the title and `.form-help` inside the card is always the description.
  test(`${page}: every toggle-label wraps its text in a div`, () => {
    const lines = read(page).split('\n');
    const offenders = [];
    lines.forEach((line, i) => {
      if (!/<label class="toggle-label/.test(line)) return;
      const body = block(lines, i, 'label');
      if (!/^\s*<div>\s*$/m.test(body)) {
        offenders.push(`${page}:${i + 1} ${line.trim()}`);
      }
    });
    assert.deepEqual(offenders, [], `toggle-label without a <div> text wrapper:\n${offenders.join('\n')}`);
  });

  // One card, one switch. Stacking several .toggle-label cards inside a
  // .form-row is fine and common; two switches inside a single label is not -
  // that is what the per-node mesh block in networks.js used to emit.
  test(`${page}: no toggle-label holds more than one switch`, () => {
    const lines = read(page).split('\n');
    const offenders = [];
    lines.forEach((line, i) => {
      if (!/<label class="toggle-label/.test(line)) return;
      const switches = (block(lines, i, 'label').match(/class="toggle-wrap/g) || []).length;
      if (switches > 1) offenders.push(`${page}:${i + 1} has ${switches} switches`);
    });
    assert.deepEqual(offenders, [], `toggle-label with multiple switches:\n${offenders.join('\n')}`);
  });

  // `text-xs` on the title would silently undo the card's type scale.
  test(`${page}: no size utility overrides the toggle title`, () => {
    assert.equal(read(page).includes('class="toggle-text text-xs"'), false);
  });

  // Same rule for .opt-card, the non-<label> shell: a .form-row must not keep
  // a title outside the card, which is what a half-finished conversion leaves.
  test(`${page}: no form-row keeps a .form-label outside a card`, () => {
    const lines = read(page).split('\n');
    const offenders = [];
    lines.forEach((line, i) => {
      if (!line.includes('<div') || !line.includes('form-row')) return;
      const body = block(lines, i, 'div');
      if (body.includes('class="form-label')) offenders.push(`${page}:${i + 1} ${line.trim()}`);
    });
    assert.deepEqual(offenders, [], `form-row still using .form-label:\n${offenders.join('\n')}`);
  });

  // The check above only looks inside a .form-row, which is how the two banIP
  // picker rows kept a bare .form-label through the whole conversion - they sit
  // directly in a .sub-section. Nothing on either page uses the class now, so
  // the simpler rule is that it may not appear at all.
  test(`${page}: .form-label is gone entirely`, () => {
    const lines = read(page).split('\n');
    const offenders = lines
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => /class="form-label/.test(line))
      .map(([n, line]) => `${page}:${n} ${line.trim()}`);
    assert.deepEqual(offenders, [], `.form-label still in the markup:\n${offenders.join('\n')}`);
  });

  // Every card needs a title; an empty one means a layout spacer from the old
  // two-column form got converted into a card. Matches only a genuinely empty
  // element - a title may legitimately open with a nested <span>, as the
  // composite "Tagged WAN VLAN (required by some ISPs)" ones do.
  test(`${page}: no card has an empty title`, () => {
    const src = read(page);
    assert.equal(/class="opt-title"[^>]*>\s*<\//.test(src), false, 'found an .opt-title with no text');
    assert.equal(/class="toggle-text"[^>]*>\s*<\//.test(src), false, 'found a .toggle-text with no text');
  });
}

// The per-node panels are built by string concatenation, so the same shape has
// to be asserted against the generator's source rather than against markup.
test('networks.js: generated toggles use the card shape', () => {
  const src = read('public/js/networks.js');
  const wraps = (src.match(/class=\\?"toggle-wrap/g) || []).length;
  const divs = (src.match(/<div><span class=\\?"toggle-text/g) || []).length;
  assert.equal(wraps, divs, 'every generated switch should be followed by <div><span class="toggle-text">');
  assert.equal(src.includes('toggle-text text-xs'), false);
});

// The same conversion applied to the generated non-toggle rows. `.form-label` is
// the pre-conversion shape: a title sitting outside the card, which on these
// pages now means a title with no card at all.
test('networks.js: no generated row still uses .form-label', () => {
  const src = read('public/js/networks.js');
  const offenders = src.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /class="form-label/.test(line))
    .map(([n, line]) => `public/js/networks.js:${n} ${line.trim()}`);
  assert.deepEqual(offenders, [], `generated row still using .form-label:\n${offenders.join('\n')}`);
});

// The generated rows go through the single `optCard` helper, so the card shell
// and its title are emitted once and only the control varies per call site.
// That is what makes these two counts meaningful: one control per call, and each
// control carrying a width modifier.
test('networks.js: every generated card has a title and a control', () => {
  const src = read('public/js/networks.js');
  assert.equal((src.match(/class="opt-card"/g) || []).length,
    (src.match(/class="opt-title"/g) || []).length,
    'the card shell and its title should be emitted together by optCard');

  // Every `optCard(...)` call must hand it exactly one control.
  const calls = (src.match(/\boptCard\(/g) || []).length - 1;  // minus the definition
  const controls = (src.match(/class="opt-control /g) || []).length;
  assert.ok(calls > 0, 'expected the per-node panel to emit .opt-card rows');
  assert.equal(controls, calls, `${calls} optCard() calls but ${controls} .opt-control controls`);
});

// `.opt-control` alone only pins the control to the trailing edge; the width
// comes from `.opt-field` (half the card) or `.opt-stack` (its own line). One
// without the other collapses to the control's intrinsic width.
test('networks.js: every generated control declares a width', () => {
  const src = read('public/js/networks.js');
  const offenders = (src.match(/class="opt-control [^"]*"/g) || [])
    .filter(cls => !/\bopt-field\b|\bopt-stack\b/.test(cls));
  assert.deepEqual(offenders, [], `.opt-control with no width modifier:\n${offenders.join('\n')}`);
});
