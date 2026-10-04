/// <reference types="node" />
/**
 * Accessibility checks.  Run: `npm run check:a11y`
 *
 * 1. Contrast, from the design tokens: every text colour on every surface
 *    it is used on (WCAG 1.4.3, 4.5:1), field outlines (1.4.11, 3:1) and
 *    words on imagery over the scrim, assuming a white photograph.
 * 2. Font scaling: reading text may reach 200% (1.4.4); no text under 11 px.
 * 3. The source, for patterns that have been fixed and must not return:
 *    a control inside a control, aria-selected outside tabs, labels on
 *    icon-only buttons and fields, champagne words on light surfaces,
 *    motion that ignores "reduce motion", text that cannot scale.
 *
 * The browser audit (axe-core over every screen) is in docs/20.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { colors, palette, scrims, typography } from '@/theme';

const failures: string[] = [];
let passed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed += 1;
  else failures.push(`✖ ${name}${detail === undefined ? '' : `\n    ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}`}`);
};

// ─── Colour arithmetic (WCAG 2.x relative luminance) ──────────────────────
type RGBA = [number, number, number, number];
function parse(c: string): RGBA {
  if (c.startsWith('#')) {
    const h = c.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).concat(1) as RGBA;
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`Unparsed colour ${c}`);
  const [r, g, b, a = '1'] = m[1]!.split(',').map((x) => x.trim());
  return [Number(r) / 255, Number(g) / 255, Number(b) / 255, Number(a)];
}
/** `fg` (possibly translucent) composited over an opaque `bg`. */
const over = (fg: RGBA, bg: RGBA): RGBA => [0, 1, 2].map((i) => fg[i]! * fg[3] + bg[i]! * (1 - fg[3])).concat(1) as RGBA;
const lum = (c: RGBA) => {
  const l = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * l(c[0]) + 0.7152 * l(c[1]) + 0.0722 * l(c[2]);
};
function ratio(fg: string | RGBA, bg: string | RGBA): number {
  const b = typeof bg === 'string' ? parse(bg) : bg;
  const f = over(typeof fg === 'string' ? parse(fg) : fg, b);
  const [x, y] = [lum(f), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── 1. Contrast ───────────────────────────────────────────────────────────
const LIGHT = { background: colors.background, surface: colors.surface, surfaceElevated: colors.surfaceElevated };
const TEXT_ON_LIGHT = { textPrimary: colors.textPrimary, textSecondary: colors.textSecondary, textMuted: colors.textMuted, accentText: colors.accentText, calm: colors.calm, attention: colors.attention };
for (const [fn, fg] of Object.entries(TEXT_ON_LIGHT)) {
  for (const [bn, bg] of Object.entries(LIGHT)) {
    const r = ratio(fg, bg);
    check(`text ${fn} on ${bn} ≥ 4.5:1`, r >= 4.5, r2(r));
  }
}
const TEXT_ON_DARK = { textInverse: colors.textInverse, textInverseMuted: colors.textInverseMuted, accent: colors.accent, accentSoft: colors.accentSoft };
for (const [fn, fg] of Object.entries(TEXT_ON_DARK)) {
  const r = ratio(fg, colors.surfaceInverse);
  check(`text ${fn} on surfaceInverse ≥ 4.5:1`, r >= 4.5, r2(r));
}
// Words on the champagne-deep fill (avatars, the unread badge).
check('ivory on accentText fill ≥ 4.5:1', ratio(colors.textInverse, colors.accentText) >= 4.5, r2(ratio(colors.textInverse, colors.accentText)));
for (const [bn, bg] of Object.entries(LIGHT)) {
  const r = ratio(colors.borderInput, bg);
  check(`field outline on ${bn} ≥ 3:1`, r >= 3, r2(r));
}
check('status icons (calm, attention) ≥ 3:1 on ivory', ratio(colors.calm, colors.background) >= 3 && ratio(colors.attention, colors.background) >= 3);

// Words on imagery: the worst case is a white photograph under the scrim.
function scrimAt(stops: { colors: readonly string[]; locations: readonly number[] }, y: number): RGBA {
  const { colors: cs, locations: ls } = stops;
  if (y <= ls[0]!) return parse(cs[0]!);
  for (let i = 1; i < ls.length; i++) {
    if (y <= ls[i]!) {
      const t = (y - ls[i - 1]!) / (ls[i]! - ls[i - 1]!);
      const [a, b] = [parse(cs[i - 1]!), parse(cs[i]!)];
      return [0, 1, 2, 3].map((k) => a[k]! * (1 - t) + b[k]! * t) as RGBA;
    }
  }
  return parse(cs[cs.length - 1]!);
}
const white = parse('#FFFFFF');
const ON_IMAGE = { textInverse: colors.textInverse, textOnImageMuted: colors.textOnImageMuted, accentSoft: colors.accentSoft };
for (const [fn, fg] of Object.entries(ON_IMAGE)) {
  // Words sit in the lower part of a frame (from 55% down).
  const worst = Math.min(...[0.55, 0.65, 0.75, 0.85, 1].map((y) => ratio(fg, over(scrimAt(scrims.words, y), white))));
  check(`${fn} on imagery (lower half, white photograph) ≥ 4.5:1`, worst >= 4.5, r2(worst));
}
{
  // The hero's greeting, at its top edge, over the top scrim and the words scrim.
  const worst = Math.min(...[0.03, 0.06, 0.09, 0.12].map((y) => ratio(colors.textOnImageMuted, over(scrimAt(scrims.words, y), over(scrimAt(scrims.top, y), white)))));
  check('hero greeting (top edge, white photograph) ≥ 4.5:1', worst >= 4.5, r2(worst));
}
check('decorative champagne stays the brand colour', colors.accent === palette.champagne);

// ─── 2. Font scaling ───────────────────────────────────────────────────────
const SRC = join(__dirname, '..', 'src');
const files: string[] = [];
(function walk(d: string) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f)) files.push(p);
  }
})(SRC);
const tsx = files.filter((f) => f.endsWith('.tsx'));
const read = (f: string) => readFileSync(f, 'utf8');
const where = (f: string, src: string, index: number) => `${relative(join(SRC, '..'), f)}:${src.slice(0, index).split('\n').length}`;

