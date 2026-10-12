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
