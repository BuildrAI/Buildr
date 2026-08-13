## Why

当前完整候选在单个 Windows 作业内串行执行大量验证；即使便宜的确定性检查已经失败，昂贵步骤仍会继续，且最终清理等晚期失败会迫使下一次从头重跑十余分钟。现在需要把完整覆盖保留下来，同时把失败发现、制品准备、平台分片和最终门禁拆成可独立观察、可独立重跑的阶段，避免每次候选问题都付出整轮 Windows 成本。

## What Changes

- 增加候选 preflight：先运行便宜、确定性的规范、注册表、调度拓扑和工作流契约检查；preflight 失败时不得启动昂贵候选分片。
- 将一个冻结 source SHA 的候选验证拆为单次 tarball 构建、多个平台/资源 owner 分片和一个稳定聚合门禁；各分片消费并校验同一不可变制品身份。
- Windows 完整覆盖按 runtime/launcher、Workspace/Task lifecycle、fresh build 等高成本 owner 分片，使同一 SHA 的暂态或晚期失败可以只重跑失败作业及聚合作业。
- 为分片结果定义机器可读 evidence，绑定 source SHA、candidate artifact digest、registry/profile identity、step 集合和结果；聚合器必须证明完整 Candidate gate 无遗漏、无重复且全部 current。
- 明确正式 tag workflow 仍从最终 `main` commit 构建一次发布 tarball；PR 候选制品只用于候选验证，不能冒充最终 npm 发布物。
- 调整 CI 触发和分支保护迁移方式：`dev` push 先执行低成本/高风险反馈，`dev → main` PR 使用稳定的聚合 Required Check；新门禁绿色后才移除旧 check contexts。
- 更新发布 Skill、检查清单和验证声明，使本地开发默认运行 changed/focus，完整候选以 GitHub 分布式门禁为权威；验证框架自身变化或诊断场景仍可运行本地完整 Candidate。
- 增加分阶段 timing、失败短路和同一冻结 tree 多轮对比证据；性能预算保持非阻断，不通过删除场景或放宽断言提速。
- 本变更不修改公开 CLI/API，不发布 rc.9，也不创建 tag、npm version 或 GitHub Release。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 将完整 Candidate 从单进程/单作业语义扩展为 preflight、单制品、多分片和稳定聚合门禁，并规定失败短路、同 SHA 重跑、平台覆盖与 evidence currentness。

## Impact

- OpenSpec：`product-verification-quality` canonical spec。
- 验证实现：Candidate registry、scheduler、system owner registry、release smoke/fresh build timing、结果 evidence 与聚合校验。
- CI：`.github/workflows/verify.yml`、候选 artifact 的跨 job 传递、稳定 Required Check 和 dev push 反馈。
- 工作能力与文档：`buildr-release` Skill、发布 checklist、verification ownership/声明及相关契约测试。
- GitHub：在新 workflow 通过实测后迁移 `main` branch protection required contexts；不改变发布权限或 npm trusted publisher。
