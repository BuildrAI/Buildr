## 1. Hosted authority probe

- [x] 1.1 在 `publish.yml` 增加隔离的 `workflow_dispatch` authority probe，并保证 tag publish jobs 与 probe job 事件互斥
- [x] 1.2 实现 GitHub OIDC npm package token exchange 与无凭证 hosted evidence，冻结 source commit、workflow digest、package 和 run identity
- [x] 1.3 将本机 authority preflight 升级为 v2，校验 GitHub current run 与 probe artifact，不再依赖 npm CLI/login/`trust list`
- [x] 1.4 更新 post-main convergence，只接受未过期且匹配当前 `origin/main` 与 workflow bytes 的 v2 evidence

## 2. Contracts and guidance

- [x] 2.1 更新 release authority contract、`buildr-release` Skill 与 release checklist，说明 hosted probe 的触发、下载、校验和恢复边界
- [x] 2.2 收敛 Brief、发布流程与技术架构 current knowledge，并确认现有 OIDC/evidence 术语无长期冲突

## 3. Verification and convergence

- [x] 3.1 增补 contract、integration 与 workflow tests，覆盖成功、漂移、过期、exchange 拒绝、事件隔离和 token 不落盘
- [x] 3.2 运行 OpenSpec strict validation 与本 Change 的直接 contract/integration/workflow 测试反馈
- [x] 3.3 确认 Change、Brief、current knowledge 与实现已对齐并达到 deterministic archive readiness
