// Service worker entry.
import { registerInstall } from "./install";
import { registerScan, scan } from "./scan";
import { registerSession } from "./session";
import { registerShortcuts } from "./shortcuts";

registerInstall();
registerSession();
registerScan();
registerShortcuts(scan);
