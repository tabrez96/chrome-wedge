import * as i from "./install";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (...args: unknown[]) => unknown;

let installed: Listener | undefined;
let fake: ReturnType<typeof makeFake>;
function makeFake() {
  return {
    runtime: {
      getURL: (p: string) => `chrome-extension://ext/${p}`,
      onInstalled: { addListener: (f: Listener) => (installed = f) },
    },
    tabs: {
      get: vi.fn(async (id: number) => ({ id, index: 2, windowId: 1 })),
      create: vi.fn(async (..._a: unknown[]) => ({})),
    },
  };
}

const URL = "chrome-extension://ext/welcome.html";

beforeEach(() => {
  installed = undefined;
  fake = makeFake();
  vi.stubGlobal("chrome", fake as unknown as typeof chrome);
});
afterEach(() => vi.unstubAllGlobals());

describe("onInstalled", () => {
  it("opens welcome.html on install", async () => {
    await i.onInstalled({ reason: "install" });
    expect(fake.tabs.create).toHaveBeenCalledTimes(1);
    expect(fake.tabs.create).toHaveBeenCalledWith({ url: URL });
  });

  it("does nothing on update", async () => {
    await i.onInstalled({ reason: "update", previousVersion: "0.9.0" });
    await i.onInstalled({ reason: "chrome_update" });
    expect(fake.tabs.create).not.toHaveBeenCalled();
  });

  it("swallows a failure to open", async () => {
    fake.tabs.create.mockRejectedValueOnce(new Error("no tab"));
    await expect(i.onInstalled({ reason: "install" })).resolves.toBeUndefined();
  });
});

describe("openWelcome", () => {
  it("opens next to a tab", async () => {
    await i.openWelcome(7);
    expect(fake.tabs.create).toHaveBeenCalledWith({
      url: URL,
      windowId: 1,
      index: 3,
      openerTabId: 7,
    });
  });
});

describe("registerInstall", () => {
  it("wires onInstalled", async () => {
    i.registerInstall();
    installed!({ reason: "install" });
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.tabs.create).toHaveBeenCalledTimes(1);
  });
});
