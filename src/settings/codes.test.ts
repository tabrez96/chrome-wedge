// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultSettings,
  type SavedCode,
  type Settings,
} from "../core/settings";
import { initSettings, type SettingsApi } from "./main";

const html = readFileSync("settings.html", "utf8");
beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(
    html,
    "text/html",
  ).body.innerHTML;
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const $ = <T extends HTMLElement>(sel: string) =>
  document.querySelector(sel) as T;
const code = (n: number, over: Partial<SavedCode> = {}): SavedCode => ({
  id: `id${n}`,
  name: `Name ${n}`,
  value: `value${n}`,
  shortcut: null,
  ...over,
});

let stored: SavedCode[] = [];
let changed: (s: Settings) => void = () => {};

async function setup(
  initial: SavedCode[] = [],
  saveCodes: SettingsApi["saveCodes"] = vi.fn(async (fn) => {
    stored = fn(stored);
  }),
) {
  stored = initial;
  const api: SettingsApi = {
    load: async () => ({ ...defaultSettings(), savedCodes: stored }),
    save: vi.fn(async () => {}),
    addSite: vi.fn(async () => {}),
    removeSite: vi.fn(async () => {}),
    saveCodes,
    newId: () => "new-id",
    onChange: (l) => (changed = l),
  };
  await initSettings(document, api);
  return { api, saveCodes };
}

const rows = () => [...document.querySelectorAll("#codes-list tr")];
const status = () => $("#save-status").textContent;
const errorText = () => {
  const e = $("#code-error");
  return e.hidden ? null : e.textContent;
};
const fill = (name: string, value: string, shortcut = "") => {
  $<HTMLInputElement>(".edit-name").value = name;
  $<HTMLInputElement>(".edit-value").value = value;
  $<HTMLSelectElement>(".edit-shortcut").value = shortcut;
};
const click = (sel: string) => $<HTMLElement>(sel).click();
const saveEdit = async () => {
  click(".code-edit .primary");
  await flush();
};

