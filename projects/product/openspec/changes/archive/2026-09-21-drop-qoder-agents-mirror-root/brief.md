## 背景与问题

`redesign-qoder-runtime-adapter` 合并进 dev（`8b436249`）并收敛后，正式自举工作空间执行 `buildr-self-bootstrap-sync` 收尾：`sync qoder` 与开发应用更新均通过，最终诊断 blocked 于 `runtime.qoder_stale`。现场核对（2026-09-21，dev @ `8b436249`，`~/Buildr`）：

- `runtime check qoder` 报 `ok=298 missing=30 stale=9 conflict=0`，`missing` 全部是从未写出的镜像根回执，`stale` 全部是 `codex` 已受管的 `.agents/skills/*/SKILL.md`。
- 逐字节对比同一技能：`.agents/skills/task-finish/SKILL.md`（codex 投射）内能力绑定 provider 路径为 `.agents/skills/task-manager/SKILL.md`，而 `.qoder/skills/task-finish/SKILL.md`（qoder 投射）为 `.qoder/skills/task-manager/SKILL.md`。同一 `.agents` 路径不可能同时是两者，`reconcile` 拒写是正确行为。
- 工作空间无任何覆盖写入，`git status` 干净；`.qoder/skills` 投射完好，Qoder 会话仍能发现全部技能。

## 目标与范围

`qoder` 的 Skills 投射收敛为单一 `.qoder` 根，并撤掉当前无人使用的镜像根机制（`mirrorRoots`、按根回执命名、回执 `runtimeRoot` 字段），使正式自举工作空间的 `doctor --agent qoder` 恢复 `ready`。范围限于 `projects/product/services/buildr` 的 Agent runtime 投射与本变更涉及的规范与当前知识。

## 约束

- 安装形态（Runtime Installation Surface）组合探测、`cli` 一等 surface、"形态缺席不降低 readiness"三条承诺保持不变。
- `.agents/skills` 继续作为 `qoder` 的共享**发现**根披露（宿主开关 `skills.loadFromAgentsDirectory`），但不得出现在写入 roots 与 `runtimeTargets` 中。
- 共享 `.agents` 根内"其他 adapter 的回执即归属证明"的清理规则保留。
- 不写入 `~/.qoder/skills`；不改 Rules 投射；其他 adapter 行为逐字节不变。

## 验收要点

- `runtime check qoder` 在正式自举工作空间 `missing=0 stale=0`，`doctor --agent qoder` 为 `ready`，自举收尾不再 blocked。
- `runtime list --json` 的 `qoder` 条目写入 roots 只含 `.qoder`，discovery 仍披露 `.agents` 共享根与其宿主开关。
- 单根 adapter（`codex`/`cursor`/`trae`/`claude-code`/`trae-work`/`workbuddy`）的投射文件与回执路径逐字节不变。

## 现有技术材料

`knowledge/code-map/skill-projection.md`、`knowledge/archify/flows/skill-projection.json`（含 HTML 与 visual-check 证据）、`knowledge/docs/architecture/buildr-skill-system.md`、`knowledge/docs/glossary.md` 的"Skill 投射所有权回执（Skill Projection Ownership Receipt）"与"安装形态（Runtime Installation Surface）"条目。上一变更的规范与知识表述由本变更回退，术语"安装形态"继续有效。
