# 强化发布 Authority 前置校验

## 一句话摘要

在创建 release tag 前，用机器可读元组和 authenticated current readback 证明 GitHub OIDC 发布身份与 npm Trusted Publisher 一致。

## 背景与问题

rc.8 曾因 GitHub repository owner 已迁移、npm Trusted Publisher 仍指向旧 owner，直到 tag 后 `npm publish` 才以 `E404` 暴露。当前 package、workflow 和 checklist 虽已一致，但这些静态事实不能证明 npm 控制面当前配置。

## 目标与非目标

目标是让 release contract、只读 preflight、tag 前 convergence gate 和 publish 失败诊断共享唯一 authority tuple。非目标是执行发布、创建 tag、修改凭证或自动修复外部控制面。

## 受影响角色

Buildr release maintainer 与执行 GitHub-hosted release workflow 的 Agent。

## 核心流程

maintainer 在 dev/main 与 release candidate 收敛后，以 authenticated npm session 运行 preflight；只有本地、GitHub、npm current authority 全部一致且 evidence 仍绑定当前 commit/workflow bytes，post-main convergence 才允许申请 tag 授权。后续 OIDC 失败保留现场并直接提示 expected tuple 与恢复路径。

## 关键变化

- release contract 增加 provider/repository/workflow/Environment/allowed action 元组。
- 新增只读 live preflight 与 closed evidence。
- post-main convergence 强制消费 current evidence。
- publish wrapper 对 authority 相关认证错误追加精确诊断。

## 影响、风险与兼容性

Tag 前检查需要 npm 11.15+ 和 maintainer 登录态；缺失时发布会明确 blocked。contract 字段是 v2 加法兼容；外部控制面不被本 Change 修改。

## 验收摘要

fixture 必须证明一致时 ready、任一 drift/unavailable 时 fail closed、旧或不匹配 evidence 不能通过 convergence，以及 publish wrapper 保留原始失败和退出码。

## 技术 Artifacts

- `proposal.md`
- `design.md`
- `specs/open-source-release-governance/spec.md`
- `tasks.md`
