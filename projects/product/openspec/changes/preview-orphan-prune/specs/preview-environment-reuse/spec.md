# preview-environment-reuse Delta

## ADDED Requirements

### Requirement: 无主预览残留清理

产品 MUST 提供 `preview prune` 扫描预览根并清理无主残留实例目录。prune MUST 仅删除同时满足以下条件的目录：不存在 owner 登记文件，且实例记录与后台进程记录均能确认无存活进程。owner 登记文件存在时（无论能否解析），prune MUST 跳过该目录并报告原因，其清理仍归托管 stop/purge。实例或后台记录存在但无法解析、无法确认进程已死时，prune MUST 跳过并报告原因。prune 的删除 MUST 复用 purge 的目标安全语义：目标位于预览根内且为真实目录，符号链接按链接条目删除，MUST NOT 跟随或改动链接目标。prune MUST 逐项报告 pruned 或 skipped 及原因；单个目录的失败 MUST 只影响该目录，MUST NOT 阻止其余目录的判定与清理。prune MUST NOT 改变 stop 默认保留数据与 owner 匹配等既有语义。

#### Scenario: 孤儿目录被清理
- **WHEN** 预览根内某实例目录无 owner 登记、无实例与后台存活进程，且含有指向宿主缓存的符号链接与断链
- **THEN** prune MUST 删除该实例目录并报告 pruned
- **AND** 链接目标 MUST 保持完好

#### Scenario: 有 owner 的目录不被触碰
- **WHEN** 实例目录存在 owner 登记文件（含文件存在但无法解析的情况）
- **THEN** prune MUST 跳过该目录并报告原因
- **AND** 目录内容 MUST 保持不变

#### Scenario: 存活进程的目录不被触碰
- **WHEN** 实例目录无 owner 但实例记录或后台进程记录指向存活进程
- **THEN** prune MUST 跳过该目录并报告原因

#### Scenario: 记录无法确认时失败关闭
- **WHEN** 实例或后台记录存在但无法解析出可核对的进程身份
- **THEN** prune MUST 跳过该目录并报告原因，MUST NOT 按无主删除

#### Scenario: 单目录失败不扩大
- **WHEN** 某个目录的判定或删除失败
- **THEN** prune MUST 报告该目录的失败原因并继续处理其余目录