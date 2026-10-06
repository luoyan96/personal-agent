import type { AgentTurn, ChatMessage } from "@research-agent-platform/contracts";

type FileMetadata = NonNullable<ChatMessage["files"]>[number];

/** Only server extraction metadata and authorized selected ranges, never PDF text. */
export function AgentFileReadSummary({
  file,
  read,
}: {
  file?: FileMetadata;
  read?: AgentTurn["fileRead"];
}) {
  const metadata = file || read;
  if (!metadata) return null;
  const selected = !file || read?.messageId === file.messageId ? read : undefined;
  const pages = [...new Set(selected?.ranges.map((range) => range.pageNumber) || [])];
  return (
    <div className="min-w-0 text-xs leading-5 text-slate-600">
      <p className="truncate" title={metadata.filename}>{metadata.filename}</p>
      <p>可提取文字：{metadata.pageCount} 页 · {metadata.characterCount} 字符</p>
      {!!pages.length && (
        <details>
          <summary className="cursor-pointer">
            本次读取：第 {pages.join("、")} 页
          </summary>
          {selected?.partial && <p>本次未使用完整文件；回答依据列出的页码与范围。</p>}
          {selected?.ranges.map((range, index) => (
            <p key={index}>第 {range.pageNumber} 页：字符 {range.start}–{range.end}</p>
          ))}
        </details>
      )}
    </div>
  );
}