describe("saved codes card", () => {
  it("renders rows with name, value and shortcut", async () => {
    await setup([code(1, { shortcut: 3 }), code(2)]);
    expect(rows()).toHaveLength(2);
    expect(rows()[0]!.querySelector(".code-name")!.textContent).toBe("Name 1");
    expect(rows()[0]!.querySelector(".code-value")!.textContent).toBe("value1");
    expect(rows()[0]!.querySelector("kbd")!.textContent).toBe("Alt+3");
    expect(rows()[1]!.querySelector("kbd")).toBeNull();
    expect($("#codes-empty").hidden).toBe(true);
  });

  it("shows the empty line when there are no codes", async () => {
    await setup([]);
    expect($("#codes-empty").hidden).toBe(false);
    expect($("#codes-table").hidden).toBe(true);
  });

  it("adds a code and saves it", async () => {
    const { saveCodes } = await setup([]);
    click("#add-code");
    fill("  Milk ", "123 456", "1");
    await saveEdit();
    expect(saveCodes).toHaveBeenCalledTimes(1);
    expect(stored).toEqual([
      { id: "new-id", name: "Milk", value: "123 456", shortcut: 1 },
    ]);
    expect(rows()).toHaveLength(1);
    expect(status()).toBe("✓ Changes saved");
  });

  it("saves on Enter and cancels on Escape", async () => {
    await setup([]);
    click("#add-code");
    fill("", "abc");
    $(".edit-value").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await flush();
    expect(stored.map((c) => c.value)).toEqual(["abc"]);
    click("#add-code");
    $(".edit-value").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect($(".code-edit")).toBeNull();
    expect(rows()).toHaveLength(1);
  });

  it("refuses a duplicate shortcut", async () => {
    const { saveCodes } = await setup([code(1, { shortcut: 1 })]);
    click("#add-code");
    fill("B", "b", "1");
    await saveEdit();
    expect(errorText()).toBe("Alt+1 is already used by another code.");
    expect($(".edit-shortcut").getAttribute("aria-invalid")).toBe("true");
    expect(saveCodes).not.toHaveBeenCalled();
    expect($(".code-edit")).not.toBeNull();
  });

  it("refuses a duplicate shortcut that only the stored list has", async () => {
    // The page thinks shortcut 1 is free; storage already has it.
    const saveCodes = vi.fn(async (fn: (c: SavedCode[]) => SavedCode[]) => {
      stored = fn([...stored, code(2, { shortcut: 1 })]);
    });
    await setup([], saveCodes);
    click("#add-code");
    fill("B", "b", "1");
    await saveEdit();
    expect(errorText()).toBe("Alt+1 is already used by another code.");
    expect($(".edit-shortcut").getAttribute("aria-invalid")).toBe("true");
    expect(stored.map((c) => c.id)).toEqual(["id2"]);
    expect($(".code-edit")).not.toBeNull();
    expect(status()).not.toBe("✓ Changes saved");
  });

  it("keeps a newer editor open when an earlier save finishes", async () => {
    let finish: () => void = () => {};
    const saveCodes = vi.fn(
      (fn: (c: SavedCode[]) => SavedCode[]) =>
        new Promise<void>((resolve) => {
          finish = () => {
            stored = fn(stored);
            resolve();
          };
        }),
    );
    await setup([], saveCodes);
    click("#add-code");
    fill("A", "a");
    click(".code-edit .primary");
    click(".code-edit .link");
    click("#add-code");
    fill("B draft", "b draft");
    finish();
    await flush();
    expect($(".code-edit")).not.toBeNull();
    expect($<HTMLInputElement>(".edit-name").value).toBe("B draft");
    expect($<HTMLInputElement>(".edit-value").value).toBe("b draft");
    expect($<HTMLButtonElement>("#add-code").disabled).toBe(true);
    click(".code-edit .link");
    expect(
      rows().map((r) => r.querySelector(".code-value")!.textContent),
    ).toEqual(["a"]);
  });

  it("refuses an empty value", async () => {
    const { saveCodes } = await setup([]);
    click("#add-code");
    fill("A", "");
    await saveEdit();
    expect(errorText()).toBe("Enter a code to save.");
    expect($(".edit-value").getAttribute("aria-invalid")).toBe("true");
    expect(saveCodes).not.toHaveBeenCalled();
  });

  it("refuses 257 characters and accepts 256", async () => {
    const { saveCodes } = await setup([]);
    click("#add-code");
    fill("A", "x".repeat(257));
    await saveEdit();
    expect(errorText()).toBe("Codes can be up to 256 characters.");
    expect(saveCodes).not.toHaveBeenCalled();
    fill("A", "x".repeat(256));
    await saveEdit();
    expect(saveCodes).toHaveBeenCalledTimes(1);
  });

  it("refuses a tenth code without opening an editor", async () => {
    await setup(Array.from({ length: 9 }, (_, i) => code(i)));
    click("#add-code");
    expect(errorText()).toBe(
      "You can save up to 9 codes. Delete one to add another.",
    );
    expect($(".code-edit")).toBeNull();
  });

  it("edits a code keeping its id and own shortcut", async () => {
    await setup([code(1, { shortcut: 2 }), code(2)]);
    click("tr button.link");
    expect($<HTMLInputElement>(".edit-name").value).toBe("Name 1");
    expect($<HTMLInputElement>(".edit-value").value).toBe("value1");
    expect($<HTMLSelectElement>(".edit-shortcut").value).toBe("2");
    $<HTMLInputElement>(".edit-value").value = "changed";
    await saveEdit();
    expect(stored[0]!).toMatchObject({
      id: "id1",
      value: "changed",
      shortcut: 2,
    });
    expect(stored).toHaveLength(2);
  });

  it("cancel restores the row and saves nothing", async () => {
    const { saveCodes } = await setup([code(1)]);
    click("tr button.link");
    $<HTMLInputElement>(".edit-value").value = "changed";
    click(".code-edit .link");
    expect(saveCodes).not.toHaveBeenCalled();
    expect(rows()[0]!.querySelector(".code-value")!.textContent).toBe("value1");
  });

  it("delete removes the row and Undo restores it in place", async () => {
    await setup([code(1), code(2), code(3)]);
    click('[aria-label="Delete Name 2"]');
    await flush();
    expect(stored.map((c) => c.id)).toEqual(["id1", "id3"]);
    expect(status()).toBe("Deleted Name 2.");
    expect($("#undo").hidden).toBe(false);
    click("#undo");
    await flush();
    expect(stored.map((c) => c.id)).toEqual(["id1", "id2", "id3"]);
    expect(rows()).toHaveLength(3);
    expect(rows()[1]!.querySelector(".code-name")!.textContent).toBe("Name 2");
    expect($("#undo").hidden).toBe(true);
    expect(status()).toBe("✓ Changes saved");
  });

  it("shows no Undo when the delete fails", async () => {
    await setup(
      [code(1)],
      vi.fn(async () => {
        throw new Error("nope");
      }),
    );
    click('[aria-label="Delete Name 1"]');
    await flush();
    expect(status()).toBe("Couldn't save your change.");
    expect($("#undo").hidden).toBe(true);
  });

  it("another save hides Undo", async () => {
    await setup([code(1)]);
    click('[aria-label="Delete Name 1"]');
    await flush();
    click("#add-code");
    fill("", "z");
    await saveEdit();
    expect($("#undo").hidden).toBe(true);
  });

  it("re-renders when the codes change elsewhere, but not under an open editor", async () => {
    await setup([code(1)]);
    changed({ ...defaultSettings(), savedCodes: [code(1), code(2)] });
    expect(rows()).toHaveLength(2);
    click("tr button.link");
    changed({ ...defaultSettings(), savedCodes: [code(1), code(2), code(3)] });
    expect($(".code-edit")).not.toBeNull();
    click(".code-edit .link");
    expect(rows()).toHaveLength(3);
  });

  it("shows HTML in a name as text", async () => {
    await setup([code(1, { name: "<b>x</b>" })]);
    expect(rows()[0]!.querySelector("b")).toBeNull();
    expect(rows()[0]!.querySelector(".code-name")!.textContent).toBe(
      "<b>x</b>",
    );
  });
});
