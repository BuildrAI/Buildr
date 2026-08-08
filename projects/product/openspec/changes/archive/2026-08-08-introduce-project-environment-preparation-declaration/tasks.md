## 1. Domain与持久化

- [x] 1.1 实现closed `preparation.yml` parser、Declaration/Recipe identity与Project/Service scope校验
- [x] 1.2 实现Plan Request v1、Task Plan v2与`task-inline` fallback normalization
- [x] 1.3 实现Receipt v5的Declaration、Scope、Recipe、Step分层事实与v4只读兼容
- [x] 1.4 更新SQLite Environment current repository round-trip与rollback测试，保持唯一current slot

## 2. Environment运行行为

- [x] 2.1 更新Plan record/prepare，从Project声明解析Recipe并生成Task执行快照
- [x] 2.2 更新prepare/inspect漂移、部分恢复、失败与本次执行effects语义
- [x] 2.3 更新CLI参数、public JSON schema、diagnostic与帮助说明
- [x] 2.4 增加Preparation Declaration Doctor校验且保持缺失声明非error

## 3. Consumer与产品声明

- [x] 3.1 更新Local App read model与Environment Tab，展示Declaration、scope、Recipe和Step事实
- [x] 3.2 新增Product `preparation.yml`，分别声明`buildr`与`buildr-web`的受管npm准备Recipe
- [x] 3.3 更新`task-environment` contract/Skill/reference/template及受影响consumer guidance和package manifest
- [x] 3.4 更新CLI、Skill capability、Local App与Environment架构文档

## 4. 验证与当前认知

- [x] 4.1 增加Project-only、多Service、task-inline、非Node wrapper、声明/Recipe漂移和partial recovery单元/集成测试
- [x] 4.2 增加fresh worktree中两套依赖准备、`build:web`锁定工具链与失败诊断系统测试
- [x] 4.3 收敛术语、Project/Service current knowledge、glossary与Change knowledge impact evidence
- [x] 4.4 运行直接反馈测试、package check、browser smoke与OpenSpec strict validation

## 5. Change收敛准备

- [x] 5.1 核对writer/reader/consumer/迁移边界与全部public fixtures一致
- [x] 5.2 确认全部Change-owned任务完成并执行deterministic convergence/archive
