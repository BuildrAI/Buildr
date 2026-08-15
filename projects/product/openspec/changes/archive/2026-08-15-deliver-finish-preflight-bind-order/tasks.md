## 1. 收尾前轻量对齐

- [x] 1.1 在 `task-finish` Skill 调用产品前增加：确认任务分支贡献已提交、本机主工作区已对齐目标远端；未对齐则先说明并等待处理
- [x] 1.2 保持「直接调用 `task finish run`、按三模块完整转述入口缺口」，禁止改回自行链式 fail-fast
- [x] 1.3 同步 package 投射，并补契约测试防止提醒丢失

## 2. 变更绑定顺序

- [x] 2.1 改 OpenSpec 侧栏：脚手架 → `add-change` → `begin` → artifacts；删除「写文档前先 begin」的相反要求
- [x] 2.2 如 `task-development` 衔接文案仍暗示先 begin 再绑变更，一并改到同一顺序
- [x] 2.3 补契约测试，锁定侧栏顺序并禁止空列表 begin 后再绑定同一变更

## 3. 当前认知

- [x] 3.1 写 `brief.md`，纳入两个生活例子，评估对概览/架构/流程/术语的真实影响
- [x] 3.2 把真实影响写入 `tasks.md` 与 `.buildr/knowledge-impact.yml`

## 4. 归档准备

- [x] 4.1 `openspec validate deliver-finish-preflight-bind-order --strict` 通过
