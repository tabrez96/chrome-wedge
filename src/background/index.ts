// Service worker entry. Install handling is added in a later ticket.
import { registerScan } from "./scan";
import { registerSession } from "./session";

registerSession();
registerScan();
chrome.runtime.onInstalled.addListener(() => {});
