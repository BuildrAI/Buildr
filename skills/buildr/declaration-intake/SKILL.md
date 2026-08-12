---
name: declaration-intake
description: 用户要求初始化、刷新或审查 Project 的环境准备与任务验证声明，或 Project/Service 注册、首次 Task scope、Environment 缺口、Verification coverage gap、构建/依赖/测试入口变化触发声明检查时使用；只读发现 preparation.yml 与 verification.yml 候选，长期写入必须经用户确认并交给各声明 owner Skill。
---

# Declaration Intake Skill

本 Skill 是 Project Declaration Intake 的 Agent 编排入口。它只管理两类 Project-owned 长期声明：

- `projects/<project>/preparation.yml`：怎么准备 Task Environment；
- `projects/<project>/verification.yml`：怎么验证 Task 交付目标。

Intake 不保存状态、不拥有 schema 或 writer，也不管理 `capabilities.yml`、`commands.yml`。缺少 Skill/provider 时交给 Capability 体系；缺少 CLI/runtime 时只报告 Commands/Doctor 诊断。

## 1. 确认触发与范围

识别 trigger：Project 注册、Service 注册、首次 Task scope、依赖/构建/测试入口变化、Environment declaration/Recipe gap、Verification coverage gap，或用户显式初始化/刷新。

只使用已登记 Project 和本次明确 Project/Service scope。Project-only 不虚构 Service；多 Service 分别列出事实与候选，不复制其他 Service 的结论。不得递归扫描整个仓库、按目录名猜技术栈，或读取 Task lifecycle/current projection 作为声明来源。

## 2. 只读 Discovery

读取以下最小事实：

- Project/Service registry、各 scope 的真实根与适用规则；
- 当前 `preparation.yml`、`verification.yml` 和所属 schema；
- 明确的 package/build/test wrapper、lockfile或配置、CI与项目文档；
- 当前 Commands/Capability readiness，仅用于外部依赖诊断。

对每个 scope 输出：trigger、当前声明状态、Preparation Recipe 候选/差异、Verification Capability 候选/差异、证据、外部缺口和建议写入。没有稳定事实时标记 gap，不创建技术栈 adapter、测试、wrapper 或工具安装方案。

Discovery、Project/Service 注册、Local App GET、Doctor、Environment `inspect` 与 Task Finish 均不得创建、修改或删除长期声明。

## 3. 取得长期写入授权

写入前向用户展示：

- 精确目标文件；
- 新增、修改或删除的 Recipe/Capability identity 与 scope；
- 关键 invocation、inputs/outputs、environment/effects 差异；
- 尚未解决的 Commands/Capability 或测试建设缺口。

用户没有确认时，只报告当前缺口与候选。不得把“触发检查”理解为写入授权，也不得用一次宽泛确认覆盖两个文件或新增 scope。

## 4. 交给声明 owner

用户确认具体变更后：

- Preparation 交给 `task-environment` Skill，使用其 schema、模板和 Doctor 校验；
- Verification 交给 `task-verification` Skill，使用其 schema、模板和 Doctor 校验。

Intake 不直接编辑声明，不合并两个 writer。owner 完成后运行适用 Doctor，并再次只读确认文件、scope 和 identity。声明变化只会让各专业 Task snapshot/Result 按自身契约 stale 或 blocked，不由 Intake 改写 Environment Receipt、Task Plan、Verification Result 或 Task Record。

## 输出

```text
Declaration Intake：
- Trigger：<event>
- Scope：<project/service selectors>
- Preparation：current / missing / invalid / drifted；<candidate or diff>
- Verification：current / missing / invalid / gap；<candidate or diff>
- 外部诊断：<Commands/Capability gaps or none>
- 待授权写入：<exact files and changes or none>
- 下一动作：<request confirmation / owner Skill / done>
```
