# 7 · Design System: "Quiet Luxury"

The source is `src/theme/tokens.ts` plus the primitives in `src/components/`.

## Philosophy

The app should feel like a luxury hotel's stationery: heavy paper, generous margins, a serif headline and a single gold rule. **Hierarchy comes from typography and space, not from colour, badges or counters.**

| Use | Avoid |
|---|---|
| Large, full-bleed imagery with editorial headlines | Carousels of discounts, "deal" ribbons |
| Generous white space (24 pt gutters, 32 pt section rhythm) | Dense card grids, tiles crammed above the fold |
| A serif display face plus a restrained sans | Bold, all-caps headlines everywhere |
| One accent colour (champagne), used sparingly | Traffic-light status colours, red badges |
| Status written in words ("Being arranged") | Progress bars, tier meters, gamified streaks |
| Subtle motion (180–480 ms, ease-out) | Bounces, confetti, haptic overload |

## Colour

| Token | Hex | Use |
|---|---|---|
| `background` (ivory) | `#F6F2EC` | App canvas |
| `surface` (porcelain) | `#FBF9F6` | Tab bar, composer |
| `surfaceElevated` | `#FFFFFF` | Cards |
| `surfaceInverse` (deep sea) | `#0E1A2B` | Member card, primary buttons, guest chat bubbles |
| `textPrimary` (ink) | `#1E2530` | Body copy |
| `textSecondary` (graphite) | `#5B5750` | Supporting copy |
| `textMuted` (taupe) | `#6E665B` | Eyebrows, metadata (5.1:1 on ivory) |
| `accent` (champagne) | `#B89B6A` | Rules, dots, fills, the active tab rule; words only on deep sea |
| `accentText` (champagne deep) | `#7A6544` | Links and champagne words on light surfaces (5.0:1) |
| `calm` (sea-glass deep) | `#56706A` | Confirmed / handled (4.8:1) |
| `attention` (terracotta) | `#9E5640` | Urgent and invalid only, rarely shown (4.9:1) |
| `borderInput` | `#8C8579` | Field and stepper outlines, 1 px (3.3:1) |
| `textOnImageMuted` | ivory at 88% | Secondary words on imagery, over `scrims.words` |

The imagery fallback tones (`dusk`, `sea`, `stone`, `terracotta`, `olive`, `champagne`, `night`) give each destination an on-brand gradient while DAM imagery loads.

## Typography

| Variant | Face | Size / line height | Use |
|---|---|---|---|
| `hero` | Cormorant Garamond 500 | 40 / 46 | Hero headlines |
| `display` | Cormorant Garamond 500 | 32 / 38 | Page titles, member tier |
| `title` | Cormorant Garamond 500 | 24 / 30 | Section titles, port names |
| `subtitle` | Cormorant Garamond 500 *italic* | 19 / 26 | Standfirsts, recognition line |
| `body` / `bodyStrong` | Inter 400 / 500 | 15 / 23 | Copy |
| `caption` | Inter 400 | 13 / 19 | Metadata |
| `eyebrow` | Inter 500, +1.8 tracking, uppercase | 11 / 16 | Section labels, quiet buttons |

## Spacing, shape and depth

* Spacing uses a 4 pt grid: `xxs 4 · xs 8 · sm 12 · md 16 · lg 24 · xl 32 · xxl 48 · xxxl 64`. The gutter is 24 pt.
* Radii: `sm 4 · md 10 · lg 18 · pill`. Cards use 10, so they read softly but not playfully.
* There is a single elevation, `soft`: 6 % navy shadow, 18 pt blur. Hairline dividers in `stone`.

## Components

| Component | Purpose |
|---|---|
| `Hero` | Full-bleed image or tone with a scrim, eyebrow, serif headline and italic standfirst |
| `MediaTile` | Editorial tile for carousels, with the caption below the image rather than on it |
| `Section` | Eyebrow + title + content, with consistent rhythm |
| `Card` | A white, softly elevated container. It can be pressed. |
| `DetailRow` | Quiet label/value rows for itineraries and profiles |
| `SegmentedTabs` | Text tabs with a champagne underline. No pills. |
| `AlertNote` | A journey alert with a left rule, plus an "already handled" line with a check mark |
| `Button` | `primary` (deep sea pill) or `quiet` (hairline outline), with an eyebrow label |
| `TextLink` | Champagne eyebrow text with a hairline arrow |

## Voice and tone

* Address the guest by their preferred name, using a time-aware greeting.
* Write like a trusted maître d'. "Of course." "Leave it with me." "Everything is in hand."
* Never "Oops!", never exclamation marks, never a raw error code.
* Lead with what has been done, then what (if anything) is needed.

## Accessibility

WCAG 2.2 AA; the full audit and what changed are in [20](20-accessibility.md).

* **Contrast.** Every text colour is at least 4.5:1 on ivory, porcelain and white, and field outlines are at least 3:1. `check:a11y` checks this from the tokens, so a new colour that fails, fails `verify`. Champagne stays the brand colour for rules and fills; its words use `accentText`.
* **Words on imagery** sit over `scrims.words`: at least 4.5:1 even over a white photograph.
* **Type scales** with the system setting up to a per-style cap (`MAX_FONT_SCALE`): reading text to 2.2×, headings less. Nothing is under 11 px, and image frames with words grow rather than clip.
* **Controls.**
  * Every control has a role and a name that starts with its visible words. Chips are radios, checkboxes or pressed toggles.
  * A pressable card is one control; its call to action is a `LinkCue`.
  * Icons are decorative unless marked `meaningfulIcon`.
  * Targets are at least 44 pt, through `hitSlop` where the visual is smaller.
* **Structure.** One page heading per screen; section eyebrows are headings.
* **Focus and motion.** Content that changes in place moves focus (`useFocusOnChange`) or speaks (`useAnnounce`, `LiveAnnouncer`). Motion stops when reduce motion is on (`useReducedMotion`).
