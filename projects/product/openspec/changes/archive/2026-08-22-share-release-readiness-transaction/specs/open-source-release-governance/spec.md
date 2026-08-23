## ADDED Requirements

### Requirement: 受保护发布事务必须消费唯一冻结Context
Buildr正式publication MUST只由`.github/workflows/publish.yml`的唯一protected transaction执行。Workflow MUST在一次`npm-production`approval内消费与dispatch完全相同的context digest、matching Candidate aggregate与冻结tarball，依次完成hosted OIDC、final pre-tag convergence、tag ensure、npm publish/dist-tag、GitHub Release与Registry readback。

#### Scenario: 显式授权后dispatch
- **WHEN** 维护者明确授权publication且`dispatch-check`返回frozen ready context
- **THEN** runner MUST只dispatch一次publish workflow并传入context、context digest与Candidate run/artifact identity
- **AND** workflow MUST只有一个job声明`npm-production`、`id-token: write`和tag/npm/GitHub mutation权限

#### Scenario: Hosted pre-tag发现漂移
- **WHEN** protected transaction重新读取的selection、Candidate、artifact、Task correlation、main、workflow或run/attempt identity与冻结context不一致
- **THEN** transaction MUST在tag/npm/GitHub mutation前失败关闭并形成current attempt finding
- **AND** MUST NOT重建context、重新pack、dispatch第二workflow或回退本机凭证

### Requirement: 发布失败必须保留不可逆事实与attempt恢复路径
Protected transaction MUST为current GitHub run/attempt保存逐步evidence，并 MUST从正式Git/npm/GitHub readback记录已经成立的tag、npm version/integrity、dist-tag、GitHub Release与Registry smoke事实。失败Result MUST区分同attempt恢复、明确新attempt恢复和必须新version/人工处理，不得撤销或伪装已成立事实。

#### Scenario: Tag创建后npm失败
- **WHEN** immutable tag已指向冻结source但npm publish或OIDC exchange失败
- **THEN** evidence MUST保留tag commit、失败步骤、run/attempt与安全诊断
- **AND** 恢复 MUST继续消费同一context与tarball并明确是否需要新attempt，MUST NOT删除、移动tag或改用本机token publish

#### Scenario: npm成功后公开readback失败
- **WHEN** Registry已存在同version且integrity匹配冻结tarball，但dist-tag、GitHub Release或Registry smoke尚未完成
- **THEN** rerun MUST复用已发布npm事实并只补齐未成立步骤
- **AND** MUST NOT再次publish、重新pack、unpublish或覆盖相同version

#### Scenario: 已有事实发生冲突
- **WHEN** existing tag source、Registry integrity或GitHub Release metadata与冻结context不一致
- **THEN** transaction MUST返回需要人工处理或新version的blocked恢复分类并保留所有事实
- **AND** MUST NOT自动覆盖、删除、移动或弱化protected environment
