# 20 · Accessibility

The app is audited against **WCAG 2.2 AA** on iOS (VoiceOver), Android (TalkBack) and the web. The fixes keep the "Quiet Luxury" design: the same layout, type, spacing and palette. The changes are a slightly deeper shade of each accent colour where it is used for words, a darker field outline, and a deeper scrim where words sit on a photograph.

**Result.**

* axe-core: **0 violations** on 40 screens and states (the baseline was 422, across 6 rules).
* `check:a11y`: **49 checks** in `npm run verify`.
* Browser test (`a11ytest`): 19 behavioural checks.
* All 12 existing browser suites still pass.

## What was found, and what changed

### Text contrast (1.4.3, 1.4.11)

**Found.** 349 of the 422 axe failures were contrast. The cause was four palette colours used for words on ivory:

| Colour | Ratio on ivory |
|---|---|
| Driftwood (eyebrows, hints, inactive tabs) | 2.85:1 |
| Champagne (links, accent words) | 2.37:1 |
| Sea-glass (statuses) | 2.65:1 |
| Coral | 3.82:1 |

Also:

* Field outlines were 1.5:1.
* Words on imagery depended on the photograph: about 2.5:1 over the champagne and stone tones, and worse over a light photo.

**Changed.** Each colour got a deepened shade of the same hue, used for words. The light originals stay for rules, dots, fills and dark surfaces.

| Token | Value | On ivory | Used for |
|---|---|---|---|
| `textMuted` | taupe `#6E665B` | 5.1:1 | Eyebrows, hints, inactive tabs |
| `accentText` | champagne deep `#7A6544` | 5.0:1 | Links, accent words, the unread badge, avatars |
| `calm` | sea-glass deep `#56706A` | 4.8:1 | "Done" words and icons |
| `attention` | terracotta `#9E5640` | 4.9:1 | Urgent and invalid words and icons |
| `borderInput` | `#8C8579`, 1 px | 3.3:1 | Field and stepper outlines |
| `accent` | champagne `#B89B6A` (unchanged) | n/a | Rules, dots, fills; words only on deep sea (6.6:1) |

**Words on imagery.** `MediaFrame` deepens its scrim wherever words sit on a picture (`scrims.words`). Ivory text is at least 4.5:1 from the middle of the frame down, **even over a white photograph**. The hero also shades its top edge (`scrims.top`) for the greeting. Secondary words on imagery use `textOnImageMuted` (88% ivory). A picture with no words keeps the light scrim.

### Font scaling (1.4.4) and reflow (1.4.10)

**Found.**

* Text scaled without limit: the 40-pt hero headline would reach 124 pt at the largest iOS size.
* Image frames had a fixed height and clipped their words.
* Some labels were 10 px.

**Changed.**

* Each type style has a maximum scale (`MAX_FONT_SCALE` in `Typography.tsx`):
  * reading text may grow to 2.2× (beyond the 200% WCAG asks for);
  * subtitles 2×, titles 1.8×, display 1.6×, the hero 1.4×.
* Image frames with words grow with the text instead of clipping it.
* Nothing is smaller than 11 px.
* The tab bar follows the iOS convention: its labels do not scale, and a long press shows the Large Content Viewer.

**Deliberate truncation:**

* tab labels;
* the journey-step labels in the hero (the whole line is also a progress bar with a spoken value);
* concierge step labels;
* request summaries in lists.

Each full text is available elsewhere.

### Screen readers (1.1.1, 1.3.1, 4.1.2, 4.1.3)

**Images.** `MediaFrame` used to make the whole frame one image. On iOS and Android that hid every word on it, so the Home hero's headline was read only as the photograph's description. Now only the picture layer is the image, and the words on it are read and can be found as headings.

**Icons.** Ionicons are decorative by default (`src/components/icons.ts`): a glyph is a character in an icon font, and a screen reader would stop on it. An icon that must be heard opts in with `meaningfulIcon('Sensitive')`.

**Headings.**

* Every screen has one page heading (level 1), including empty states (`Section level={1}`), the error boundary and "not found".
* Every section is a level-2 heading: its title, or its eyebrow when there is no title. On Home, that is "For your attention", "Arranged for you", "Your voyage" and so on, navigable by heading.
* Card titles, ports and approval panels are levels 3 and 4.

**Chips** say what they are:

* `radio` in a named `ChipGroup` (radiogroup) for one choice;
* `checkbox` for several;
* `toggle` (a pressed button) for a filter that is on or off.

Before, every chip was a button with `aria-selected`, which ARIA does not allow.

**Controls inside controls.** A pressable card that contained a link is now one control; its call to action is a `LinkCue`, which looks like a link but is not one. Cards that open another screen are links.

**Names.**

