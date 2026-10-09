export type OcrTextMode = "continuous" | "paragraphs" | "raw";

/** Only repairs layout. Never guesses names, numbers, missing words or facts. */
export function normalizeOcrSpacing(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\u00a0\u3000]+/g, " ")
    .replace(/ +/g, " ")
    .replace(
      /(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fffA-Za-z0-9，。；：！？、…（）【】［］《》“”‘’])/g,
      "",
    )
    .replace(/(?<=[A-Za-z0-9%‰℃°，。；：！？、（【［《“‘]) +(?=[\u3400-\u9fff])/g, "")
    .replace(/(?<=[\u3400-\u9fff]) +(?=[“‘"'])/g, "")
    .replace(/(?<=[“‘"']) +(?=[\u3400-\u9fff0-9])/g, "")
    .replace(/(?<=[\u3400-\u9fff]) +(?=[”’"'])/g, "")
    .replace(/(?<=[”’"']) +(?=[\u3400-\u9fff])/g, "")
    .replace(/(?<=\d) +(?=[%‰℃°])/g, "")
    .trim();
}

function joinLines(lines: string[]) {
  return lines.reduce((text, line) => {
    if (!text) return line;
    // Chinese wraps have no intervening spaces. English words keep their
    // boundary, while a printed hyphen remains a hyphen, never an invented word.
    const separator =
      /[A-Za-z0-9]["')\]]?$/.test(text) && /^[A-Za-z0-9]/.test(line) ? " " : "";
    return text + separator + line;
  }, "");
}

export function formatOcrText(text: string, mode: OcrTextMode) {
  if (mode === "raw") return text;
  const paragraphs = normalizeOcrSpacing(text)
    .split(/\n\s*\n/)
    .map((part) =>
      joinLines(
        part
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    )
    .filter(Boolean);
  return mode === "continuous" ? joinLines(paragraphs) : paragraphs.join("\n\n");
}
