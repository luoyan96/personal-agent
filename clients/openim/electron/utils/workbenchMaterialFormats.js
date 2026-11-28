export const workbenchReferenceExtensions = new Set([
  ".bib", ".csv", ".docx", ".dotx", ".gif", ".jpg", ".jpeg", ".json", ".md", ".pdf", ".png",
  ".potx", ".pptx", ".tex", ".tsv", ".txt", ".webp", ".xlsx",
]);
export const workbenchReferenceMaxBytes = 25 * 1024 * 1024;
export const canUseInWorkbench = (path) =>
  workbenchReferenceExtensions.has(path.slice(path.lastIndexOf(".")).toLowerCase());
