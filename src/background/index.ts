// Service worker entry.
import { registerInstall } from "./install";
import { registerScan } from "./scan";
import { registerSession } from "./session";

registerInstall();
registerSession();
registerScan();
