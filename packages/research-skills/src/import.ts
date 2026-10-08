import { parse } from "yaml";

export type SkillFile = { path: string; text: string };
export type ImportedSkill = {
  name: string;
  description: string;
  release: string;
  instructions: string;
  references: SkillFile[];
  requirements: string[];
  scriptCount: number;
  assetCount: number;
};
export function safeSkillPath(value: string) {
  if (
    !value ||
    value.length > 400 ||
    /[\\\x00-\x1f:]/.test(value) ||
    value.startsWith("/") ||
    value.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new Error("技能包包含不安全的路径。");
  return value;
}
/** A package is data. Installing it never executes scripts or follows links. */
export function parseImportedSkill(
  files: SkillFile[],
  scriptCount = 0,
  assetCount = 0
): ImportedSkill {
  if (
    files.length > 300 ||
    new Set(files.map((f) => f.path.toLowerCase())).size !== files.length
  )
    throw new Error("技能文字文件过多或路径重复。");
  const decoder = new TextEncoder();
  let bytes = 0;
  for (const f of files) {
    safeSkillPath(f.path);
    bytes += decoder.encode(f.text).length;
    if (f.text.includes("\0")) throw new Error("技能文字不是有效文本。");
  }
  if (bytes > 900000)
    throw new Error("技能文字超过 900 KB；请拆分技能，不能静默截断。");
  const root = files.find((f) => f.path === "SKILL.md");
  if (!root || root.text.length > 120000)
    throw new Error("请选择包含 SKILL.md 的技能包。");
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(
    root.text
  );
  if (!match)
    throw new Error("SKILL.md 需要 name 和 description 的 YAML 开头。");
  const meta = parse(match[1]!, { maxAliasCount: 0 }) as Record<
    string,
    unknown
  >;
  if (
    !meta ||
    typeof meta.name !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(meta.name) ||
    typeof meta.description !== "string" ||
    !meta.description.trim() ||
    meta.description.length > 4000
  )
    throw new Error("技能名称或介绍不符合格式。");
  const instructions = match[2]!.trim(),
    requirements: string[] = [];
  if (!instructions) throw new Error("技能没有操作说明。");
  if (scriptCount) requirements.push("脚本执行");
  if (/image[_ -]?gen|IMAGE_GENERATE|image generation|生图/.test(instructions))
    requirements.push("图片生成与参考图输入");
  const release =
    typeof meta.version === "string"
      ? meta.version
      : instructions.match(/Version:\s*`?([\w.+-]+)/i)?.[1] ?? "未标注";
  return {
    name: meta.name,
    description: meta.description.trim(),
    release: release.slice(0, 100),
    instructions,
    references: files.filter((f) => f.path !== "SKILL.md"),
    requirements,
    scriptCount,
    assetCount,
  };
}