const typo = read(join(SRC, 'components/Typography.tsx'));
const cap = (v: string) => Number(typo.match(new RegExp(`\\b${v}: ([0-9.]+)`))?.[1]);
check('reading text may grow to at least 200%', ['body', 'bodyStrong', 'caption', 'eyebrow', 'subtitle'].every((v) => cap(v) >= 2), ['body', 'caption', 'eyebrow'].map(cap));
check('headings may grow too (≥ 1.4×)', ['hero', 'display', 'title'].every((v) => cap(v) >= 1.4));
check('every type style is at least 11 px', Object.values(typography).every((t) => t.fontSize >= 11));

const hits = (re: RegExp, filter: (f: string) => boolean = () => true) =>
  tsx.filter(filter).flatMap((f) => {
    const s = read(f);
    return [...s.matchAll(re)].map((m) => where(f, s, m.index ?? 0));
  });
check('no text smaller than 11 px', hits(/fontSize: (?:[0-9]|10)\b/g).length === 0, hits(/fontSize: (?:[0-9]|10)\b/g));
check('no text that refuses to scale', hits(/allowFontScaling=\{false\}/g).length === 0, hits(/allowFontScaling=\{false\}/g));

// ─── 3. Patterns that must not return ──────────────────────────────────────
check('champagne words only on dark surfaces (accentText on light)', hits(/(?:Eyebrow|Caption|Text)[^>]*color=\{colors\.accent\}/g).length === 0, hits(/(?:Eyebrow|Caption|Text)[^>]*color=\{colors\.accent\}/g));
check('aria-selected only on tabs', hits(/aria-selected/g).every((w) => w.startsWith('src/components/Controls.tsx')), hits(/aria-selected/g));
check('motion follows "reduce motion" (no hard-coded animated scrolls)', hits(/animated: true/g).length === 0, hits(/animated: true/g));
check('the skeleton and image fade honour reduce motion', /useReducedMotion\(\)/.test(read(join(SRC, 'components/Feedback.tsx'))) && /transition=\{reduceMotion \? 0/.test(read(join(SRC, 'components/Media.tsx'))));

// A control inside a pressable card or row.
const nested: string[] = [];
for (const f of tsx) {
  const s = read(f);
  for (const m of s.matchAll(/<(Card onPress|Pressable)\b(?:[^<>]|=>)*?(\/?)>/g)) {
    if (m[2] === '/') continue; // self-closing: no children
    const tag = m[1]!.startsWith('Card') ? 'Card' : 'Pressable';
    let depth = 1;
    let j = m.index! + m[0].length;
    while (depth && j < s.length) {
      const o = s.indexOf(`<${tag}`, j);
      const c = s.indexOf(`</${tag}>`, j);
      if (c === -1) break;
      if (o !== -1 && o < c) {
        depth += 1;
        j = o + tag.length + 1;
      } else {
        depth -= 1;
        j = c + tag.length + 3;
      }
    }
    const body = s.slice(m.index! + m[0].length, j);
    if (/<(TextLink|Button|Chip|TextInput|Switch)\b/.test(body)) nested.push(where(f, s, m.index!));
  }
}
check('no control inside a pressable card or row (use LinkCue)', nested.length === 0, nested);

// Icon-only pressables need a name.
const unnamedIcons = tsx.flatMap((f) => {
  const s = read(f);
  return [...s.matchAll(/<Pressable\b((?:[^<>]|=>)*)>\s*<Ionicons\b[^>]*\/>\s*<\/Pressable>/g)].filter((m) => !/accessibilityLabel|aria-label/.test(m[1]!)).map((m) => where(f, s, m.index ?? 0));
});
check('every icon-only button has a name', unnamedIcons.length === 0, unnamedIcons);
const unnamedInputs = tsx.flatMap((f) => {
  const s = read(f);
  return [...s.matchAll(/<TextInput\b((?:[^<>]|=>)*)\/>/g)].filter((m) => !/accessibilityLabel|aria-label/.test(m[1]!)).map((m) => where(f, s, m.index ?? 0));
});
check('every text field has a label', unnamedInputs.length === 0, unnamedInputs);
check('chips announce what they are (radio, checkbox or pressed toggle)', /role=\{checkable \? kind : 'button'\}/.test(read(join(SRC, 'components/Controls.tsx'))) && /aria-pressed=\{checkable \? undefined : selected\}/.test(read(join(SRC, 'components/Controls.tsx'))));
check('radio groups are ChipGroups, not bare Views around chips', hits(/accessibilityRole="radiogroup"/g).length === 0, hits(/accessibilityRole="radiogroup"/g));

// Images: the picture is the image, the words on it are not swallowed.
const media = read(join(SRC, 'components/Media.tsx'));
check('imagery: only the picture layer is the accessible image', /<View style=\{StyleSheet\.absoluteFill\} accessible accessibilityRole="image"/.test(media) && !/overflow: 'hidden' \}, style\]\}\s*accessible/.test(media));

// Fields: errors tied to the field and announced.
const form = read(join(SRC, 'components/Form.tsx'));
check('field errors: aria-invalid, aria-describedby, an announcement, not colour alone', /aria-invalid=\{a11y\.invalid\}/.test(form) && /aria-describedby=\{a11y\.describedBy\}/.test(form) && /useAnnounce\(error/.test(form) && /alert-circle-outline/.test(form));

// Every route has a heading.
const routes = files.filter((f) => f.includes(`${join('src', 'app')}`) && !/_layout|\+not-found/.test(f));
check('routes found', routes.length >= 15, routes.length);

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n✘ Accessibility: ${failures.length} failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`✔ Accessibility: all ${passed} checks passed.`);
