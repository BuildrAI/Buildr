# Change: dsh-sidebar-order-and-dual-restart

## Why
1. 当前在 DeepSeek Harness（DSH）桌面端左侧导航栏中，`插件` 的排序值为 `0`，`自动化任务` 的排序值为 `10`；而 `Buildr Harness` 使用 `ORDER = 10`、`Buildr Development` 使用 `ORDER = 11`，导致两个 Buildr 入口被 `自动化任务` 隔开。将二者紧挨并排放在 `插件` 下方、`自动化任务` 上方，可提升常用工作台入口的可达性与一致性。
2. 当同一交付同时修改两个 Buildr DSH 开发插件且用户以 `--restart-dsh true` 请求重启 DSH 时，当前自举脚本 `dsh-development-plugin.mjs` 按插件逐一执行“退出 DSH → 卸载旧包 → 安装新包 → 重开 DSH”，不仅会触发两次重开，而且第一个插件重开 DSH 后第二个插件在已运行状态下会被阻断为 `pending`。需要将其改为多插件单次重启编排。

## What Changes
- **侧栏顺序调整**：
  - `projects/product/services/buildr-harness-dsh-plugin/src/channel.ts`：`ORDER` 由 `10` 调整为 `released ? 4 : 5`（正式 `4`、开发 `5`）。
  - `projects/product/services/buildr-development-dsh-plugin/src/channel.ts`：`ORDER` 由 `11` 调整为 `released ? 6 : 7`（正式 `6`、开发 `7`）。
  - 两者均严格落在 `(0, 10)` 区间内，实现 `插件 (0)` → `Buildr Harness (4/5)` → `Buildr Development (6/7)` → `自动化任务 (10)` 的紧凑相邻排序。
- **双插件单次重启编排**：
  - 升级 `skills/buildr-self-bootstrap-sync/scripts/dsh-development-plugin.mjs`，拆分为批量准备与校验、单次请求 DSH 退出（支持按宿主连续性锚点确认）、退出态顺序卸载旧包并安装所有待更新插件、以及全部成功安装后的单次重开与回执校验四个阶段。
  - 更新 `skills/buildr-self-bootstrap-sync/SKILL.md` 说明及 `components/workspace/buildr-self-bootstrap/component.yml` 版本与完整性摘要。
- **测试与验收文档更新**：
  - 在 `projects/product/services/buildr-harness-dsh-plugin/test/panel-switching.test.ts` 增加侧栏顺序断言，验证两插件排序值严格在 `(0, 10)` 之间且 Harness 排在 Development 之前。
  - 更新 `projects/product/services/buildr-development-dsh-plugin/test/desktop-acceptance.md` 中的侧栏顺序描述。
  - 在 `projects/product/services/buildr/test/integration/self-bootstrap-closeout.test.ts` 增加双插件同时命中且 `restartDsh: true`、带旧包名迁移的单次重启集成测试。

## Impact
- 仅影响两个 DSH 插件的 `ORDER` 导出值、`buildr-self-bootstrap-sync` 技能脚本及其自举组件元数据、OpenSpec 规范及对应测试，不改变插件通信协议、包名、`main.conversation` 优先级、Web 运行时或发布配置。
