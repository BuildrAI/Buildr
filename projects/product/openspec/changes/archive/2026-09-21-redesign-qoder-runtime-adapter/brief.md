## 背景与问题

本轮现场诊断（2026-09-21，dev @ `23cf8261`）暴露两处 Qoder 适配器与真实运行时的偏差：

- `.qoder/skills` 缺 `archify`、`code-map` 时，宿主 Qoder 会话仍然发现两者，说明桌面 App 从 `.agents/skills` 发现技能；官方文档只承诺 `.qoder/skills` 与 `~/.qoder/skills`。
- 适配器探测 PATH 上的 `qoder --version`，本机不存在该命令（`/usr/local/bin/qoder` 是指向已消失路径的失效链接），探测失败被判为需要用户行动，导致 `health.ready=false` 并阻塞正式自举激活，尽管投射本身已核对一致。

## 目标与范围

让 `qoder` 适配器按真实支持面声明能力：Skills 双根投射（`.agents/skills` + `.qoder/skills`）、安装形态覆盖桌面 App / Qoder IDE / Qoder CLI、探测平台适配且缺席不阻塞 readiness。范围限于 `projects/product/services/buildr` 的 Agent runtime 投射与诊断，以及本变更涉及的规范与当前知识。

## 约束

- Rules 投射与 `trigger` frontmatter 映射经核对正确，本次不改。
- 不写入 `~/.qoder/skills`（用户级由宿主与其他工具管理）。
- 不引入真实 Agent 会话加载证明，不把文件写入描述为已加载。
- 其他 runtime（`cursor`、`trae`、`trae-work`、`workbuddy`、`claude-code`、`codex`）的行为逐字节不变。

## 验收要点

- 投射一致而安装形态无法确认时，`doctor --agent qoder` 仍 `ready=true`；投射缺失、过期或冲突时仍 `ready=false`。
- `sync qoder` 后两个根都持有受管 Skill 与按根可核对的身份；失去 source 时两根各自精确清理。
- `runtime list --json` 暴露 `qoder` 的两个 Skills 根与多 surface 探测事实。

## 现有技术材料

`knowledge/code-map/skill-projection.md`（运行时根与 destination 表格）、`knowledge/archify/flows/skill-projection.json`（dataflow 图，含 runtime files 与 ownership 节点）、`knowledge/docs/architecture/buildr-skill-system.md`、`knowledge/docs/glossary.md` 的"Skill 投射所有权回执（Skill Projection Ownership Receipt）"条目。
