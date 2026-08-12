## ADDED Requirements

### Requirement: Task Finish 归档已手动同步的 OpenSpec change 时跳过重复 spec update
当 Task Finish 已在当前会话中通过 agent-driven 路径同步 active change 的 canonical specs，且 `post-sync` contract guard 返回 `ok: true` 时，Task Finish MUST 使用当前 OpenSpec CLI 的 `archive --skip-specs` 归档该 change。该选项只跳过重复 spec update，不得跳过 strict validation、archive 后状态检查或现有 closeout workflow checks。

#### Scenario: 已同步且 post-sync 通过的 change
- **WHEN** 当前会话已记录 canonical spec sync 和 `post-sync` guard 的成功结果
- **THEN** Task Finish MUST 使用 `openspec archive <change> --skip-specs --yes`
- **AND** MUST 记录 canonical specs 已同步、archive 未重复更新 specs 以及后续 strict validation 结果

#### Scenario: 缺少已同步证据或 post-sync 失败
- **WHEN** canonical sync 尚未完成、无法证明属于当前会话，或 `post-sync` guard 未通过
- **THEN** Task Finish MUST NOT 使用 `--skip-specs`
- **AND** MUST 停止或按既有默认 archive/sync 流程处理，不得以该选项绕过 guard
