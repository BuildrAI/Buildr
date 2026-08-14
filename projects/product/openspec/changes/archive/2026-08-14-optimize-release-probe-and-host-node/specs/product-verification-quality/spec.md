## ADDED Requirements

### Requirement: Tag publish Host Node 验证必须在隔离 runner 中准备自身依赖
Buildr tag publish workflow 的每个 Host Node job MUST 在独立 runner 上依据当前 package lockfile 准备 checkout verification harness 所需依赖，再执行同一冻结正式 tarball 的 Host Node、CLI、Web 与 Workspace runtime role 验证。Job MUST NOT 假设其他 job 的工作目录、`node_modules` 或进程状态可见，且依赖准备 MUST NOT 重建、修改或替换被冻结的 tarball。

#### Scenario: 独立 Host Node runner 验证正式 tarball
- **WHEN** tag workflow 为最低支持 Node 与当前 Node 24 分别启动 Host Node job
- **THEN** 每个 job MUST checkout 相同 tag source、设置目标 Node、依据 lockfile 独立安装 verification harness 依赖并下载同一 candidate artifact
- **AND** 每个 job MUST 在依赖准备完成后执行 Host Node verifier
- **AND** 两个 job MUST 验证同一 tarball filename、manifest 与 immutable bytes

#### Scenario: 前序 candidate job 已安装依赖
- **WHEN** candidate producer job 已在自己的 runner 中执行依赖安装并冻结 tarball
- **THEN** 后续 Host Node job MUST NOT 把该 runner 的 `node_modules` 或工作目录视为可用输入
- **AND** workflow contract MUST 在 Host Node job 缺失本地依赖准备或依赖准备位于 verifier 之后时失败
