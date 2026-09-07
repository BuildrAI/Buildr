# 删除统一任务环境

## Why

普通开发、OpenSpec、Review、Verification、Finish、Preview、Worktree和Release已经不再需要统一Task Environment。剩余Application、Plan、Receipt、状态、Web页签和SQLite表没有独立消费者，只会继续制造ready、恢复和展示需求。

## What Changes

- 删除`buildr.task-environment/v1`能力、Skill、绑定、CLI、HTTP、Application、Domain、Persistence和公共JSON。
- 删除Preparation Plan/Request/Recipe执行、动态资源统一登记、ready/blocked/cleaned、恢复和总cleanup。
- 删除Buildr Web Environment页签、saved GET和相关DTO/测试。
- Project`preparation.yml`降为Project/Service真实准备入口声明；Agent按需读取并直接调用，Buildr不保存Task选择或执行快照。
- 新增一次SQLite migration直接`DROP TABLE task_environment_current`；不备份、不建history、不双读。
- 删除Environment专属测试、fixture、verification owner和文档；保留Worktree、Preview、Release、Task/Review/Verification/Retrospective及自举现有连接。

## Non-goals

- 不删除Task Record、Worktree、Project testing map、Task Verification、Task Review、Task Finish或Release Candidate。
- 不新增统一执行平台、ready门禁、资源注册表或Preparation Application。
