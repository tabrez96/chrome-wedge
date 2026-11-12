# chrome-wedge: UX spec

## Users and primary jobs
Developers and QA testing barcode-driven web apps (point of sale, warehouse, inventory) without a hardware scanner.
1. Send a code into the focused field as real keystrokes plus Enter, as a keyboard-wedge scanner would.
2. Turn a barcode image (label photo, test fixture) into a scan.
3. Re-send the same handful of test codes quickly.

## Information architecture
- **S01 Popup**: the toolbar popup; where every scan happens. Site switch, code input, image drop, saved codes.
- **S02 Welcome**: full tab, shown on install and on first switch-on; explains Chrome's debugging bar. Reachable from S01 Help.
- **S03 Settings**: options page; typing (prefix, suffix, key delay, default image format), allowed sites, saved codes. Reachable from S01.

## Key flows
1. **First scan**: install → S02 opens → Got it → on the test site, open S01 → switch on (site allowed, debugger attaches, Chrome's bar appears) → click the field on the page → reopen S01, type a code, Enter → result line confirms.
2. **Image scan**: S01 → drop image → decoded value fills the input (S01 image-decoded) → Scan. Unreadable image shows S01 unreadable.
3. **Saved code**: S01 → Scan beside a saved code, or press its shortcut on the page. Manage codes in S03.
4. **Blocked scan**: password field focused → S01 refused; nothing focused → S01 no-field; site off → S01 site-off (controls disabled).
5. **Bar closed**: user closes Chrome's debugging bar → S01 detached → Reconnect this tab.
6. **Settings**: S01 gear → S03; changes save immediately.

Rules: a scan is only sent to the focused editable element of the tab the user switched on, on an allowed site, and never to `input[type=password]`. Nothing is sent from an image until the user presses Scan.

## Design system
**Theme**: dark only. Every screen (popup, welcome, settings) uses the same dark palette; it sits naturally beside Chrome's dark toolbar and keeps the red cursor as the one bright accent.

**Colours**
| Token | Hex | Use |
|---|---|---|
| bg | #0E1426 | page background (S02, S03), code and form inputs, disabled fields |
| surface | #151D33 | popup body, cards, footer |
| text | #E8ECF5 | primary text (14.9:1 on surface) |
| muted | #9AA4BC | secondary text, section labels (6.9:1 on surface) |
| border | #2A3552 | dividers, inputs at rest, secondary buttons and the selected step badge |
| border-strong | #3E4A6B | dashed drop zone, settings fields, switch off |
| row-divider | #222B45 | lines between list rows |
| laser | #E0393E | the mark's cursor bar, accents (not text) |
| laser-strong | #C62F34 | primary buttons with white text (5.4:1) |
| focus | #FF6B5E | 2px focus ring |
| success | #6EE0A6 on #0F2E22 (edge #1F5A3F) | sent, site on; switch on #23A86A |
| warning | #F5C46B on #33250D | no field, detached |
| error | #FF9A9C on #3A1619 | refused, unreadable, Remove/Delete links |
| disabled | #6B7591 text, #4A2A31 primary button | site off |

A dropped barcode thumbnail stays black on white: it shows the image as it is.

**Type**: the operating system's own UI font, no web font is bundled: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. That renders as SF Pro on macOS, Segoe UI on Windows and Roboto on ChromeOS and Linux, so the extension looks native next to Chrome and loads nothing. Codes, hosts and shortcuts use the system monospace: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`. Popup 14px body, 12px uppercase section labels, 16px monospace in the code input. Pages 15–16px body, 28px headline. The wordmark (logo and screen headers) is the UI font at weight 800 with tight tracking (-0.02em).

**Spacing**: 4px base; 12/16px popup padding; 8–10px radii on controls, 14–16px on cards.

**Components**: primary button (laser-strong, white text, 40px tall in popup); secondary button (border fill, text colour); site switch (green on, border-strong off, white knob); dashed drop zone; result line (icon + bold summary + detail); saved-code row with `kbd` shortcut; segmented control (suffix; selected segment is text-coloured with bg-coloured text).

**Tone of voice**: short, plain, scanner vocabulary ("scan", "prefix", "ends with Enter"). Tell the user what happened and what to do next; no blame, no jargon like "CDP" or "debugger attached" in the popup.

**Logo**: barcode bars that end in a tall red text cursor: a scan turning into typing. Modern flat style: three white bars of barcode widths (9/4/7 of 64), equal height with nearly square ends so they read as a barcode and not an audio meter, then a pill-shaped cursor with a coral-to-laser gradient that stands taller than the bars. All on a squircle tile (radius 18/64) with a deep ink gradient (#2A3A66 to #0E1526) and a faint white edge so it holds on dark toolbars. Only four shapes, so it reads at 16px. `mark.svg` is also the app icon. `logo.svg` is the mark beside "chrome-wedge" in heavy system sans (800, tight tracking) with a red hyphen. Use the mark alone in the popup header and as the icon; the full logo on the store page and S02. Don't recolour the cursor or place the mark without its tile. `logo.svg` has an ink (#16213A) wordmark for light backgrounds such as the store listing; on the product's dark screens the wordmark is set in text colour (#E8ECF5), and the red hyphen stays.

## Accessibility
- Text contrast at least 4.5:1 on the dark surfaces (see the colour table). White on #E0393E is only 4.4:1, so buttons use #C62F34 (5.4:1).
- Every focusable control shows a 2px #FF6B5E focus ring; the dark theme never relies on the browser's default ring.
- Popup focus order: site switch → code input (autofocus) → Scan → drop zone (Enter/Space opens file picker) → saved code Scan buttons → Edit → Help → settings.
- Site switch is a `role="switch"` with `aria-checked`; results announce via `role="status"`/`role="alert"`.
- State is never shown by colour alone: every result line has an icon and words.
- All controls work by keyboard; drop zone has a file-picker alternative.

## Open questions
- Exact feature parity list with the reference paid extension (to be itemised in the plan); new settings land in S03.
- Saved-code shortcuts: Alt+1..9 on the page may not be feasible; fallback is fewer, user-set shortcuts.
- The name contains "Chrome", which Web Store branding rules discourage; the logo is built so the wordmark can be swapped without changing the mark.
