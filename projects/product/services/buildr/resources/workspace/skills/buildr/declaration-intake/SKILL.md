---
name: declaration-intake
description: 初始化、维护准备与验证声明，或项目注册、构建和测试入口变化产生声明缺口时使用；先核对差异，再交给对应维护者。
---

# Declaration Intake Skill

本 Skill 是 Project Declaration Intake 的 Agent 编排入口。它只管理两类 Project-owned 长期声明：

- `projects/<project>/preparation.yml`：Agent按需调用哪些Project/Service真实准备入口；
- `projects/<project>/verification.yml`：项目有哪些稳定测试体系、在哪里发现并执行。

Intake 不保存状态、不拥有 schema 或 writer，也不管理 `capabilities.yml`、`commands.yml`。缺少 Skill/provider 时交给 Capability 体系；缺少 CLI/runtime 时只报告 Commands/Doctor 诊断。

## 1. 确认触发与范围

识别trigger：Project注册、Service注册、首次Task scope、依赖/构建/测试入口变化、Preparation declaration/Recipe gap、Verification coverage gap，或用户显式初始化/刷新。

只使用已登记 Project 和本次明确 Project/Service scope。Project-only 不虚构 Service；多 Service 分别列出事实与候选，不复制其他 Service 的结论。不得递归扫描整个仓库、按目录名猜技术栈，或读取 Task lifecycle/current projection 作为声明来源。

## 2. 只读 Discovery

读取以下最小事实：

- Project/Service registry、各 scope 的真实根与适用规则；
- 当前 `preparation.yml`、`verification.yml` 和所属 schema；
- 明确的 package/build/test wrapper、lockfile或配置、CI与项目文档；
- 当前 Commands/Capability readiness，仅用于外部依赖诊断。

对每个 scope 输出：trigger、当前声明状态、Preparation Recipe 候选/差异、测试地图候选/差异、证据、外部缺口和建议写入。测试地图候选区分证明覆盖范围与路径根，核对完整入口实际覆盖的测试；字段以 `task-verification` 的当前声明参考为准。旧声明只提供调查线索，结合真实入口重建当前地图，不机械替换版本号。没有稳定事实时标记 gap，不创建技术栈 adapter、测试、wrapper 或工具安装方案。

Discovery、Project/Service注册、Buildr Web GET、Doctor与Task Finish均不得创建、修改或删除长期声明。

## 3. 区分 routine maintenance 与用户决定

任何写入前都先展示精确diff，并按以下closed条件分类：

- `routine-maintenance`：只让声明追上当前用户目标和已登记scope内已经确认的wrapper、lockfile、build/test入口或既有authority；不新增/删除Project或Service scope，不改变证明范围、路径根、完整入口覆盖或环境边界，不引入新的测试体系、外部效果或安全例外，且authority无冲突。Agent可以在当前用户目标授权内直接交给owner维护并验证，无需让用户承担内部声明步骤。
- `user-decision-required`：新增/删除scope，改变证明范围、路径根、完整入口覆盖或环境边界，引入新的测试体系、外部效果或安全例外，或authority证据冲突，且当前授权尚未覆盖该变化。必须在写入前请求用户确认精确变化。

分类与展示至少包含：

- 精确目标文件；
- 新增、修改或删除的 Recipe／测试族身份与 scope；
- 关键 invocation、inputs/outputs、environment/effects 差异；
- 尚未解决的 Commands/Capability 或测试建设缺口。

`user-decision-required`没有确认时只报告当前缺口与候选；触发检查或Formal Task本身不授予额外写入权。当前有效授权已覆盖对象、长期变化与副作用时直接继续，不按轮次重复确认。`routine-maintenance`也不得静默扩大scope、伪造测试能力或绕过owner。

## 4. 交给声明 owner

分类完成后：

- Preparation在`routine-maintenance`成立或用户确认长期变化后，由Agent直接维护Project-owned`preparation.yml`并核对真实wrapper、cwd和scope；不创建Application状态；
- Verification 在`routine-maintenance`成立或用户确认长期变化后，交给 `task-verification` Skill，使用其 schema、模板和 Doctor 校验。

Intake不直接编辑声明，不合并两个writer。owner完成后运行适用静态检查，并再次只读确认文件、scope和identity。声明变化不改写任务验证报告或Task Record，也不产生Task级Plan、Receipt或ready状态。

## 输出

```text
Declaration Intake：
- Trigger：<event>
- Scope：<project/service selectors>
- Preparation：current / missing / invalid / drifted；<candidate or diff>
- Verification：current / missing / invalid / gap；<candidate or diff>
- 分类：routine-maintenance / user-decision-required；<closed reasons>
- 外部诊断：<Commands/Capability gaps or none>
- 待用户决定：<exact files and semantic changes or none>
- 下一动作：<request confirmation / owner Skill / done>
```
