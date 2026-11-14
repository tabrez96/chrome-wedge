# chrome-wedge — System design

## Overview
chrome-wedge is a free Chrome extension for developers and testers who work on barcode-driven web apps such as point of sale, warehouse and inventory systems. Type a code or drop a barcode image, and it arrives in the field you clicked as real keystrokes followed by Enter, just like a hardware barcode scanner. You switch it on per site, it types only into the focused field of that tab, and it never types into password fields. Save the codes you use often and send them with one click or a keyboard shortcut.

## Stack
| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript (strict) | The Chrome debugger protocol calls are untyped strings; types catch mistakes in the keystroke code. |
| Build | Vite, multi-page build (popup, welcome, settings, service worker) | Standard, fast, no framework needed; outputs a plain `dist/` that loads unpacked. |
| UI | Vanilla DOM + one shared `tokens.css` | Three small screens; a framework would be more code than the screens. |
| Extension platform | Manifest V3, `minimum_chrome_version: "118"` | Required by the Web Store. From 118 an active `chrome.debugger` session keeps the service worker alive. |
| Keystrokes | `chrome.debugger` + Chrome DevTools Protocol `Input.dispatchKeyEvent` | The only way an extension can send trusted (`isTrusted: true`) key events. |
| Barcode decoding | `@zxing/library` (pure JS) | Proven, reads Code 128 / EAN-13 / UPC-A; no WebAssembly, so no CSP exception in the manifest. |
| Storage | `chrome.storage.local` (settings), `chrome.storage.session` (per-tab state) | Built in, nothing to host. `local` over `sync`: no quota errors and no surprise cross-device syncing. |
| Unit tests | Vitest + jsdom | Same config as Vite; jsdom covers the page-side focus probe. |
| End-to-end tests | Playwright (Chromium, extension loaded from `dist/`) | Can load an unpacked extension and check `event.isTrusted` on a fixture page. |
| Type check | `tsc --noEmit` | Vite strips types without checking them. |
| Formatter | Prettier (defaults), check `prettier --check .` | Handbook default for TypeScript, HTML, CSS, JSON, Markdown. |
| CI | GitHub Actions: format check, type check, unit tests, build, e2e | Runs on every pull request into `develop`. |
| Hosting | Chrome Web Store (manual upload of the built zip) | It is an extension; there is no server. |

Permissions: `debugger`, `storage`, `activeTab`. No host permissions and no content scripts: everything that touches the page goes through the debugger session on the tab the user switched on.

## Components
- **`manifest.json`**: action popup (`popup.html`), options page (`settings.html`), background service worker, icons generated from `design/brand/mark.svg`.
- **`src/core/`** (pure, unit-tested, no `chrome.*`):
  - `settings.ts`: settings type, defaults, validation, migration by `version`.
  - `hosts.ts`: normalise and validate `host[:port]`, match a URL against allowed sites.
  - `keymap.ts`: one character → CDP key event parameters (`key`, `code`, `windowsVirtualKeyCode`, `text`, shift modifier) for printable ASCII; other characters are sent with `key`/`text` only. Enter and Tab keys.
  - `scanPlan.ts`: prefix + value + suffix + key delay → ordered list of key events and waits.
  - `focusProbe.ts`: a function that runs in the page (serialised with `Function.prototype.toString`) and reports the focused element: `editable` (with label from `<label>`, `aria-label`, `placeholder`, else "the focused field"), `password`, or `none`. Descends into same-origin iframes and shadow roots; a focused cross-origin iframe reports `none`.
  - `decode.ts`: RGBA pixels → `{format, value}` or `unreadable`; tries the default format alone first, then all three.
  - `messages.ts`: typed popup ↔ service worker messages and scan results.
- **`src/background/`** (service worker):
  - `session.ts`: attach/detach per tab, `Emulation.setFocusEmulationEnabled` so the page keeps its focused field while the popup is open, tab state in `chrome.storage.session`, `chrome.debugger.onDetach` (user closed the bar → state `detached`), main-frame navigation guard (navigated to a host that is not allowed → detach), allowed-site removal → detach tabs on that host.
  - `scan.ts`: check site allowed (reads `location.host` through the session) → run focus probe → refuse/none or dispatch the scan plan → result. One scan at a time per tab.
  - `shortcuts.ts`: on attach, installs a capture-phase `keydown` listener for Alt+1..Alt+9 (matched by `event.code`, so it works on macOS where Alt+digit types a symbol) via `Runtime.addBinding` + `Page.addScriptToEvaluateOnNewDocument`; `Runtime.bindingCalled` → scan the saved code with that shortcut. Only exists on switched-on tabs.
  - `install.ts`: opens S02 on install.
