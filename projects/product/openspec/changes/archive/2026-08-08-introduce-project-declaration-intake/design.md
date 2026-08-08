## Context

Preparation 和 Verification 都是 Project-owned 长期声明。Task Environment 与 Task Verification 分别保存自己的 Task 级执行事实，但“什么时候检查声明、如何提出候选、谁能写入”尚无共同入口。

## Goals / Non-Goals

**Goals:**

- 两类声明共享同一 Agent Intake 流程和触发词汇。
- 自动触发只启动只读发现；长期文件写入始终要求用户确认。
- 各声明继续由 `task-environment`、`task-verification` 自己维护与校验。
- 支持 Project-only、多 Service 和任意由项目 wrapper 表达的技术栈。

**Non-Goals:**

- 不新增统一 declaration schema、store、writer、scheduler 或后台扫描器。
- 不把 `capabilities.yml`、`commands.yml` 纳入 Intake。
- 不安装 CLI、Skill、运行时或测试框架。
- 不在 Local App GET、Doctor、Environment inspect 或 Task Finish 中写文件。

## Decisions

### 1. Intake 是 Agent 编排，不是新的 authority

`declaration-intake` Skill只输出 scope、trigger、两类声明现状、候选/差异、外部依赖诊断和待确认写入。它不保存 current，也不创建第二份声明目录。

### 2. Writer ownership 不合并

用户授权后，Preparation handoff 给 `task-environment`，Verification handoff 给 `task-verification`。两个 owner 使用自己的 schema、模板、Doctor 和验证，Intake 不直接编辑文件。

### 3. Trigger 自动，写入不自动

注册 Project、注册 Service、首次 Task scope、依赖/构建/测试入口变化、Environment missing/invalid、Verification gap 和用户显式 initialize/refresh 都可触发只读 Intake。任何长期写入都要展示目标文件和差异并取得确认。

### 4. Capabilities 与 Commands 只是外部诊断

缺少 Skill/provider 交给 Capability 体系；缺少 CLI 交给 Commands/Doctor。Intake 不扩大自身职责。

### 5. 共享触发文案，避免第二套执行 API

Application 使用一个纯触发文案模块，让 Project/Service/Start Work prompt 与专业 gap 返回一致入口。真正 discovery 由 Agent Skill 在当前 scope 读取现有资产完成，不增加持久 Intake Application。

## Flow

```text
trigger
  -> Agent readonly discovery
  -> preparation / verification candidate or diff
  -> user confirms exact long-lived writes
  -> declaration owner Skill writes
  -> Doctor validates
```

## Risks / Trade-offs

- Agent discovery 不是确定性代码扫描器；通过 closed scope、固定输出和 owner validation 限制误判。
- Prompt trigger 不保证用户一定接受写入；缺失声明仍通过 Environment blocked 或 Verification gap 保持真实状态。
- 非 Node 技术栈依赖项目已有 wrapper 与 Commands/Capability readiness；Buildr 不猜测适配器。

## Migration

无数据迁移。既有声明保持原 schema/owner；没有声明的 Project 继续有效。新增 Skill 和 prompt 在 sync 后投射。
