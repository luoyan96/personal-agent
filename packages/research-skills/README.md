# 科研 Skills 加载

`loadResearchSkills()` 返回打包的完整方法正文、名称、描述和本地参考目录。它不依赖 Harness，也不执行科研任务。

唯一编辑来源是 [agents/skills](../../agents/skills)。构建将该目录复制到 `dist/skills`；参考文件随包保留，插件可按实际运行环境注册能力。

```ts
import { loadResearchSkills } from '@research-agent-platform/research-skills'

for (const skill of loadResearchSkills()) {
  console.log(skill.name, skill.directory)
}
```

从仓库根目录运行 `pnpm run ci`，验证源文件与打包内容一致、参考文件存在。内容能正确打包不意味着执行工具已提供或科研质量已通过评测。

## 私人包的自报版本

`parseImportedSkill()` 按 `version` → `metadata.version` → 正文既有 `Version:` 标记的顺序读取发行标签；未声明时返回“未标注”。保留有限数字的 YAML 原写法，例如 `2.10` 不转换成 `2.1`。非标量、布尔值、非有限数字、控制字符或超过100字符的标签报错，不截断后当作有效版本。

标签来自包内容，不代表发布者身份、来源真实性或执行能力已核验。服务器的修订号、权限代数、包摘要和固定Git提交是各自独立的标识。只影响新导入/更新：历史数据库包、摘要、本机原件和修订不自动重算；原来“未标注”的包需明确更新为新修订，回退仍显示旧标签。控制说明、参考文字和依赖提示保持原样，安装不运行脚本。

## 导入文字的边界

正文与每份参考文字均按既有 API 的字符串长度限制校验：最多120,000字符。`SKILL.md` 的 YAML 元数据不占正文字符预算，但仍计入全包900KB文字预算；原生导入继续限制单份文字400KB。`references/` 内的普通参考和包内明确链接的模板使用同一校验，超限、空字符或原生UTF-8解码失败时指出原路径，拒绝导入，不截断后保存。代码中的字符计数与API一致，不等于token数量；能安装不保证全部内容同时放入聊天预算。

这项修复需要桌面与API使用同版解析器；本地检查、合成调用和待发布状态见[文字导入边界记录](../../docs/development/skill-import-text-limits.md)。不会重算已安装包、更新历史修订或扩展私有/团队/公共权限。
