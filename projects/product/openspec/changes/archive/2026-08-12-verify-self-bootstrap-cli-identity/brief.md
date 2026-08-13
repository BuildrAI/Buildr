# Self-bootstrap 默认 CLI 身份闭环

## 一句话摘要

让 Buildr 自举激活只有在用户默认 `buildr` 可证明绑定本次 retained checkout 且最终 Workspace Doctor ready 时成功。

## 背景与问题

现有 self-bootstrap runner 会安装 development CLI，但最终检查直接调用 retained checkout 的源码 CLI。它不能排除 PATH 被其他同名命令抢占、symlink 仍指向旧 checkout 或 launcher 入口链漂移，因此可能把“源码可运行”误报为“默认 CLI 已激活”。根与 Product `AGENTS.md` 还保留一套弱且重复的手工命令流程。

## 目标与非目标

目标是在唯一 runner 中增加默认 CLI identity gate，验证 PATH 命中、retained launcher、retained CLI entry 与 package/version，并让最终 Doctor 或 Finish resume 经过已验证入口。非目标是不改变通用 Task Finish、公共版本契约、SQLite authority、npm 用户安装或稳定版 Local App。

## 受影响用户或角色

主要影响维护 Buildr 自举 Workspace 的 Agent。普通用户 Workspace、通用 Task Finish consumer 与未安装 `buildr-self-bootstrap` Component 的 runtime 不获得新流程或依赖。

## 核心流程

runner 按冻结 Task Contribution 执行适用的 sync/安装动作后，只验证一次默认 CLI identity。验证通过时，complete 模式通过该入口运行最终 Doctor；doctor-blocked 模式通过该入口恢复同一 Finish run，由 resume 内 Doctor 形成唯一最终结论。

## 关键变化

- PATH 实际命中的 `buildr` 必须最终绑定本次 retained checkout 的 launcher。
- launcher 运行时报告实际 CLI entry 与 Node，runner 核对入口链。
- 默认入口执行 `version --json`，结果必须匹配 retained package/version。
- PATH shadowing、旧链接、链路漂移、版本不一致或启动失败均 fail closed。
- `AGENTS.md` 只保留结果约束，Skill 与 runner 独占正式流程。

## 影响、风险与兼容性

严格 gate 会让 PATH 未配置或仍命中旧 CLI 的激活从“表面成功”变成可诊断失败，这是预期兼容性收紧。Result 仅增加当前调用 evidence；没有数据迁移、新 store、Receipt、capability 或公共 CLI schema 变化。

## 验收摘要

隔离测试必须证明完整默认入口链、package/version 与最终 Doctor/resume 入口；负向 fixture 必须覆盖 PATH shadowing、旧 symlink、入口不匹配、版本不一致和启动失败，并证明失败后不继续 finalize。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/agent-task-workflows/spec.md`
- `specs/buildr-package-assets/spec.md`
- `tasks.md`
