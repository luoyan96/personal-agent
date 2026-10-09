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
export type OcrLine = { text: string; y: number; height: number };
export function mergeOcrLines(results: { lines: OcrLine[] }[], offsets: number[]) {
  const lines: OcrLine[] = [];
  results.forEach((value, index) => {
    if (!Array.isArray(value.lines)) throw new Error("识别结果格式异常。");
    for (const line of value.lines) {
      if (
        typeof line.text !== "string" ||
        !Number.isFinite(line.y) ||
        !Number.isFinite(line.height)
      )
        throw new Error("识别结果格式异常。");
      const y = line.y + offsets[index];
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
  // Windows OCR separates Han tokens with spaces; keep Latin word spacing intact.
  return lines
    .sort((a, b) => a.y - b.y)
    .map((line) =>
      line.text
        .replace(/(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff，。；：！？、])/g, "")
        .replace(/(?<=[，。；：！？、]) +(?=[\u3400-\u9fff])/g, ""),
    )
    .join("\n");
}