* Cards whose label used to hide their contents now read everything, or a complete label:
  * embarkation, yacht and suite;
  * the next activity;
  * documentation;
  * Bonvoy;
  * bookings;
  * destinations;
  * moments.
* Names start with the visible words, for voice control (2.5.3): "Request, Sunset sail"; "Elena, a person".
* Counts are spoken in words ("Requests, 2 open").
* The house separator "·" is spoken as a pause.
* Back buttons say where they go.
* Labels on plain views, which native ignores and the web forbids, were removed or replaced by `readAs()` (one item on iOS and Android).

**Announcements.** `useAnnounce`, `announce` and `LiveAnnouncer` (`src/hooks/useAnnounce.ts`, `Feedback.tsx`) cover:

* errors under fields;
* "Sent" confirmations;
* new concierge replies, which are spoken on iOS and Android, and read from a live region on the web;
* the number of results when Discover's filters change;
* "Dining saved";
* "Device removed".

Live regions are mounted before their words arrive, so web screen readers hear the change. Only urgent journey alerts interrupt; the rest are read in place.

**Progress** is a progress bar with a spoken value: the journey ("Embark, stage 2 of 5"), the reflections ("Step 2 of 6") and each request's steps.

### Focus order and focus management (2.4.3, 2.4.7)

`useFocusOnChange` moves the screen reader (and web keyboard focus) when content changes in place. Before, focus stayed on a button that had just disappeared. It now goes:

* to the code instructions when sign-in moves to the code step;
* to each new reflections question;
* into the approval panel on Celebration and Recovery, and back to the step on "Not now" or after sending;
* to the question when closing a request, and back to the button on "Keep it";
* into the preference editor when it opens, and back to its Edit button when it closes;
* into the concierge's people panel when it opens.

Tab order follows reading order; this is checked on the new-request form, through 16 stops. Discover's recommendation rail is focusable, so a keyboard can scroll tiles that are not themselves controls.

### Touch targets (2.5.8, and the 44-point platform guidance)

Every control is at least 44 points, using `hitSlop` so the visual design is unchanged:

* text links and eyebrow actions: 14 pt above and below a 16-pt line;
* chips: 36 pt plus 4 pt above and below, without overlapping the next row;
* stepper buttons: 44 pt;
* send and add buttons;
* concierge actions and quick replies;
* the dismiss button.

### Motion (2.3.3)

`useReducedMotion` follows the system setting while the app runs. When reduce motion is on:

* the skeleton holds still (it used to check once at start);
* images appear without fading;
* screens appear without sliding;
* tab strips and the concierge thread jump instead of scrolling smoothly.

### Forms (3.3.1, 3.3.2, 4.1.2)

* **Required fields** say so: a quiet "Required" beside the label, ", required" in the name, and `aria-required`.
* **Errors** are tied to their field: `aria-invalid`, `aria-describedby` and the accessibility hint. They are announced and shown with a mark as well as colour, and the field's outline turns terracotta.
* **Sign-in** errors are now on the field they concern.
* **Disabled buttons** say why ("Turn on the acknowledgement above to send", "No changes yet").
* **The stepper** is one adjustable element on iOS and Android (swipe up or down), and a named group with a live value on the web.
* **Switches** carry their hint.
* **The character count** is read as words ("120 of 1000 characters").

## How it is checked

| Check | Where | What |
|---|---|---|
| `npm run check:a11y` (49 checks, in `verify`) | `scripts/check-a11y.ts` | **Contrast** from the tokens: every text colour on every surface it is used on; outlines; words on imagery over a white photograph; the hero greeting.<br>**Font-scale caps**, and no text under 11 px.<br>**Patterns that must not return:** a control inside a control; `aria-selected` outside tabs; unnamed icon buttons and fields; champagne words on light surfaces; animated scrolls that ignore reduce motion; the image layer; field-error wiring. |
| axe-core | `axetest.js` (scratch harness) | WCAG 2.0, 2.1 and 2.2 A/AA over every route and section: 9 voyage sections, 8 profile sections, the demos, the error and empty states, recovery. |
| Behavioural | `a11ytest.js` | One page heading per screen; section headings on Home; Tab order; required and invalid fields described by their errors; focus moving with reflections, the preference editor and closing a request; Discover's spoken result count; chip roles; the skeleton pulsing normally and holding still under reduced motion; 200% text at 320 px without sideways scrolling or clipped words. |

The browser harnesses live outside the repository, like the other browser suites. The README lists the commands.

## Not yet done

* **Native screen-reader passes** on devices (VoiceOver and TalkBack) are part of the manual checklist; the browser harness covers the web.
* **Lists** (requests, notifications, calendar) do not yet have list semantics. They read correctly item by item.
* **Focus after Discover's destination choice** is announced ("2 experiences") rather than moved.
* **Photographs** from the DAM will need alt text reviewed as they arrive. `MediaAsset.alt` is required.
