# 私人 Skill 文字导入边界（2026-10-17）

## 修复的问题

本轮 `acceptcat-2` 在 `fix/skill-import-text-limits` 接续 `a6f877e` / PR49。普通 `references/` 只限制400KB字节数，链接模板另有限制120,000字符；因此120,001个英文或中文字符可能通过普通参考的本机预览，却在保存API处失败。另一个边界是解析器把整个 `SKILL.md` 的长度当作正文长度，允许的120,000字符正文加上YAML后会误报“请选择包含 SKILL.md 的技能包”。六个回归用例在旧代码全部失败，复现日志保留。

共享解析器新增同一文字校验，普通参考、链接模板和解析后的正文均遵循既有API的120,000字符上限；YAML仍计入900KB总文字预算。原生导入两条参考路径都调用它，并对400KB和UTF-8失败指出具体文件。超限/空字符/损坏编码拒绝，不截断、不替换编码后当作原文。字符串长度与API一致，不是token预算；较大中文文件虽然能安装，调用时仍可能超过128,000输入预算，需要少选参考或拆分方法。

文件选择范围、链接跟随范围、脚本/素材计数、依赖提示与执行模式不变。`agents/skills` 仍是十项内置技能正文的唯一来源，没有复制或改写其正文。已安装版本、旧digest和授权不自动改变，未打开脚本、绘图、检索或额外知识库访问。

## 实际检查

证据在Git外 `D:/deepseek-agent/.runtime/skill-import-limits-20261017`：

- `baseline.log` 是测试夹具首次错误：该包没有声明contracts依赖，改为测试相对导入已构建契约。`baseline-reproduced.log` 随后记录旧实现六项全部失败；没有把夹具错误当产品复现。
- `focused.log`：修复后解析器/版本/API原回归共33项通过。
- `root-ci.log`：`pnpm run ci` 通过，54文件/675项、生产CLI/HTTP两项、B0进程及生产隔离通过。这一全套在补充下述一个API边界用例前结束，不冒称跑过676项全套。
- `api-limit-final.log`：最终API定向14项通过，包含新增真实HTTP/SQLite/ChatWorker边界。120,000字符正文保存/修订/读取、回退不改旧行；120,000字符参考完整进入合成模型，未选文字不进入提示，成功调用记录落库，跨账号源码404；120,001字符请求400且没有新增Skill。首轮夹具尾标记长度算错的失败另存 `api-limit-fixture-first.log`。
- `native-final.log`：原生导入、素材存储与桥接共11项通过，含文件夹/ZIP、普通/链接两路径、中文/英文、准确上限、损坏UTF-8、400KB/900KB边界与原ZIP字节、取消/页面切换授权、原固定绘图包所有原件往返。
- `upstream-proof.json`：已核对固定来源的peer-review、hypothesis-generation、scientific-problem-selection三包再次实际导入，分别25/28/13份原件、14/18/9份可选参考。完整package、manifest、packageDigest、所有原件和原ZIP逐字节与前次证据一致；本机存储往返与其他账号拒绝通过。仅复用已核对公开包，不重新获取HEAD或执行包内脚本。
- 客户端 `tsc --noEmit` 通过。原生项目直接 `tsc --noEmit -p tsconfig.node.json` 遇到已有imageClipboard类型不在composite include中的TS6307；原日志保留，未改无关配置，关闭composite模式的独立原生类型检查通过（`native-types-targeted.log`）。

上述只证明导入、存储、版本与调用链路，模型是合成夹具，不是科研效果、真实供应商或用户账号验收。本轮没有界面结构改动，未重复浏览器全套。

## 发布边界和后续

本轮交付[草稿PR50](https://github.com/luoyan96/personal-agent/pull/50)与验证，源码db87e7906db719688f1f8837b91204617a7da28f，未合入main，不生成新安装版本、不部署或重启API/worker、不迁移数据库、不发布公共Release。安装端与服务端共用解析器，**正文恰好达到上限的修复必须前后端配套发布**；只换桌面不能证明线上服务接受该边界。下一次配套版本应一起纳入，并验证真实打包解析器和生产服务，不能把本地通过当作用户现装版本已修复。本批远端38930884416已经开始，最后记录为in_progress，尚未计为三平台全部通过。

此前交付Windows0.10.6和线上47c42ac / contract0.25 / chat1.12 / schema022的记录仍见 `docs/current-state.md`，本轮没有重新inspect服务器镜像或读取用户资料。公共目录、团队资料与私人Skill权限保持原边界；无需为本批触发远端备份或脚本执行。

协调补记：已读GitHub实际回执，前批任务下载source CI `38771771667` 三平台全部成功；目录 `38776266627` 当前回执为两Linux成功、Windows失败，保留为未全通过，不反复重跑或调整生产时限。本批CI与该历史来源分别记录。
