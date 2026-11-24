---
id: S01
name: Popup
purpose: Send a scan (typed, dropped image or saved code) into the focused field of the current tab
size: 380x600
---

## Content and actions
- **Header**: mark, product name, settings button (opens S03).
- **Site switch**: "On/Off for <host>". Turning it on adds the host to the allowed sites (S03) and attaches the debugger to this tab; Chrome then shows its debugging bar. The first time ever, turning it on opens S02 in a new tab.
- **Code to scan**: monospace input, focused when the popup opens. Enter or **Scan** types the value into the page's focused field, then the suffix (default Enter). The popup stays open so you can scan again.
- **Drop zone**: drop or choose an image (PNG, JPEG, WebP). Decodes Code 128, EAN-13, UPC-A (the default format from S03 is tried first). On success the decoded value fills the input and is shown with a thumbnail; it is not sent until you press Scan.
- **Saved codes**: up to 9, each with name, value, shortcut (Alt+1..Alt+9) and a Scan button. "Edit" opens S03.
- **Result line**: the last outcome (sent, refused, error). Uses `role="status"` for success and `role="alert"` for problems.
- **Footer**: current suffix and key delay (from S03), Help link (opens S02).

## States
- Sent (main, `screen.html`): "Scanned <code>: N keys + Enter into "<field label>"".
- Site off (`states/site-off.html`): input, Scan and saved-code buttons disabled until the switch is on.
- Image decoded (`states/image-decoded.html`): thumbnail, format found, value, file name.
- Unreadable image (`states/unreadable.html`): no barcode found; suggests a sharper image; notes QR isn't supported yet.
- Sent to the page (`states/page.html`): nothing editable is focused, so the keys go to the page itself (`document.body`; they bubble to `document` and `window`, where scanner listeners usually sit). "Scanned <code>: N keys + Enter into the page (no focused field)". Green, `role="status"`, like any sent scan.
- Refused (`states/refused.html`): focused field is a password field; nothing sent.
- No field (`states/no-field.html`): focus is inside a frame from another site (cross-origin iframe), which can't be reached; nothing sent. "Not sent: that field is in a frame from another site" / "Click a field in the page itself, then scan again."
- Detached (`states/detached.html`): the debugging bar was closed or cancelled; "Reconnect this tab" re-attaches.
- Loading: while typing, the Scan button reads "Typing…" and is disabled (no separate file; long codes at 10 ms take well under a second).

## Notes and open questions
- Popup max height in Chrome is 600px, so the layout fits 380x600 with three saved codes; more codes scroll inside the list.
- Nothing focused is a success, not a problem: many scanner-driven apps listen for keys on the whole page rather than in a field, and a hardware scanner would type into the page too. The wording "(no focused field)" still tells you where the keys went, in case you meant to click a field first.
- The field label in the success line comes from the field's label, aria-label or placeholder; falls back to "the focused field".
- Saved-code shortcuts must work while the page (not the popup) is focused. Whether Alt+1..9 is feasible (chrome.commands allows few defaults) is for the architecture; fallback is fewer shortcuts set in chrome://extensions/shortcuts.

## Change log
- Created for the first UX.
- Header mark updated to the modernised logo (rounded bars, gradient tile, glowing cursor), as requested in review.
- Dark theme throughout (all states), header wordmark set like the logo, header mark synced with mark.svg; requested in review.
- Primary button changed from red to a light fill with ink text, so red stays on the logo's cursor only; requested in review.
- Nothing focused now sends the scan to the page (new `states/page.html`); `states/no-field.html` now covers only a field inside a cross-origin frame; warning background fixed to #33250D in every state (it was an invalid colour); requested in a ticket.
