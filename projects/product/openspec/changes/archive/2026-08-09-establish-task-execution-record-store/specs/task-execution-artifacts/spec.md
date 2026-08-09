## ADDED Requirements

### Requirement: Task execution record 必须由单一 Application 管理
Buildr MUST提供唯一 Task Execution Record Application，为正式Task管理closed execution record metadata、正文生命周期、固定quota reservation、resolution与cleanup状态。v1 owner/kind MUST只接受`task-verification/verification-execution`与`task-finish/finish-diagnostics`；Application MUST拒绝任意owner、kind、event、tag、history payload、Consumer/Adoption关系或execution resource mutation。

#### Scenario: 幂等打开正式Task record
- **WHEN** registered producer以相同Task、owner、kind与run identity重复open execution record
- **THEN**Application MUST返回同一open record及其reservation，而不新增第二row或第二staging root
- **AND**target或producer identity不一致时 MUST fail closed并保留原record

#### Scenario: 未登记producer或不存在Task
- **WHEN**caller提交未登记owner/kind、任意payload或不存在的Task ID
- **THEN**Application MUST拒绝整个mutation
- **AND**MUST NOT创建metadata、body、quota reservation或专业Result

### Requirement: execution record 正文必须在写入前受限处理
Buildr MUST只把正文写入canonical Workspace的`.buildr/local/task-execution-records/<owner>/<record-id>/`，并 MUST在任何persistent write前应用版本化redaction、closed file-name与path/symlink/regular-file检查。SQLite MUST只保存Workspace-relative locator、digest、stored/original size、truncated与redaction version，MUST NOT保存stdout/stderr、完整diagnostics、环境变量、stdin、凭证或未经授权的绝对路径。

#### Scenario: 正文正常seal
- **WHEN**producer为open record提交closed UTF-8或JSON body files并以terminal outcome seal
- **THEN**writer MUST在owned staging中先脱敏和有界写入、fsync并原子rename，再提交retained metadata
- **AND**metadata MUST保存可重读的relative locator、aggregate digest/size、truncation与redaction version

#### Scenario: secret和本机路径进入正文
- **WHEN**body包含Bearer token、private key、credential/secret字段或未经授权的本机绝对路径
- **THEN**writer MUST在staging write前替换敏感内容并只持久化redacted bytes
- **AND**任何raw副本、env、stdin或原始命令参数 MUST NOT落盘

#### Scenario: publish后metadata失败
- **WHEN**final body directory已原子rename但SQLite seal transaction失败
- **THEN**Application MUST不把record报告为retained，并 MUST保留可识别manifest/attention现场供精确恢复
- **AND**重试 MUST只复用identity与digest匹配的owned directory，不得覆盖或删除未知内容

### Requirement: execution record 容量必须固定且在execution前backpressure
Buildr MUST固定单文件4 MiB、单record16 MiB、同一Task/owner 256 MiB与Workspace 2 GiB上限。Application MUST在open transaction中按16 MiB record boundary预留容量；open按reservation计费，seal后按stored bytes计费，cleaned后释放。caller MUST NOT覆盖容量或先执行producer再丢弃正文。

#### Scenario: 文件或record超过上限
- **WHEN**redacted body file超过4 MiB或record total超过16 MiB
- **THEN**writer MUST在UTF-8或valid structured boundary安全截断并保存original/stored bytes与`truncated: true`
- **AND**MUST NOT通过未登记文件或raw旁路绕过上限

#### Scenario: Task-owner或Workspace容量不足
- **WHEN**新的16 MiB reservation将超过256 MiB Task-owner或2 GiB Workspace上限
- **THEN**Application MUST在producer execution启动前返回backpressure和唯一cleanup/resolution next action
- **AND**MUST NOT创建record、staging directory或静默清理未解决/可恢复内容

### Requirement: execution record retention 与单记录cleanup 必须可恢复
Buildr MUST对passed正文至少保留7天且保留相同Task/owner/kind最近3次，对failed、blocked、cancelled正文至少保留30天并要求resolution为acknowledged或recovered。open、attention或仍不可证明terminal的record MUST NOT cleanup。eligible cleanup MUST先形成cleanup_pending CAS，再删除精确owned body，最后保存cleaned tombstone并保留digest/size/producer/cleanup code。

#### Scenario: passed record仍受时间或最近次数保护
- **WHEN**passed record未满7天或仍属于相同Task/owner/kind最近3次
- **THEN**Application MUST拒绝cleanup并返回具体retention原因
- **AND**record body与metadata MUST保持不变

#### Scenario: failed record尚未解决
- **WHEN**failed、blocked或cancelled record已满30天但resolution仍是pending
- **THEN**Application MUST拒绝cleanup并保持正文
- **AND**MUST NOT用时间到期代替acknowledged或recovered事实

#### Scenario: eligible record完成cleanup
- **WHEN**age、recent-count、resolution与ownership条件全部满足
- **THEN**Application MUST只删除该record directory并将metadata写为cleaned、locator清空、quota released
- **AND**digest、stored/original size、truncated、producer与cleanup code MUST作为tombstone保留
