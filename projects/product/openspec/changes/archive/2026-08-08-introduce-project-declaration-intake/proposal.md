# Change: 建立 Project Declaration Intake

## Why

Project 已分别拥有 `preparation.yml` 与 `verification.yml`，但声明初始化、刷新和缺口恢复仍分散在不同 Skill 与入口。Project/Service 注册、首次开始工作、Environment 缺口和 Verification coverage gap 没有一致地触发 Agent 只读发现，也没有统一说明长期写入必须先取得用户授权。

## What Changes

- 新增 `declaration-intake` Agent Skill，编排 Preparation 与 Verification 两类 Project 声明的只读发现、候选差异、用户确认和 owner handoff。
- Project/Service 创建 prompt、首次开始工作 prompt、Environment 声明缺口与 Verification coverage gap 提供一致的 Intake next action。
- Intake 不保存状态、不直接写声明、不安装 Command/Skill，也不拥有各声明 schema、writer、Doctor 或 Task Result。
- `task-environment` 与 `task-verification` 继续分别拥有授权后的声明维护和专业执行。
- 新增简洁的 Project Declaration System 架构文档。

## Capabilities

### New Capabilities

- `project-declaration-intake`: 为Project环境准备与任务验证声明提供统一Agent接入流程，定义注册、首次Task和专业缺口触发后的只读发现、精确长期写入授权、各声明owner handoff及无持久状态边界。

### Modified Capabilities

- `project-registry`: 注册完成后触发 Intake 提示，但不静默生成声明。
- `project-environment-preparation-declarations`: missing/invalid Recipe 触发 Intake，Environment 仍 fail closed。
- `task-verification`: coverage gap 触发 Intake，Verification 不借机开发测试或写声明。
- `local-workspace-application`: 首次开始工作 prompt 先检查当前 scope 的 Project 声明。
- `product-agent-skills`: 投射新的 Intake Skill，并明确两个 owner Skill 的 handoff。

## Impact

影响 Agent Skills、Project/Service/Start Work prompt、Environment 与 Verification diagnostics、Local App prompt API、package projection、current knowledge、CLI 文档与自动化测试；不增加 SQLite migration、后台任务、通用 declaration store 或声明执行框架。
