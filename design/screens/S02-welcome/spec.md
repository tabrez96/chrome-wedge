---
id: S02
name: Welcome and debugging bar explanation
purpose: Explain, before the first scan, why Chrome shows a debugging bar and how to scan safely
size: 1280x800
---

## Content and actions
- Headline and one paragraph on why the bar appears and that it cannot be hidden.
- An illustration of Chrome's debugging bar above a sample app page (an "Item code" field with a scan typed in), with the warning: leaving it open is required; closing it or pressing Cancel stops scans on that tab.
- Three steps: turn it on for a site (S01), click a field, scan.
- Safety summary: focused field only, switched-on tab only, never password fields.
- **Got it**: closes the tab and marks first run done. "Change typing settings" opens S03.

## States
- Single state. Opened automatically on install and the first time a site is switched on; reopened from the Help link in S01.

## Notes and open questions
- The illustration is drawn, not a screenshot of Chrome, so it stays correct across Chrome themes; the bar's exact wording varies by Chrome version.

## Change log
- Created for the first UX.
- Header mark updated to the modernised logo (rounded bars, gradient tile, glowing cursor), as requested in review.
- Dark theme throughout (all states), header wordmark set like the logo, header mark synced with mark.svg; requested in review.
- Bar illustration: the white striped page area replaced with a dark mock page showing an "Item code" field with a typed scan; warning callout fixed (invalid background colour, odd right alignment); Got it is now the light primary button; requested in review.
