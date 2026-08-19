# Finish 前对齐 retained 远端，Doctor 跟随 Environment 宿主

## 一句话摘要

Finish `preflight` 必须先确认 retained 已与目标远端对齐；Doctor 只使用 Environment 已绑定宿主，不得用当前聊天宿主覆盖。

## 背景与问题

retained 落后目标远端时，Finish 仍能创建 run，直到 `deliver` 才报 `retained-workspace-not-ready`，空转 prepare/verify。同时 Agent 常把当前聊天宿主写成 `--agent`，Doctor 检查错误宿主。产品省略 `--agent` 时已经回落到 Environment adapter，但契约与 Skill 没有锁死。

## 目标 / 非目标

- 目标：`preflight` 观察 retained 与远端可快进对齐，未对齐 fail closed 且零 delivery mutation；省略 `--agent` 使用 Environment adapter，传入必须一致；Skill 禁止用会话宿主覆盖。
- 非目标：Finish 内不自动 fetch/rebase；不把对齐失败做成新的 `entry_gaps`；不处理 GitHub 短超时探测或共享 Skill 回执。

## 受影响用户或角色

- 调用 `task finish run` 的 Agent 必须先对齐 retained，并跟随 Environment 宿主。
- 已写出与 Environment 一致 `--agent` 的脚本保持兼容。
- 跳过 Skill 直接调产品的调用方会在 preflight 被挡住，不再空转到 deliver。

## 核心流程

1. Skill 轻量确认贡献已提交、retained 已对齐、`--agent` 省略或等于 Environment adapter。
2. 产品入口聚合 Environment / Development / 交付可解析性；`--agent` 不一致则不创建 run。
3. `preflight` 只读观察远端 target ref；HEAD 必须等于该 ref。
4. 未对齐或远端不可达则 blocked，不创建 carrier。
5. 已对齐后 `deliver` 仍做精确 retained 收敛与 Environment 绑定的 Doctor。

## 关键变化

- preflight 增加 retained/远端对齐观察。
- Finish `--agent` 契约明确为 Environment adapter。
- Skill 示例不再暗示用聊天宿主调用 Finish。

## 影响 / 风险 / 兼容性

- 过去能通过 preflight、在 deliver 才失败的 behind retained，现在更早 blocked。
- Skill「明确继续」仍可调用产品，但产品不会跳过对齐。
- 远端暂不可达与现有 target 观察一样 fail closed。

## 验收摘要

- retained 已对齐：preflight 通过且无 Git mutation。
- behind / diverged / 远端不可达：preflight blocked，无 carrier/push。
- 省略 `--agent`：run agent 等于 Environment adapter。
- `--agent` 与 Environment 不一致：入口缺口，不创建 run。
- Skill 与帮助不再把 Finish `--agent` 写成聊天宿主或 Codex 默认值。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/`
- `tasks.md`
