## MODIFIED Requirements

### Requirement: Publication 必须从已完成 Task 的权威环境事实重建

Buildr Release MUST在matching release Worktree中使用冻结source的锁文件、满足 Product 最低版本要求的 Node和统一消费准备入口，只准备当前动作必需依赖。准备结果 MUST保存source inputs、cwd、command、Node和真实outcome；无需单独准备绑定文件，MUST NOT保存stdout或凭证。无副作用readiness MUST只读取当前执行条件，不得执行依赖安装。

#### Scenario: Release Task Finish 已清理 worktree
- **WHEN** matching release Worktree已清理且需要恢复发布后登记或清理
- **THEN** Release MUST从canonical Workspace读取任务及发布事实，使用retained工具恢复未完成步骤

- **AND** workflow MUST在其执行位置使用统一最低充分准备入口
- **AND** MUST NOT完成或重开Task、恢复旧worktree或在`projects/product`执行`npm ci`

#### Scenario: recipe、cwd 或 lockfile 不匹配
- **WHEN** 必需准备失败或source inputs、Node、cwd漂移
- **THEN** Release MUST只阻塞依赖该准备的readiness，不改变Task、Candidate、Git或Publication事实

### Requirement: Candidate 与 Release 子进程必须共同冻结 exact Node executable 和 PATH
Buildr MUST由一个共享 execution environment helper同时绑定权威 Node executable、对应 bin 的 PATH 首项、npm shim与可审计 Node identity。本地 Candidate、hosted Host Node tuple、release prepare、tarball/Registry smoke、macOS LaunchServices Launcher后代进程和hosted publication helper MUST复用该 contract；任何 consumer MUST NOT只冻结父进程 executable而让子进程从会话 PATH 解析其他 Node。Host Node tuple的权威版本 MUST来自该tuple实际启动verifier的Node，开发、验证与发布入口 MUST接受满足 Product 最低版本要求的稳定 Node，MUST NOT因实际版本不等于基准或主版本更高而拒绝；同一次执行内的真实 Node identity继续严格一致。

#### Scenario: inherited PATH 含另一个 Node
- **WHEN** 权威 executable 与 inherited PATH 中首先可见的 Node 版本或路径不同
- **THEN** 父进程 MUST使用权威 executable
- **AND** 所有子进程以及Launcher后代进程执行 `node`/`npm` 时 MUST解析到同一 Node bin
- **AND** evidence MUST输出 executable、version、bin 与 PATH head identity

#### Scenario: hosted current Node 不等于 development exact Node
- **WHEN** Host Node `current` tuple实际Node满足package engine但不等于Project `.node-version`
- **THEN** tuple MUST以实际Node构造exact execution environment并运行同一冻结tarball
- **AND** verifier MUST NOT把development版本声明应用到Host compatibility matrix

#### Scenario: Launcher readiness 失败
- **WHEN** macOS LaunchServices后代没有在专用readiness budget内证明匹配health与Node identity
- **THEN** smoke MUST在清理前保留脱敏instance、launcher log、process observation、elapsed/budget和exact Node audit
- **AND** diagnostic evidence MUST位于既有Candidate diagnostics owner，不得写入旁路store或泄漏instance secret

#### Scenario: Node 或 PATH 漂移
- **WHEN** executable 不是绝对可执行文件、version不满足当前声明、PATH head不匹配或子进程 identity不同
- **THEN** smoke/publish helper MUST在安装、tag或npm publish前 fail closed
- **AND** MUST不依赖硬编码历史复盘中的 Node 版本恢复
