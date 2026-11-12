# chrome-wedge
Free Chrome extension that types a barcode scan into the focused field as real keystrokes, ending with Enter, like a hardware keyboard-wedge scanner.

## Problem
Developers and QA who test barcode-driven web apps (POS, warehouse, inventory) have to type codes by hand or fake scans with synthetic events that apps often ignore. Evidence is limited to the existence of rivals, not measured demand: several extensions already target this (see Competition). No user interviews or usage numbers were gathered; none are claimed.

## Users & buyer
Users: developers and QA testing barcode-driven web apps. Buyer: none. The product is free (decision: "whatever the paid app does, for free").

## Competition
- Barcode Scanner Simulator (free): hotkeys for saved barcodes, phone as scanner, emulates keyboard-wedge input. https://barcodescannersimulator.app/
- Barcode Scanner Emulator (about $1.99/yr): the paid app whose feature set we match.
- Barcode Reader (Chrome Web Store): type a value in a popup and it simulates a scan.
- Various GitHub/Web Store extensions of the same kind.
Gap: none found that accepts a dropped barcode image or sends trusted keystrokes through the debugger API. Rivals avoid the debugger and its infobar.

## MVP scope
- Accept a typed string or a dropped barcode image.
- Image decoding: Code 128 (default), EAN-13, UPC-A.
- Send the scan as real keystrokes via Chrome's debugger API, ending with Enter.
- Feature parity with Barcode Scanner Emulator's feature set (to be itemised by the Architect from its listing).
- Safety: type only into the focused editable field of the tab you armed; refuse password fields; per-site opt-in.
- First-run explanation of the "debugging this browser" infobar.
- Installs as a Chrome extension, not a native app.

## Out of scope
- QR and other 2D formats (later).
- Native or desktop app, mobile companion.
- Paid tiers, accounts, telemetry.
- Hiding the infobar (not possible).

## Pricing hypothesis
Free. No revenue goal.

## Success metrics
- A scan typed or dropped reaches a focused field as trusted keystrokes plus Enter on a sample barcode-driven page.
- Decoding succeeds on a test set of Code 128, EAN-13 and UPC-A images.
- Password fields are refused and non-opted-in sites are untouched.
- Installs and ratings on the Web Store after launch (no target set; to be decided).

## Risks
- Infobar: Chrome shows "debugging this browser" on the tab and it cannot be hidden. If the user closes it, the debugger detaches and scans stop. Rivals avoid it, so some users will prefer them.
- Debugger permission may draw extra Web Store review scrutiny.
- Name: "chrome-wedge" includes the Chrome trademark, and Web Store branding rules discourage this; a rename may be needed before publishing. "Wedge" alone is already used by other products. A web search found no extension called chrome-wedge.
- Competition is free and established; the wedge (dropped image, trusted keystrokes) is unproven as a reason to switch.
- Open point: exact "paid app" feature list is not yet itemised.

## Runner-up ideas
None; this is the PM's own idea.
