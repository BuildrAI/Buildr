---
name: buildr-release
description: 准备、检查、发布或恢复 Buildr 主包、DSH 插件或联合版本时使用；按统一发布流程核对独立版本、共享源码选择、真实包兼容、逐包授权与恢复事实。
---

# Buildr 发布

本技能（Skill）拥有 Buildr 自举工作空间的发布流程与随附发布代码，不作为 npm 内置技能分发。先读唯一流程正文 `projects/product/knowledge/docs/flows/open-source-release.md`：固定候选、跑测试、打包、验包、发布。人决定目标和公开授权；智能体（Agent）按当前事实推进。

## 执行入口

发布代码的唯一源是所选源码检出位置的 `skills/buildr-release/scripts/`。从该位置的 `projects/product/services/buildr/` 使用 `tools/development/run-development-node ../../../../skills/buildr-release/scripts/release-orchestration-runner.ts --help` 查看当前参数，再调用 `prepare`、`inspect`、`publish --authorized` 或 `resume`。投射到智能体的技能副本用于发现和指引；不要从投射目录运行绑定源码的脚本。工作流（Workflow）也调用同一源码脚本。

冻结所选包、独立版本、分支（Branch）、准确提交（Commit）、源码树和准确对端，正常准备不跟随 `dev`。全部检查及结果汇总交给产品既有验证框架；先查看有效旧结果、缺项、失效原因和耗时，再只执行必要部分。本机能充分证明的在本机完成，GitHub 只补真实平台、干净环境或受保护执行边界。不要在检查运行时改变其源码或共享 Git 比较事实。

主包产包入口是 `scripts/candidate-package.ts`，插件发布代码在 `scripts/dsh-plugin/`；一般构建和验证工具仍归相应服务。每个包只生产一份准确原包，测试或汇总修复不默认重打；产品及真实构建输入变化才使相关原包和证明失效。正式补验绑定独立验证来源，不授予补验代码公开权限。

只准备到验包时使用 `prepare --stop-after candidate`：完整候选与原包检查通过后返回 `candidate-verified`，不进入 `main` 采用或公开；已有公开授权或请求的旧选择不能用于此模式。

将用户意图路由到正文对应入口：检查只读当前事实；准备停在公开发布之前；发布需有当前所选包准确版本与内容的授权；恢复保留已成立效果，仅继续未完成事项。已有授权在范围未变时继续有效，平台权限及必要审批仍须满足。

检查失败只补相关检查，汇总失败只恢复汇总，未知请求先回读；登记或清理失败保留已发生公开事实。完成时报告逐包结果、真实耗时、采用的旧结果和未验证边界。常规交付交给 `task-finish`；本机自举只交给 `buildr-self-bootstrap-sync` 的唯一执行器，不把旧注入替身或 pending 当成真实激活成功。
