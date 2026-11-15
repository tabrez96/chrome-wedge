// Service worker entry. Scan and install handling are added in later tickets.
import { registerSession } from "./session";

registerSession();
chrome.runtime.onInstalled.addListener(() => {});
