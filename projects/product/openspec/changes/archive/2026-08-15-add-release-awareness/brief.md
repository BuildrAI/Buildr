# 新增 GA/RC 版本发布感知

## 一句话摘要

Buildr 同时感知 GA 正式版与 RC 候选版更新，通过 CLI、Doctor、Buildr Web 和 Agent 告知用户，并由用户明确选择本地更新到哪个版本。

## 背景与问题

当前 `buildr update check` 只返回一个可用版本，无法同时说明正式版和候选版的发布状态，也无法让 Doctor、Buildr Web 与 Agent 复用同一结果。用户因此可能不知道 GA 已发布，或把历史 RC 误认为正式版。

## 目标与非目标

目标是建立一个统一的版本发布感知 Application：一次读取 npm 的 `latest` 与 `next`，分别解释为 GA 正式版与 RC 候选版，并向四个只读通知入口提供同一结构化结果；`buildr update --track stable|candidate` 只在用户明确执行后更新机器上的 npm Buildr。非目标是不改变 Workspace 配置、Workspace Node、Agent runtime 或 npm Registry 配置，不自动更新、切换版本轨道或降级，也不让网页直接执行 npm 更新。

## 受影响用户或角色

- npm 安装 Buildr 的用户：同时看到 GA 与 RC 的可用状态，并自行决定更新目标。
- 使用 Buildr Web 的用户：在全局顶部看到简短提示，可复制命令或交给 Agent。
- 使用 Buildr Skill 的 Agent：完整检查时读取结构化结果并主动解释可选更新。
- Buildr 发布维护者：候选版与正式版发布后回读两个 npm tag，防止错误推进。

## 核心流程

Release Awareness 使用现有 npm 更新执行环境读取 `dist-tags.latest` 和 `dist-tags.next`，校验 `latest` 必须是正式 semver、`next` 必须是 prerelease，并形成 stable/candidate 两条独立状态。CLI、Doctor、Buildr Web 与 Skill 只投影这份结果；用户选择后显式运行相应 `buildr update --track ...` 命令。

## 关键变化

- `buildr update check` 同时展示当前版本、GA 正式版和 RC 候选版。
- `buildr update check --json` 返回 `buildr.update-check/v2` 双轨道结果。
- `buildr update --track stable|candidate` 更新到所选轨道当前观察到的精确版本；无参数时只按当前安装版本类型保持兼容默认。
- Doctor 增加不影响 readiness 的版本发布提示；Registry 不可达不会让 Doctor 失败。
- Buildr Web 增加全局只读提示和“交给 Agent”/复制命令，不直接执行更新。
- 用户级 Buildr Data Root 只记录每个轨道的已感知、已通知版本与检查时间，避免重复打扰。
- 发布流程在候选版或正式版发布前后都回读两个 tag，并保证只推进目标 tag。

## 影响、风险与兼容性

`buildr update check --json` 与 npm 更新结果升级为 v2，旧单一 `available.version` consumer 需要同步升级。网络、Registry 或 tag 配置异常只产生不可安装状态和通知，不改变 Workspace health。正式版用户不会自动进入候选版，任何轨道切换或更新都需要用户动作。

## 验收摘要

测试必须覆盖 GA/RC 同时可用、尚无 GA、`latest` 错指 prerelease、`next` 错指正式版、网络不可达、默认轨道兼容、显式切换、禁止降级、Doctor 非阻断、Web 全局提示、Agent 说明以及发布 tag 回读与不变性。

## 技术 Artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [delta specs](specs/)
