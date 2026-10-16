import { isScalar, parseDocument } from "yaml";

export type SkillFile = { path: string; text: string };
export type SkillBundleFile = {
  path: string;
  category: "instruction" | "reference" | "script" | "asset" | "other";
  mediaType: string;
  size: number;
  sha256: string;
};
export type SkillBundleManifest = {
  format: 1;
  bundleDigest: string;
  packageDigest: string;
  files: SkillBundleFile[];
  totalBytes: number;
  originalZip?: { size: number; sha256: string };
};
export type SkillBundleLocator = {
  accountKey: string;
  skillId: string;
  revision: number;
  digest: string;
};
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
// Match the existing instructions/reference limit in the SkillPackage API.
// YAML front matter is metadata, not part of the instruction character budget.
export function validateImportedSkillText(path: string, text: string) {
  if (text.includes("\0"))
    throw new Error(`技能文字文件“${path}”包含空字符，不是有效文本。`);
  if (text.length > 120000)
    throw new Error(
      `技能文字文件“${path}”超过 120,000 字符，未截断导入，请先拆分文件。`
    );
}
export function safeSkillPath(value: string) {
  if (
    !value ||
    value.length > 400 ||
    /[\\\x00-\x1f:]/.test(value) ||
    value.startsWith("/") ||
    value
      .split("/")
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          /[. ]$/.test(p) ||
          /[<>"|?*]/.test(p) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)
      )
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
    new Set(files.map((f) => f.path.normalize("NFC").toLowerCase())).size !==
      files.length
  )
    throw new Error("技能文字文件过多或路径重复。");
  const decoder = new TextEncoder();
  let bytes = 0;
  for (const f of files) {
    safeSkillPath(f.path);
    bytes += decoder.encode(f.text).length;
    if (f.path === "SKILL.md") {
      if (f.text.includes("\0"))
        throw new Error("技能文字文件“SKILL.md”包含空字符，不是有效文本。");
    } else validateImportedSkillText(f.path, f.text);
  }
  if (bytes > 900000)
    throw new Error("技能文字超过 900 KB；请拆分技能，不能静默截断。");
  const root = files.find((f) => f.path === "SKILL.md");
  if (!root)
    throw new Error("请选择包含 SKILL.md 的技能包。");
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(
    root.text
  );
  if (!match)
    throw new Error("SKILL.md 需要 name 和 description 的 YAML 开头。");
  const document = parseDocument(match[1]!);
  if (document.errors.length) throw new Error("技能 YAML 格式无效。");
  const meta = document.toJS({ maxAliasCount: 0 }) as Record<
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
  validateImportedSkillText("SKILL.md", instructions);
  if (scriptCount) requirements.push("脚本执行");
  if (/image[_ -]?gen|IMAGE_GENERATE|image generation|生图/.test(instructions))
    requirements.push("图片生成与参考图输入");
  // Root version wins over nested metadata. Preserve numeric scalar spelling
  // (e.g. 2.10), rather than using JS's lossy numeric string conversion.
  let release: string | undefined;
  for (const path of [["version"], ["metadata", "version"]]) {
    const node = document.getIn(path, true);
    if (node === undefined || (isScalar(node) && node.value === null)) continue;
    if (!isScalar(node) || !["string", "number"].includes(typeof node.value) ||
      (typeof node.value === "number" && !Number.isFinite(node.value)))
      throw new Error("技能版本需要是文字或有限数字。");
    release = typeof node.value === "number" ? node.source : node.value as string;
    break;
  }
  release ??= instructions.match(/Version:\s*`?([\w.+-]+)/i)?.[1] ?? "未标注";
  if (release.length > 100 || /[\x00-\x1f\x7f]/.test(release))
    throw new Error("技能版本超过 100 字符或包含控制字符，未截断导入。");
  return {
    name: meta.name,
    description: meta.description.trim(),
    release,
    instructions,
    references: files.filter((f) => f.path !== "SKILL.md"),
    requirements,
    scriptCount,
    assetCount,
  };
}
