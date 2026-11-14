// @vitest-environment node
import { describe, expect, it } from "vitest";
import manifest from "../public/manifest.json";

describe("manifest", () => {
  it("declares only debugger, storage and activeTab", () => {
    expect(manifest.permissions).toEqual(["debugger", "storage", "activeTab"]);
    expect("host_permissions" in manifest).toBe(false);
    expect("content_scripts" in manifest).toBe(false);
  });

  it("wires popup, options page, worker and icons", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe("118");
    expect(manifest.background.service_worker).toBe("background.js");
    expect(manifest.action.default_popup).toBe("popup.html");
    expect(manifest.options_page).toBe("settings.html");
    expect(Object.keys(manifest.icons)).toEqual(["16", "32", "48", "128"]);
  });
});
