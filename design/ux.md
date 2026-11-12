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
**Colours**
| Token | Hex | Use |
|---|---|---|
| ink | #16213A | text, primary dark surfaces, mark tile |
| laser | #E0393E | the mark's cursor bar, accents (not text) |
| laser-strong | #C62F34 | primary buttons with white text (5.4:1) |
| muted | #5B6478 | secondary text |
| border | #DDE1E8 | dividers, inputs at rest |
| border-strong | #B7BDC9 | dashed drop zone, form fields on settings |
| surface-alt | #F4F5F8 | page background, disabled fields |
| success | #14653F on #EAF6EF | sent, site on |
| warning | #7A4A00 on #FFF4E0 | no field, detached |
| error | #A3262A on #FDECEC | refused, unreadable |

**Type**: system-ui stack. Popup 14px body, 12px uppercase section labels, 16px monospace in the code input. Pages 15–16px body, 28px headline. Codes and hosts always in monospace (`ui-monospace, SF Mono, Menlo, Consolas`).

**Spacing**: 4px base; 12/16px popup padding; 8–10px radii on controls, 14–16px on cards.

**Components**: primary button (laser-strong, white text, 40px tall in popup); site switch (green on, grey off); dashed drop zone; result line (icon + bold summary + detail); saved-code row with `kbd` shortcut; segmented control (suffix).

**Tone of voice**: short, plain, scanner vocabulary ("scan", "prefix", "ends with Enter"). Tell the user what happened and what to do next; no blame, no jargon like "CDP" or "debugger attached" in the popup.

**Logo**: a barcode whose bars shrink into a wedge and end in a tall red text cursor: a scan turning into typing. `mark.svg` is the bars on an ink rounded tile, so it reads on light and dark toolbars and at 16px; it is also the app icon. `logo.svg` is the mark beside "chrome-wedge" in bold monospace with a red hyphen. Use the mark alone in the popup header and as the icon; the full logo on the store page and S02. Don't recolour the cursor bar or place the mark without its tile.

## Accessibility
- Text contrast at least 4.5:1. White on #E0393E is only 4.4:1, so buttons use #C62F34 (5.4:1).
- Popup focus order: site switch → code input (autofocus) → Scan → drop zone (Enter/Space opens file picker) → saved code Scan buttons → Edit → Help → settings.
- Site switch is a `role="switch"` with `aria-checked`; results announce via `role="status"`/`role="alert"`.
- State is never shown by colour alone: every result line has an icon and words.
- All controls work by keyboard; drop zone has a file-picker alternative.

## Open questions
- Exact feature parity list with the reference paid extension (to be itemised in the plan); new settings land in S03.
- Saved-code shortcuts: Alt+1..9 on the page may not be feasible; fallback is fewer, user-set shortcuts.
- The name contains "Chrome", which Web Store branding rules discourage; the logo is built so the wordmark can be swapped without changing the mark.
