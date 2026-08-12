## MODIFIED Requirements

### Requirement: Environment current 必须使用独立窄 SQLite schema
Workspace Structured Store MUST以独立`task_environment_current` table保存每个正式Task的Environment current Receipt。该表 MUST使用task_id唯一绑定tasks，保存经过Domain校验的receipt_json、可查询status和updated_at；Receipt v3的dependency roots MUST保留在同一JSON current中。repository MUST兼容读取旧v2，但 MUST只允许显式prepare把active current收敛为v3；MUST NOT把Environment字段并入tasks、建设第二张dependency表、通用history/event/audit表或复制facts到其他projection。

#### Scenario: fresh Workspace 初始化 Environment schema
- **WHEN** current runtime初始化新的Workspace Structured Store
- **THEN** migrations MUST建立task_environment_current、Task foreign key、JSON validity与唯一current slot
- **AND** MUST NOT建立Environment file index、dependency root副本表、history或远端同步table

#### Scenario: 已有 Workspace 升级
- **WHEN** 健康数据库已应用到前一migration version且retained controller执行合法writable action
- **THEN** runner MUST原子应用pending migrations并登记准硬checksum
- **AND** MUST保留已有Task、专业current rows、v2/v3 Environment rows与Finish rows，并以Environment current row为唯一authority

#### Scenario: 已有Workspace读取v2 current
- **WHEN** 健康数据库包含合法v2 Environment Receipt并由新runtime只读访问
- **THEN** repository MUST保留row bytes并返回兼容read model或legacy blocked diagnostic
- **AND** GET/inspect MUST NOT因兼容读取自动写v3

#### Scenario: Environment current value 被替换
- **WHEN** Task Environment Application已观察正式声明并完成root normalization/preparation
- **THEN** repository MUST在单一transaction中以v3完整替换精确task_id slot，写后读取验证并提交
- **AND** 任一校验、busy、foreign key或integrity failure MUST rollback并保留最后有效current

#### Scenario: 不存在的 Task 被 Environment writer 引用
- **WHEN** Environment Application尝试为不存在Task ID写入current
- **THEN** foreign key与Application validation MUST拒绝mutation
- **AND** transaction MUST rollback并保留其他Environment rows
