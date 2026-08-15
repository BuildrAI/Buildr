## 1. Compact Application 与路由

- [x] 1.1 将 Task Development 下一动作重构为 typed projection，并由同一 projection 保留 legacy `nextActions`
- [x] 1.2 实现只组合 Task、Environment、Development owner 的 Task Entry Snapshot Application
- [x] 1.3 实现当前动作的单一 capability contract/provider identity 投影与 cross-Project fail-closed 路由
- [x] 1.4 增加 retained writer route、显式 execution target 核验与 opt-in response-only profile

## 2. CLI 与公开契约

- [x] 2.1 登记 `buildr task next <task-id> --json`、help 与 `buildr.task-entry-snapshot/v1`
- [x] 2.2 增加 public JSON closed-schema、关键字段与 checkout/package parity guards

## 3. Agent-facing assets

- [x] 3.1 更新 task-triage、task-development 与 Buildr 产品入口的 action-local startup/continue guidance
- [x] 3.2 更新 CLI reference、Buildr Service current knowledge 与 package asset parity

## 4. Focused verification

- [x] 4.1 覆盖无 Environment、ready Environment 无 Development、current Development 与后续 capability 按需出现
- [x] 4.2 覆盖 stale identity、candidate writer、execution target mismatch、profile isolation 与零写入
- [x] 4.3 运行最低成本 focused regression、兼容 canary、OpenSpec strict 与 package static