- **`src/popup/`** (S01): site switch, code input, Scan, drop zone and file picker, saved codes, result line, footer. Converts a dropped image to pixels on a canvas and calls `decode.ts`.
- **`src/welcome/`** (S02): static page; Got it sets `firstRunDone` and closes the tab.
- **`src/settings/`** (S03): typing, allowed sites, saved codes; saves on every change.
- **`src/ui/tokens.css`**: the colour, type and spacing tokens from the UX spec, shared by all three pages.

## Data model
`chrome.storage.local` key `settings`:
```ts
type Settings = {
  version: 1;
  prefix: string;                       // default ""
  suffix: "enter" | "tab" | "none";     // default "enter"
  keyDelayMs: number;                   // 0–500, default 10
  defaultFormat: "code128" | "ean13" | "upca"; // default "code128"
  allowedSites: string[];               // normalised "host" or "host:port", unique
  savedCodes: SavedCode[];              // at most 9
  firstRunDone: boolean;                // default false
};
type SavedCode = { id: string; name: string; value: string; shortcut: 1|2|3|4|5|6|7|8|9|null }; // shortcut unique
```
Scan values: 1–256 characters, no line breaks (the suffix provides the Enter).

`chrome.storage.session` key `tabs`: `{ [tabId]: { host: string; state: "attached" | "detached"; lastResult?: ScanResult } }`.

`ScanResult`: `{ kind: "sent", value, keys, suffix, fieldLabel } | { kind: "refused" } | { kind: "no-field" } | { kind: "site-off" } | { kind: "detached" } | { kind: "error", message }`. These map one to one to the S01 states.

## Key flows
1. **Switch on and scan (typed)**
   1. Popup opens; `activeTab` gives the tab's URL; popup asks the worker for the tab state and shows S01 (site off, on, or detached).
   2. Switch on → worker adds the host to `allowedSites`, `chrome.debugger.attach({tabId}, "1.3")`, enables focus emulation, installs the shortcut listener. Chrome shows its bar. If `firstRunDone` is false, S02 opens in a new tab.
   3. User clicks a field on the page, reopens the popup, types a code, presses Enter.
   4. Worker: tab attached and `location.host` allowed? → focus probe → `password` gives *refused*, `none` gives *no-field* → otherwise for each key: `keyDown` (with `text`) then `keyUp`, waiting `keyDelayMs` between keys, then the suffix key.
   5. Result is stored on the tab and returned; S01 shows "Scanned <code>: N keys + Enter into "<label>"".
2. **Image scan**: drop or pick a PNG/JPEG/WebP → `createImageBitmap` → canvas → pixels → `decode.ts` with the default format first → value fills the input with the thumbnail (S01 image-decoded) or S01 unreadable. Nothing is sent until Scan, which follows flow 1 from step 4.
3. **Saved code by shortcut**: on the switched-on tab the page listener sees Alt+N, calls the binding; the worker looks up the saved code with shortcut N and runs flow 1 from step 4. Page keys outside switched-on tabs are never observed.
4. **Bar closed**: `onDetach` with reason `canceled_by_user` → tab state `detached` → S01 detached; Reconnect this tab re-runs the attach in flow 1 step 2.

## Feature parity
The reference paid extension's listing could not be fetched while writing this design, so this list is the feature set common to keyboard-wedge emulators, all of which are in the UX: typed scan into the focused field; saved codes with one-click send; keyboard shortcuts for saved codes; prefix; suffix (Enter, Tab, none); delay between keys. Any listing feature beyond this goes to S03 as a follow-up ticket.

## Testing approach
- `npm run format:check` (`prettier --check .`), `npm run typecheck` (`tsc --noEmit`), `npm test` (Vitest, unit, with coverage: aim for 90% on `src/core/`).
- `npm run build` then `npm run e2e` (Playwright, Chromium with `dist/` loaded): a fixture page under `e2e/fixtures/` records every `keydown` with `isTrusted`, `key` and the field value. Checks: typed scan arrives trusted, ending with Enter; prefix and Tab/none suffix; password field refused and unchanged; no focused field gives no-field; a site not switched on is untouched; navigation to another host detaches; Alt+1 sends saved code 1.
- Decoder fixtures: Code 128, EAN-13 and UPC-A PNGs (clean, scaled, rotated slightly, low contrast) plus non-barcode images in `test/fixtures/barcodes/`, generated once by a script with `bwip-js` (dev dependency) and committed.
- Things the sandbox cannot check (the bar's appearance, closing it by hand) are checked by hand from the README's manual checklist.

## Open questions
- Linux Chrome uses Alt+1..Alt+8 to switch tabs. If Chrome handles those before the page sees them, saved-code shortcuts on Linux need a second binding (Alt+Shift+1..9). The shortcuts ticket checks this and reports.
- The name contains "Chrome", which Web Store branding rules discourage; a rename before publishing only changes strings and the wordmark.
- Typing into a focused cross-origin iframe is not supported in this version (reported as no field).
