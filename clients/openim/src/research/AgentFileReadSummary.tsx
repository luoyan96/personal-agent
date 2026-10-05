import type { AgentTurn, ChatMessage } from "@research-agent-platform/contracts";

type FileMetadata = NonNullable<ChatMessage["files"]>[number];

/** Only server extraction metadata and authorized selected ranges, never PDF text. */
export function AgentFileReadSummary({
  file,
  read,
}: {
  file: FileMetadata;
  read?: AgentTurn["fileRead"];
}) {
  const selected = read?.messageId === file.messageId ? read : undefined;
  const pages = [...new Set(selected?.ranges.map((range) => range.pageNumber) || [])];
  return (
    <div className="min-w-0 text-xs leading-5 text-slate-600">
      <p className="truncate" title={file.filename}>{file.filename}</p>
      <p>可提取文字：{file.pageCount} 页 · {file.characterCount} 字符</p>
      {!!pages.length && (
        <details>
          <summary className="cursor-pointer">
            本次读取：第 {pages.join("、")} 页{selected?.partial ? "的文字片段" : ""}
          </summary>
          {selected?.partial && <p>受本次上下文预算限制，未使用完整文件；可继续询问具体页码。</p>}
          {selected?.ranges.map((range, index) => (
            <p key={index}>第 {range.pageNumber} 页：字符 {range.start}–{range.end}</p>
          ))}
        </details>
      )}
    </div>
  );
}
