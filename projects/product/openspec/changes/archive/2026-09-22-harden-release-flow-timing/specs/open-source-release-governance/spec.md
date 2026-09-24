## ADDED Requirements

### Requirement: 发布后 Registry 回读必须有界收敛且不得重复 publish

Buildr release workflow 在 `npm publish` 返回后从官方 Registry 回读精确 version/integrity 时，MUST 容忍官方 Registry 的传播延迟：回读 MUST 在一个有界时间窗内**重复只读**同一精确 version，直到命中 matching version + integrity（确认发布）或窗口耗尽。回读阶段 MUST NOT 因为单次未命中即触发第二次 `npm publish`、重建 tarball、切换本地 publish 或移动 tag。仅当有界窗口耗尽仍未命中时，workflow MAY 报告 `npm-publication-unconfirmed` 并 fail closed；已存在且 integrity 相同的 version MUST 继续按既有规则复用。

#### Scenario: 发布成功但 Registry 传播滞后

- **WHEN** `npm publish` 对冻结 tarball 返回成功，但官方 Registry 在首次回读时尚未包含该精确 version
- **THEN** workflow MUST 在有界窗口内重复只读同一 version，而不是立即判定失败
- **AND** workflow MUST NOT 在该窗口内再次 publish、repack 或移动 tag
- **AND** 一旦回读命中 matching version + integrity，workflow MUST 视为发布已确认并继续 readback 后续步骤

#### Scenario: 有界窗口耗尽仍未确认

- **WHEN** 有界回读窗口耗尽，官方 Registry 仍未返回 matching version + integrity
- **THEN** workflow MUST 报告 `npm-publication-unconfirmed` 并 fail closed
- **AND** workflow MUST NOT 把未知发布状态当作未发布而重新 publish
- **AND** 诊断 MUST 指向"回读同一精确 version 后再恢复，未知状态下不重复 publish"

#### Scenario: 回读期间命中已存在的相同 version

- **WHEN** 发布前或回读期间官方 Registry 已存在相同 version 且 integrity 与冻结 manifest 一致
- **THEN** workflow MUST 复用该已发布事实并继续，不得发布第二份 bytes
- **AND** integrity 不一致时 MUST 停止且不得覆盖已发布 version
