## Why

Buildr 当前只通过 `package.json#engines.node` 和开发 launcher 的 Node 20+ 探测表达产品兼容范围，没有由 Workspace 持有的确定 Node 版本。实际任务已经出现 CLI 使用 Node 23、普通 `PATH` 中的 `npm` 与正式验证使用 Node 18，且 `doctor` 仍报告健康、Finish 仍可能复用缺少 Node identity 的旧验证证据，因此需要把 Node toolchain 纳入 Workspace 可恢复治理。

## What Changes

- 为 Workspace 增加受版本控制的精确 Node version 声明，并明确它属于 Workspace Domain，不属于 Agent runtime、Task Finish 私有状态或机器临时 `PATH`。
- `buildr init` 首次选择满足产品兼容范围的 Node version、写入声明并准备该版本的本机受管 runtime；版本选择结果必须确定且可恢复。
- `buildr sync` 只按已有声明收敛或补回受管 Node runtime，不得修改声明或静默升级/降级。
- `buildr doctor` 只读检查声明、受管 runtime、CLI/npm/验证进程解析一致性，并在缺失或漂移时建议运行 `sync`。
- CLI、npm、验证命令、Candidate 与 Finish 子进程统一从 Workspace Node identity 构造执行环境，不再重新从普通 `PATH` 选择 Node。
- 正式 Verification/Candidate evidence 记录 Workspace Node identity；Finish 只有在 Node identity 匹配时才能复用证据，漂移时停止并要求重新收敛、重新验证。
- 保留 `package.json#engines.node` 作为 Buildr 产品兼容范围，不把它当作 Workspace 实际 toolchain 声明。
- **BREAKING**：canonical `buildr.workspace/v1` metadata 将要求 Node toolchain 声明；已有 Workspace 必须通过显式 migration/sync 收敛，未知或缺失声明不再被视为 runtime-ready。

## Capabilities

### New Capabilities

- `workspace-node-toolchain`: 定义 Workspace Node version 的数据归属、初始化选择、本机受管 runtime、确定性解析、恢复与显式升级边界。

### Modified Capabilities

- `root-organization-workspace`: Workspace metadata 与 `init`/`sync` 生命周期增加 Node toolchain 声明和迁移语义。
- `agent-readable-doctor`: doctor 增加 Workspace Node 声明、runtime 可用性与执行链一致性的只读诊断。
- `task-verification`: Verification/Candidate 统一消费 Workspace Node identity，并把它纳入 evidence identity 与复用门禁。
- `task-finish-execution`: Finish 在 preflight、验证复用、子进程与恢复时绑定冻结的 Workspace Node identity。
- `task-environments`: task environment receipt/context 增加 Workspace Node identity 与可执行绑定核验。
- `npm-cli-package`: npm CLI 与开发入口在已初始化 Workspace 中消费 Workspace Node identity，同时保留 package compatibility boundary。

## Impact

- Workspace schema、初始化、同步、doctor、task environment、verification 和 Task Finish 的公开 JSON 契约与状态流。
- Buildr Node launcher、进程执行环境、npm 命令解析、受管 runtime 下载/安装和本机缓存布局。
- Candidate/Finish evidence identity、失效原因与恢复路径。
- Workspace baseline、集成/契约测试、Candidate 组合验收、current knowledge 与 CLI 文档。
- 需要安全处理 Node 发行版下载的 platform/architecture、完整性校验、并发安装、原子替换和离线诊断。
