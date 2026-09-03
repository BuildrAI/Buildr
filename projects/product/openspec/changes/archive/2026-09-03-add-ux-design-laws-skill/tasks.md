## 1. 内置技能内容

- [x] 1.1 将已审查候选稿整理到 `services/buildr/resources/workspace/skills/buildr/ux-design-laws/`，保留入口、Agent 元数据、法则索引和五个分组参考文件
- [x] 1.2 核对 30 个主题的中英文名称、官方来源、操作性卡片、渐进披露和非操纵性设计边界
- [x] 1.3 核对 `ux-design-laws` 与 `ui-prototype`、用户研究、无障碍检查和前端实现的触发及结果边界

## 2. Package 登记与验证

- [x] 2.1 在 `services/buildr/resources/manifest.yml` 登记 optional builtin、全部 runtimes 和完整 Workspace 文件映射，并保持 description 单一事实
- [x] 2.2 新增 `services/buildr/test/contract/ux-design-laws.test.mjs`，覆盖 manifest、完整目录、30 个主题、来源与职责边界
- [x] 2.3 运行 Skill validator、专项契约测试和受影响产品验证，修复所有与本变更有关的失败

## 3. 当前认知与 OpenSpec 收敛准备

- [x] 3.1 核对 Brief 与 `.buildr/knowledge-impact.yml`，确认 Project 概览、架构、Service 说明和 glossary 无额外真实影响
- [x] 3.2 运行 `openspec validate add-ux-design-laws-skill --strict` 与 Buildr convergence preflight，并处理全部语义诊断
