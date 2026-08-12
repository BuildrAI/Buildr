## 1. 规划与事实边界

- [x] 1.1 完成 planning review，确认完整清退、历史 HTML 保护、通用 replacement 保留和 SQLite 零变更边界
- [x] 1.2 建立 current-knowledge impact evidence，并记录历史 HTML 基线清单与内容 hash

## 2. Canonical 与公开认知收敛

- [x] 2.1 收敛八个受影响 capability 的 canonical delta specs
- [x] 2.2 更新 Buildr 产品说明和文档索引，移除当前 Task Board 入口
- [x] 2.3 更新任务生命周期架构讨论稿：Parent Task 为已交付事实，P1.1 保持真实缺口条件触发

## 3. Package 与 runtime 能力清退

- [x] 3.1 从 package manifest、workspace baseline、bootstrap、runtime Buildr Skill 导航中删除 Task Board contract、binding、provider 与 builtin
- [x] 3.2 删除 canonical `task-board` Skill、contract 和 HTML template，不修改历史 Project HTML
- [x] 3.3 从 Task Triage 删除 Board 分支和 capability dependency
- [x] 3.4 删除 Task Board 专属 static validation 与 replacement/upgrade 声明，保留通用 replacement 引擎

## 4. Tests 与专项验证

- [x] 4.1 删除 Task Board contract/upgrade tests，并把通用 replacement unit fixtures 改为真实非 Board consumer
- [x] 4.2 更新 verification registry、runtime parity、current knowledge 与 routing tests 中的 Board 专属断言
- [x] 4.3 运行 package check、affected tests 与 OpenSpec strict validation
- [x] 4.4 证明两类历史 HTML 的路径、文件数和内容 hash 未变化

## 5. Change 收敛准备

- [x] 5.1 reconcile current knowledge evidence，并确认唯一 Change 已具备 converge/archive readiness
