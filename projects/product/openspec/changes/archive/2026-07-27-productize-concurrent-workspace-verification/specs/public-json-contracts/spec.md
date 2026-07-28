## ADDED Requirements

### Requirement: Verification run 必须提供稳定公开 JSON identity
`buildr verification run --json` MUST 返回 `buildr.verification-run/v1` 顶层 identity，并至少包含 operation、status、requiredAssurance、project、policy sources、environment context、candidate identity、plan decisions、checks、resource events、candidate completeness、duration、timing source、failures、skips、evidence identity、reference 与 lifecycle；checkout 和 npm tarball MUST 保持 schema parity。

#### Scenario: 验证成功输出 JSON
- **WHEN** verification run 完整通过并请求 JSON
- **THEN** stdout MUST 是单一 `buildr.verification-run/v1` 对象
- **AND** worker stdout/stderr MUST 作为有边界的字段或 evidence reference 返回，不得破坏 envelope

#### Scenario: 验证业务失败输出 JSON
- **WHEN** required check 失败、资源等待超时或 context binding 被拒绝
- **THEN** stdout MUST 仍返回同一 schema family 的失败摘要并以非零状态退出
- **AND** payload MUST 包含确定性 error code、已完成检查和 cleanup 状态
