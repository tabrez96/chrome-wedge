---
id: S03
name: Settings
purpose: Set how scans are typed, which sites are allowed, and the saved codes
size: 1280x800
---

## Content and actions
- **Typing**: prefix (optional text before the code), end each scan with Enter (default), Tab or Nothing; delay between keys 0–500 ms (default 10); image format to try first (Code 128 default, EAN-13, UPC-A).
- **Allowed sites**: add a host (with optional port), remove one. Removing a site detaches any tab on it. Switching a site on in S01 adds it here.
- **Saved codes**: table of name, code, shortcut; Add code and Edit open an inline row with Name, Code and Shortcut (Alt+1..Alt+9, each used once); Delete removes immediately with an "Undo" in the status line.
- Changes save as you make them; "✓ Changes saved" confirms in the header.

## States
- Filled (`screen.html`).
- Empty (`states/empty.html`): no sites, no saved codes, with a line explaining each.
- Error: invalid site address shows "Enter a host like localhost:3000 or pos.example.com" under the field (inline, no separate file).

## Notes and open questions
- Settings mirror a hardware scanner's setup options (prefix, suffix, speed), which is how the target users already think. The exact parity list with the reference paid extension is to be itemised in the plan; anything it adds lands here.

## Change log
- Created for the first UX.
- Header mark updated to the modernised logo (rounded bars, gradient tile, glowing cursor), as requested in review.
- Dark theme throughout (all states), header wordmark set like the logo, header mark synced with mark.svg; requested in review.
