export function validateImageSize(width: number, height: number) {
  if (!width || !height) throw new Error("图片无法读取，请使用 PNG/JPG 图片。");
  if (width * height > 30000000 || width > 40000 || height > 40000)
    throw new Error("图片尺寸过大，请裁剪或分批处理。");
}
export function imageTileOffsets(height: number) {
  const offsets: number[] = [];
  for (let top = 0; top < height; top += 2000) {
    offsets.push(top);
    if (top + 2200 >= height) break;
  }
  return offsets;
}
export type OcrLine = { text: string; x?: number; y: number; height: number };
export function orderedOcrLines(results: { lines: OcrLine[] }[], offsets: number[]) {
  if (results.length !== offsets.length) throw new Error("识别结果格式异常。");
  const lines: OcrLine[] = [];
  results.forEach((value, index) => {
    if (!Array.isArray(value.lines)) throw new Error("识别结果格式异常。");
    for (const line of value.lines) {
      if (
        typeof line.text !== "string" ||
        !Number.isFinite(line.y) ||
        !Number.isFinite(line.height) ||
        line.height < 0 ||
        (line.x !== undefined && !Number.isFinite(line.x))
      )
        throw new Error("识别结果格式异常。");
      const y = line.y + offsets[index];
      // Each overlap belongs to the tile with more surrounding pixels. A line
      // cropped at the top/bottom is never added beside the intact recognition
      // from its neighbour, even when OCR returns different text for the crop.
      const center = y + line.height / 2;
      const start = index
        ? (offsets[index] + offsets[index - 1] + 2200) / 2
        : -Infinity;
      const end =
        index + 1 < offsets.length
          ? (offsets[index + 1] + offsets[index] + 2200) / 2
          : Infinity;
      if (center < start || center >= end) continue;
      if (
        !lines.some(
          (previous) =>
            previous.text === line.text &&
            Math.abs(previous.y - y) < Math.max(8, line.height / 2),
        )
      )
        lines.push({ ...line, y });
    }
  });
  return lines.sort((a, b) => a.y - b.y || (a.x ?? 0) - (b.x ?? 0));
}
export function mergeOcrLines(
  results: { lines: OcrLine[] }[],
  offsets: number[],
  paragraphs = false,
) {
  const lines = orderedOcrLines(results, offsets);
  // Windows OCR separates Han tokens with spaces; keep Latin word spacing intact.
  return lines
    .map((line) =>
      line.text
        .replace(/(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff，。；：！？、])/g, "")
        .replace(/(?<=[，。；：！？、]) +(?=[\u3400-\u9fff])/g, ""),
    )
    .reduce((text, line, index) => {
      if (!index) return line;
      const previous = lines[index - 1],
        current = lines[index];
      const gap = current.y - previous.y - previous.height;
      const paragraph =
        paragraphs && gap > Math.max(previous.height, current.height) * 0.7;
      return text + (paragraph ? "\n\n" : "\n") + line;
    }, "");
}
