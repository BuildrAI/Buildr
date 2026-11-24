---
name: buildr-release
description: 准备、检查、发布或恢复 Buildr Development 主包版本时使用，默认候选版指公开 RC；也承接明确指定的 Harness、DSH 插件或联合发布，核对准确原包、授权与恢复事实。
---

# Buildr 发布

本技能只用于 Buildr 自举工作空间，不随 npm 包分发。先读唯一发布流程正文 `projects/product/knowledge/docs/flows/open-source-release.md`。人决定发布目标、验证范围及公开授权；智能体按现场事实推进。

## 先区分用户意图

- **检查**：只读核对具体版本、来源、原包和运行，不写入。
- **准备、验包、不公开**：验收并保全候选，不采用主线、不公开；明确只到验包时用 `prepare --stop-after candidate`。
- **发布 RC 或新候选版**：默认目标是公开发布 RC，不把内部候选准备报成完成。新的公开写入必须有准确目标、版本、内容及授权，并满足平台审批与原包分发证据。
- **恢复**：核对现存选择与已发生效果，沿用范围未变的授权，只补缺失阶段。上传结果未知只回读，不重发、不重制包。

默认是 **Buildr Development**（`@buildr-ai/buildr`，目标 `buildr`），主包包含所需 Harness，不等于独立发布 Harness。仅在明确指定时处理 DSH 插件或联合发布；独立 Harness 与其 DSH 插件必须显式选择专属目标，不沿用旧插件选择。分发许可和支持平台以准确原包证据为准，不以替身、源码声明或另一平台结果代替。

## 独立 Harness 首发与更新

独立目标为 `harness`（`@buildr-ai/buildr-harness`）和 `dsh-buildr-harness`（`@buildr-ai/dsh-buildr-harness`）。从规范检出的仓库根以项目 Node 运行 `node skills/buildr-release/scripts/harness-release.ts --help`，按[独立目标流程](../../projects/product/knowledge/docs/flows/open-source-release.md#独立-harness-与-dsh-buildr-harness)准备/读取原包、验包、交接和受保护公开。未提交实现的本机 `--rehearsal` 永不进入公开。两个目标分别验收和记录，不要求 Development 跟发。`readback` 不发起 npm 上传；公开边界与发布环境审批保持独立。

## 日常执行顺序

1. **固定候选**：以冻结检出为准，核对包、版本、分支、提交、比较基线和准确对端。不跟随移动中的 `dev`；日常受影响检查先做，不等发布。冻结后源码变化须重新核对身份和证明，不能覆盖原证据。
2. **本机检查、制包、验包**：新主包用 `buildr.local-package/v1`。采用同轮仍适用的源码证明，独立失败收齐后再修复；补失败、未执行或实际失效项。不在验证中改源码。只制一份原包，做通用及本机系统验收；本机验包用实际 Node `24.15.0`。插件或联合候选由插件入口在本机准备准确 SDK 并验收。缓存不能代替检查。
3. **保全而不重建**：新主包由 GitHub 校验保全同一原包和证明，不在远端重建或补跑重型验包。另一系统为可选独立冒烟，未执行如实记 `not-verified`。正式消费预演或保全失败只修对应环节；保留原包和已有效证据。
4. **获准公开后核对收尾**：公开同一已验原包，回读官方包、对应 GitHub 发布和逐包结果。检查失败只补检查，汇总失败只补汇总，登记或清理失败不撤销已确认公开事实。保留过程报告，不为补齐报告重跑；本机开发应用激活是另一项工作。

## 入口与按需参考

从已核对的产品检出 `projects/product/services/buildr/` 执行：

```sh
tools/development/run-development-node ../../../../skills/buildr-release/scripts/release-orchestration-runner.ts --help
```

按目标选 `prepare`、`inspect`、`publish --authorized` 或 `resume`；正常准备/接续使用 `--wait` 观察同一运行，不手写轮询，不从投射副本执行发布脚本。取消本机等待不等于取消远端运行；结果未知先回读。

- [既有候选接续与故障恢复](references/candidate-recovery.md)：排队、未知上传、联合发布接续，及只适用于旧远端制包模型的下载补验。新候选不走旧路径。
- [发布专项操作与证据](references/release-operations.md)：原包分发证据、消费预演、撤回、可选对端冒烟、环境审批、报告和验包收尾。
