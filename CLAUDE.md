# chrome-wedge

Type or drop a barcode and it arrives as real keystrokes, like a hardware scanner

Developers and QA who test barcode-driven web apps (POS, warehouse, inventory) have to type codes by hand or fake scans with synthetic events that apps often ignore. Evidence is limited to the existence of rivals, not measured demand: several extensions already target this (see Competition). No user interviews or usage numbers were gathered; none are claimed.

## Where things are
- `design/` is the design library: `brief.md`, `ux.md`, and `screens/S01-name/` (`screen.png` + `spec.md`, plus
  `states/*.png` for empty, error and other states). Screens have permanent IDs (S01, S02, ...). Tickets name the
  screens they build by ID. **Read the spec and look at the screenshot of every screen you build**; `ux.md` has the
  colors, type and spacing. Don't edit `design/`; the designer owns it.
- Design canvas (private and behind a login, so you can't open it; it's where the design gets reviewed): <!-- canvas -->not published yet<!-- /canvas -->
- Source code lives outside `design/`. Put it where the stack below says.

## Stack
<!-- stack -->
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
<!-- /stack -->

## How we work here
- Two long-lived branches: `develop` is where the work lands (every ticket's PR goes there); `master` is the
  release branch and only moves when the maintainer launches a release. Never commit to `master`.
- One ticket at a time, on its own branch (`dmi/t-<n>`), cut from `develop`. Small, focused changes.
- Each ticket becomes a pull request into `develop` that the maintainer reviews. A pull request changes **under 500
  lines** (code and tests; lockfiles and generated files don't count); anything bigger can't be reviewed, so split it
  into more tickets.
- Commit messages and pull request titles say only what the change does (`Show the running meeting under Now`): no
  ticket number and no product name.
- Prefer boring, proven tools. Don't add a dependency unless the ticket needs it.
- Keep platform-specific code thin and put logic in pure code with unit tests (aim for about 90% coverage). Code
  that can't run in the sandbox is verified by review plus those tests, and then by hand by the maintainer.
- Format with the formatter in the stack table before you say you're done, and keep its check in CI and next to the
  test commands. Never format files your change doesn't touch.
- Write tests for what you build, and run them before you say you're done. Document the build and test commands in the README under "Development".
- Never commit secrets, tokens or personal data. Don't put real credentials in examples.
- If the ticket is unclear or the design is missing something, ask the architect or designer instead of guessing.
