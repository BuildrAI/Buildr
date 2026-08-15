## 1. Finish occupancy 释放入口

- [x] 1.1 为既有 `task finish run` 增加 `--release-occupancy`，与 `--resume` / `--bootstrap-recovery` / `--accept-zero-delta-adaptation` 互斥，必须带 `--run` 与 `--task`
- [x] 1.2 Application：仅当 Task 为 abandoned、run 绑定一致、从未成功交付、carrier 所有权可证明时删除该 carrier；不 push、不 complete Task Record
- [x] 1.3 已交付、Task 仍 active、或 carrier 不可证明时 fail closed 并保留现场
- [x] 1.4 帮助、JSON 诊断与 compact/full Result 能区分占用已释放与普通五阶段 complete

## 2. 自举 closeout 分类

- [x] 2.1 foreign carrier 在 abandoned + 未交付 + identity 可证明时生成 owner `--release-occupancy` 步骤，不得标成仅人工审查
- [x] 2.2 协调器仍零删除；active 或已交付的 foreign 继续 `manual-owner-review` / `unprovable` 既有规则
- [x] 2.3 补 closeout 集成测试覆盖上述分类与命令

## 3. Skill 引导

- [x] 3.1 `task-finish` Skill：放弃且环境清理后若仍有未交付占用，调用产品入口，禁止手删 carrier 目录
- [x] 3.2 同步 package 投射，并补 Skill/CLI 契约测试

## 4. 当前认知

- [x] 4.1 写 `brief.md`，纳入退房/房卡生活例子，评估概览/架构/流程/术语的真实影响
- [x] 4.2 把真实影响写入 `tasks.md` 与 `.buildr/knowledge-impact.yml`

## 5. 归档准备

- [x] 5.1 `openspec validate release-abandoned-finish-occupancy --strict` 通过
