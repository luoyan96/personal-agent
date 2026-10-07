import { memo, useMemo, type ReactNode } from "react";
import "./SafeMessageMarkdown.scss";

const safeLink = (href: string) => {
  try {
    const url = new URL(href);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
};

/** A small Markdown renderer: React escapes all source text; HTML is never executed. */
function inline(text: string, depth = 0): ReactNode {
  if (depth > 3) return text;
  const token = /\\([\\`*_[\]{}()#+.!>|-])|`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const nodes: ReactNode[] = []; let offset = 0; let match: RegExpExecArray | null;
  while ((match = token.exec(text))) {
    const image = !!match[7] && match.index > offset && text[match.index - 1] === "!";
    if (match.index > offset) nodes.push(text.slice(offset, image ? match.index - 1 : match.index));
    const key = match.index;
    if (match[1]) nodes.push(match[1]);
    else if (match[2]) nodes.push(<code key={key}>{match[2]}</code>);
    else if (match[3] || match[4]) nodes.push(<strong key={key}>{inline(match[3] || match[4], depth + 1)}</strong>);
    else if (match[5] || match[6]) nodes.push(<em key={key}>{inline(match[5] || match[6], depth + 1)}</em>);
    else {
      const href = safeLink(match[8]);
      // A leading ! is image syntax. Keep its description, without loading an image.
      nodes.push(href && !image ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{inline(match[7], depth + 1)}</a> : match[7]);
    }
    offset = token.lastIndex;
  }
  if (offset < text.length) nodes.push(text.slice(offset));
  return nodes;
}
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
const tableDivider = (line: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
const listLine = (line: string) => line.match(/^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/);
const special = (line: string) => /^\s{0,3}(#{1,6}\s|```|~~~|>\s?|([-+*]|\d+[.)])\s|([-*_])\3\3)/.test(line);

function blocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n"), result: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index], key = index;
    if (!line.trim()) { index++; continue; }
    const fence = line.match(/^\s{0,3}(```|~~~)([^\s]*)\s*$/);
    if (fence) {
      const content: string[] = []; index++;
      while (index < lines.length && !lines[index].trim().startsWith(fence[1])) content.push(lines[index++]);
      if (index < lines.length) index++;
      result.push(<pre key={key} aria-label={fence[2] ? `${fence[2]}代码` : "代码"}><code>{content.join("\n")}</code></pre>); continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) { result.push(<div key={key} className={`message-heading message-heading-${Math.min(heading[1].length, 3)}`} role="heading" aria-level={heading[1].length}>{inline(heading[2].replace(/\s+#+\s*$/, ""))}</div>); index++; continue; }
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) { result.push(<hr key={key} />); index++; continue; }
    if (line.includes("|") && index + 1 < lines.length && tableDivider(lines[index + 1])) {
      const headers = cells(line); index += 2; const rows: string[][] = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) rows.push(cells(lines[index++]));
      result.push(<div key={key} className="message-table"><table><thead><tr>{headers.map((header, col) => <th key={col}>{inline(header)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, col) => <td key={col}>{inline(row[col] || "")}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      const content: string[] = [];
      while (index < lines.length && /^\s{0,3}>/.test(lines[index])) content.push(lines[index++].replace(/^\s{0,3}>\s?/, ""));
      result.push(<blockquote key={key}>{inline(content.join("\n"))}</blockquote>); continue;
    }
    const first = listLine(line);
    if (first) {
      const ordered = /^\d/.test(first[1]), items: ReactNode[] = [];
      while (index < lines.length) {
        const entry = listLine(lines[index]);
        if (!entry || /^\d/.test(entry[1]) !== ordered) break;
        items.push(<li key={index++}>{inline(entry[2])}</li>);
      }
      result.push(ordered ? <ol key={key} start={Number.parseInt(first[1], 10)}>{items}</ol> : <ul key={key}>{items}</ul>); continue;
    }
    const content = [line]; index++;
    while (index < lines.length && lines[index].trim() && !special(lines[index]) && !(lines[index].includes("|") && tableDivider(lines[index + 1] || ""))) content.push(lines[index++]);
    result.push(<p key={key}>{inline(content.join("\n"))}</p>);
  }
  return result;
}

function SafeMessageMarkdown({ text, className = "" }: { text: string; className?: string }) {
  const content = useMemo(() => blocks(text), [text]);
  return <div className={`safe-message-markdown ${className}`}>{content}</div>;
}
export default memo(SafeMessageMarkdown);
