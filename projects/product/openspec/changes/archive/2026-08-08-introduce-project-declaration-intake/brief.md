# Project Declaration Intake

一句话摘要：触发事件让 Agent 只读发现 Preparation 与 Verification 声明候选；用户确认长期写入；各声明 owner 负责落盘、校验和后续专业执行。

## 核心边界

- 只管理 `preparation.yml` 与 `verification.yml`。
- Intake 没有数据库、后台扫描器、统一 writer 或 GET 副作用。
- `capabilities.yml` 与 `commands.yml` 只作为外部缺口诊断。
- Project-only 与多 Service 使用同一 scope 模型，不按技术栈增加适配器。

## 触发

Project/Service 注册、首次工作、构建/依赖/测试入口变化、Environment declaration gap、Verification coverage gap，以及显式初始化或刷新。

## 执行

`只读发现 → 候选/差异 → 用户确认 → owner Skill 写入 → Doctor`。

## 技术 Artifacts

- `proposal.md`
- `design.md`
- `specs/`
- `tasks.md`
