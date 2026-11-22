# chrome-wedge: guide

## Getting started
1. Add chrome-wedge to Chrome from the Chrome Web Store. It needs Chrome 118 or newer, and there's no account to create.
2. A welcome page opens in a new tab. Read why Chrome will show a "started debugging this browser" bar while chrome-wedge types, then press **Got it** (S02).
3. Pin chrome-wedge to the toolbar: click the puzzle-piece icon next to the address bar, then the pin beside chrome-wedge.
4. Open the web app you want to test, click the chrome-wedge icon and turn on the switch for that site. Chrome shows its debugging bar on the tab; leave it open, because closing it stops scans on that tab (S01).
5. Optional: click the gear in the popup to choose what each scan ends with (Enter, Tab or nothing), add a prefix, or slow the typing down if your app drops characters (S03).

## How to use it

**Scan a code you type**
1. On the page, click the field your app reads scans from, such as "Item code".
2. Click the chrome-wedge icon. The code box is ready for typing (S01).
3. Type the code and press Enter or **Scan**. It's typed into the field, followed by Enter, and a green line confirms what was sent (S01).
4. The popup stays open, so you can type the next code straight away.

**Scan a barcode image**
1. Click the field on the page, then open the popup (S01).
2. Drop a PNG, JPEG or WebP image onto "Drop a barcode image", or click **choose a file**.
3. Check the code it found, shown with a small preview of the image, then press **Scan**. Nothing is typed until you do (S01).
4. If no barcode is found, try a sharper or closer image. Code 128, EAN-13 and UPC-A are supported; QR codes are not yet (S01).

**Re-send codes you use often**
1. Click the gear in the popup, then **Add code** under "Saved codes". Give it a name, the code and a shortcut from Alt+1 to Alt+9. It saves as you type (S03).
2. Back on your switched-on page, click the field and press the shortcut, or open the popup and press **Scan** beside the saved code (S01). If Alt and a number doesn't work on your computer, use Alt+Shift and the number instead.

**If a scan doesn't go through**
- "No field is focused": click the field on the page first, then scan again (S01).
- A password field is focused: chrome-wedge never types into those (S01).
- The debugging bar was closed: press **Reconnect this tab** in the popup (S01).
- The switch is off: turn it on for this site, or add the site under "Allowed sites" (S01, S03).
