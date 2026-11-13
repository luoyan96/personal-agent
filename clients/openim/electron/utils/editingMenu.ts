import type { ContextMenuParams, MenuItemConstructorOptions } from "electron";

const roles = ["undo", "redo", "cut", "copy", "paste", "delete", "selectAll"] as const;
export type EditingLabels = Record<(typeof roles)[number], string>;

/** Native roles act on the focused input/frame and keep Chromium's paste event. */
export function editingMenu(labels: EditingLabels): MenuItemConstructorOptions[] {
  return roles.flatMap((role, index): MenuItemConstructorOptions[] => [
    ...(index === 2 || index === 6 ? [{ type: "separator" as const }] : []),
    { role, label: labels[role] },
  ]);
}

export function inputContextMenu(
  params: Pick<ContextMenuParams, "isEditable" | "formControlType" | "editFlags">,
  labels: EditingLabels,
): MenuItemConstructorOptions[] {
  // Leave message/image/file context menus and ordinary page content alone.
  const textControl = /^(input-(text|search|url|email|telephone|number|password)|text-area)$/.test(params.formControlType);
  if (!params.isEditable && !textControl) return [];
  const password = params.formControlType === "input-password";
  const enabled = {
    undo: params.isEditable && params.editFlags.canUndo,
    redo: params.isEditable && params.editFlags.canRedo,
    cut: params.isEditable && !password && params.editFlags.canCut,
    copy: !password && params.editFlags.canCopy,
    paste: params.isEditable && params.editFlags.canPaste,
    delete: params.isEditable && params.editFlags.canDelete,
    selectAll: params.editFlags.canSelectAll,
  };
  return editingMenu(labels).map(item => item.type === "separator" ? item : {
    ...item, enabled: enabled[item.role as keyof typeof enabled],
  });
}
