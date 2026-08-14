## Why

当前 `Verify Buildr` 会响应所有 `dev` push，但 Buildr 的正式研发流程已经在 Task Environment 中完成 affected Verification，Task Finish 交付冻结 Candidate 并回读远端，self-bootstrap runner 再负责 retained Workspace 激活与最终 Doctor。GitHub 对每个正式交付和 successor 重复运行 Development feedback，既没有形成新的正式 authority，又造成取消、空计划和跨平台 runner 浪费。现在需要把 hosted CI 收敛到 PR、显式诊断和发布边界。

## What Changes

- 删除 `Verify Buildr` 的自动 `dev` push 触发；Formal Finish 和 self-bootstrap successor 推送到 `dev` 时不再自动创建 GitHub workflow run。
- 保留 PR 到 `dev` 的 affected Development feedback、`dev → main` 的分布式完整 Candidate，以及 `workflow_dispatch` 的显式完整 Candidate。
- 保持 `v*` tag 的发布 workflow 不变。
- 用 workflow 契约测试固定触发边界，并在产品规范中明确本地正式 Verification、PR hosted feedback、Candidate 与 Release 的责任分离。
- 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 取消 `dev` push 的自动 changed/affected CI 要求，改由正式 Task Verification 与 self-bootstrap activation 证明直接交付；hosted Development feedback 只在 PR 到 `dev` 时运行。

## Impact

- `.github/workflows/verify.yml`
- `openspec/specs/product-verification-quality/spec.md`
- Buildr workflow 契约测试
- GitHub Actions 的触发事件、`dev` 直接交付治理与最终验证证据归属
