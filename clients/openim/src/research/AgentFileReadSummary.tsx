import type { AgentTurn, ChatMessage } from "@research-agent-platform/contracts";

type FileMetadata = NonNullable<ChatMessage["files"]>[number];

/** Count UTF-16 ranges once, even when a page has overlapping excerpts. */
export function agentFileReadCoverage(read: NonNullable<AgentTurn["fileRead"]>) {
  const ranges = read.ranges
    .filter((range) => range.pageNumber <= read.pageCount && range.end > range.start)
    .slice()
    .sort((a, b) => a.pageNumber - b.pageNumber || a.start - b.start);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous?.pageNumber === range.pageNumber && range.start <= previous.end)
      previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  const pages = [...new Set(merged.map((range) => range.pageNumber))];
  const characters = merged.reduce(
    (total, range) => total + range.end - range.start,
    0,
  );
  return {
    ranges: merged,
    pages,
    characters,
    complete: !read.partial && characters >= read.characterCount && characters > 0,
  };
}

/** Only server extraction metadata and authorized selected ranges, never PDF text. */
export function AgentFileReadSummary({
  file,
  read,
  status,
}: {
  file?: FileMetadata;
  read?: AgentTurn["fileRead"];
  status?: AgentTurn["status"];
}) {
  const metadata = file || read;
  if (!metadata) return null;
  const selected = !file || read?.messageId === file.messageId ? read : undefined;
  const coverage = selected ? agentFileReadCoverage(selected) : undefined;
  const hasRanges = !!coverage?.ranges.length;
  const succeeded = status === "succeeded";
  const pending = status === "queued" || status === "running";
  const unsuccessful = !!status && !succeeded && !pending;
  const headline =
    succeeded && hasRanges
      ? coverage?.complete
        ? `已使用附件全部可提取文字（共 ${metadata.pageCount} 页）`
        : "仅使用部分文字，未阅读全文"
      : pending
      ? status === "queued"
        ? "等待 Agent 阅读；尚未完成"
        : "Agent 正在处理附件；尚未完成"
      : unsuccessful
      ? "本次回复未完成；不能确认已阅读全文"
      : "本轮使用范围尚未确认";
  return (
    <details
      className="mt-3 min-w-0 break-words border-t border-slate-200/70 pt-2 text-xs leading-5 text-slate-600"
      data-agent-file-read-summary
    >
      <summary className="cursor-pointer select-none" title={metadata.filename}>
        <span
          className={`font-medium ${succeeded && hasRanges ? coverage?.complete ? "text-slate-600" : "text-amber-800" : "text-slate-700"}`}
          data-agent-file-coverage
        >{headline}</span>
        <span className="ml-2 text-slate-500">阅读详情</span>
      </summary>
      <p className="mt-2 break-all font-medium">{metadata.filename}</p>
      <p>附件可提取文字：{metadata.pageCount} 页 · {metadata.characterCount} 字符</p>
      {hasRanges && coverage && (
        <p>
          {succeeded ? "本次使用" : "已选取"}：第 {coverage.pages.join("、")} 页 ·{" "}
          {coverage.characters} / {metadata.characterCount} 字符
        </p>
      )}
      {hasRanges && coverage && (
        <div className="mt-1">
          {succeeded && !coverage.complete && (
            <p>本次未使用完整文件；回答依据以下片段，不代表通读每页。</p>
          )}
          {!succeeded && <p>以下为本轮选取的片段，不表示回复已完成。</p>}
          {coverage.ranges.map((range, index) => (
            <p key={index}>
              第 {range.pageNumber} 页：字符 {range.start}–{range.end}
            </p>
          ))}
          <p>范围以可提取文字的字符位置计；不包含扫描图片中的内容。</p>
        </div>
      )}
    </details>
  );
}
