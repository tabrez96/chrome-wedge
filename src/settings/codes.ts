import {
  cleanName,
  parseShortcut,
  restoreCode,
  savedCodeMessage,
  withCode,
  withoutCode,
} from "../core/savedCodes";
import {
  checkSavedCode,
  MAX_NAME_LENGTH,
  MAX_SAVED_CODES,
  type SavedCode,
  type SavedCodeError,
  type Shortcut,
} from "../core/settings";

export type CodesApi = {
  saveCodes(fn: (codes: SavedCode[]) => SavedCode[]): Promise<void>;
  newId(): string;
};

// Returns render(codes) so main.ts can push loaded/changed settings in.
export function initSavedCodes(
  doc: Document,
  api: CodesApi,
  report: (work: Promise<void>) => Promise<void>,
): (codes: readonly SavedCode[]) => void {
  const byId = <T extends HTMLElement>(id: string) =>
    doc.getElementById(id) as T;
  const list = byId("codes-list");
  const table = byId("codes-table");
  const empty = byId("codes-empty");
  const error = byId("code-error");
  const addButton = byId<HTMLButtonElement>("add-code");
  const undo = byId("undo");
  const status = byId("save-status");

  let codes: SavedCode[] = [];
  let editing: string | "new" | null = null;
  let lastDeleted: { code: SavedCode; index: number } | null = null;

  const label = (c: SavedCode) => c.name || c.value;

  function button(cls: string, text: string, aria?: string): HTMLButtonElement {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = text;
    if (aria) b.setAttribute("aria-label", aria);
    return b;
  }

  function cell(cls: string, text: string): HTMLTableCellElement {
    const td = doc.createElement("td");
    td.className = cls;
    td.textContent = text;
    return td;
  }

  function render(next: readonly SavedCode[]): void {
    codes = [...next];
    if (editing !== null) return;
    list.replaceChildren();
    for (const code of codes) {
      const row = doc.createElement("tr");
      const shortcut = doc.createElement("td");
      if (code.shortcut !== null) {
        const kbd = doc.createElement("kbd");
        kbd.textContent = `Alt+${code.shortcut}`;
        shortcut.append(kbd);
      }
      const actions = doc.createElement("td");
      const edit = button("link", "Edit", `Edit ${label(code)}`);
      edit.addEventListener("click", () => openEditor(code, row));
      const del = button("link-danger", "Delete", `Delete ${label(code)}`);
      del.addEventListener("click", () => void remove(code));
      actions.append(edit, del);
      row.append(
        cell("code-name", code.name),
        cell("code-value", code.value),
        shortcut,
        actions,
      );
      list.append(row);
    }
    table.hidden = codes.length === 0;
    empty.hidden = codes.length !== 0;
    addButton.disabled = false;
  }

  function showError(message: string): void {
    error.textContent = message;
    error.hidden = false;
  }

  function closeEditor(): void {
    editing = null;
    error.hidden = true;
    render(codes);
  }

  function openEditor(code: SavedCode | null, row?: HTMLElement): void {
    if (editing !== null) return;
    error.hidden = true;
    const tr = doc.createElement("tr");
    tr.className = "code-edit";

    const name = doc.createElement("input");
    name.className = "edit-name";
    name.maxLength = MAX_NAME_LENGTH;
    name.autocomplete = "off";
    name.setAttribute("aria-label", "Name");
    name.value = code?.name ?? "";

    const value = doc.createElement("input");
    value.className = "edit-value";
    value.autocomplete = "off";
    value.spellcheck = false;
    value.setAttribute("aria-label", "Code");
    value.value = code?.value ?? "";

    const select = doc.createElement("select");
    select.className = "edit-shortcut";
    select.setAttribute("aria-label", "Shortcut");
    const none = doc.createElement("option");
    none.value = "";
    none.textContent = "None";
    select.append(none);
    for (let n = 1; n <= 9; n++) {
      const o = doc.createElement("option");
      o.value = String(n);
      o.textContent = `Alt+${n}`;
      select.append(o);
    }
    select.value =
      code?.shortcut === null || !code ? "" : String(code.shortcut);

    const cellOf = (el: HTMLElement) => {
      const td = doc.createElement("td");
      td.append(el);
      return td;
    };
    const saveButton = button("primary small", "Save");
    const cancelButton = button("link", "Cancel");
    const actions = doc.createElement("td");
    actions.append(saveButton, cancelButton);
    tr.append(cellOf(name), cellOf(value), cellOf(select), actions);

    const refuse = (err: SavedCodeError, shortcut: Shortcut | null) => {
      (err === "shortcut-taken" ? select : value).setAttribute(
        "aria-invalid",
        "true",
      );
      showError(savedCodeMessage(err, shortcut));
    };
    const save = async () => {
      if (saveButton.disabled) return;
      const next: SavedCode = {
        id: editing === "new" ? api.newId() : (editing as string),
        name: cleanName(name.value),
        value: value.value,
        shortcut: parseShortcut(select.value),
      };
      const err = checkSavedCode(next, codes);
      value.removeAttribute("aria-invalid");
      select.removeAttribute("aria-invalid");
      if (err) return refuse(err, next.shortcut);
      // Check again against the stored list: `codes` may be stale.
      let refused: SavedCodeError | null = null;
      saveButton.disabled = true;
      await report(
        api.saveCodes((c) => {
          refused = checkSavedCode(next, c);
          return refused ? c : withCode(c, next);
        }),
      );
      saveButton.disabled = false;
      if (!tr.isConnected) {
        // This editor was closed while the write ran; leave any newer editor alone.
        if (!refused && !status.classList.contains("error"))
          render(withCode(codes, next));
        return;
      }
      if (refused) {
        status.textContent = "";
        return refuse(refused, next.shortcut);
      }
      if (status.classList.contains("error")) return;
      editing = null;
      error.hidden = true;
      undo.hidden = true;
      lastDeleted = null;
      render(withCode(codes, next));
    };
    saveButton.addEventListener("click", () => void save());
    cancelButton.addEventListener("click", closeEditor);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeEditor();
      else if (
        e.key === "Enter" &&
        (e.target as HTMLElement).tagName === "INPUT"
      )
        void save();
    });

    if (row) row.replaceWith(tr);
    else list.append(tr);
    table.hidden = false;
    empty.hidden = true;
    editing = code ? code.id : "new";
    addButton.disabled = true;
    name.focus();
  }

  async function remove(code: SavedCode): Promise<void> {
    const index = codes.findIndex((c) => c.id === code.id);
    lastDeleted = { code, index };
    render(withoutCode(codes, code.id));
    await report(api.saveCodes((c) => withoutCode(c, code.id)));
    if (!status.classList.contains("error") && lastDeleted?.code === code) {
      status.textContent = `Deleted ${label(code)}.`;
      undo.hidden = false;
    }
  }

  addButton.addEventListener("click", () => {
    if (codes.length >= MAX_SAVED_CODES) {
      showError(savedCodeMessage("too-many", null));
      return;
    }
    openEditor(null);
  });

  undo.addEventListener("click", () => {
    undo.hidden = true;
    if (!lastDeleted) return;
    const { code, index } = lastDeleted;
    lastDeleted = null;
    render(restoreCode(codes, code, index));
    void report(api.saveCodes((c) => restoreCode(c, code, index)));
  });

  return render;
}
