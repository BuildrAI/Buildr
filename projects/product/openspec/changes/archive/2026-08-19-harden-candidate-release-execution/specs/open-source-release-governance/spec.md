## ADDED Requirements

### Requirement: Publication 必须从已完成 Task 的权威环境事实重建
Buildr release preparation MUST消费 matching Task Environment Plan/Receipt 中已验证的 Service preparation declaration、recipe、inputs 与 identity。Task Finish MAY按现有 contract cleanup execution root；后续 publication MUST从冻结 commit、已保存 Environment facts 和同一权威 recipe重建 clean hosted environment，并 MUST NOT在 Product 根或其他未声明 cwd 另行运行依赖准备。

#### Scenario: Release Task Finish 已清理 worktree
- **WHEN** 完成的 release Task 仍有可读 cleaned Environment Receipt且 publication 得到明确授权
- **THEN** release runner MUST验证 plan identity、`service:product/buildr` recipe、Service lockfile inputs 与 source commit
- **AND** workflow MUST在冻结 Buildr Service root按同一 recipe语义重建依赖
- **AND** MUST NOT恢复旧 worktree或在 `projects/product` 执行 `npm ci`

#### Scenario: recipe、cwd 或 lockfile 不匹配
- **WHEN** Environment Receipt 缺少 required recipe、冻结 source缺少 Service lockfile、cwd不是声明的 Service root或 input identity漂移
- **THEN** release preparation MUST在 dispatch 或 npm mutation 前确定性失败
- **AND** diagnostic MUST指出 expected selector、recipe、cwd、input 与 actual fact

### Requirement: Candidate 与 Release 子进程必须共同冻结 exact Node executable 和 PATH
Buildr MUST由一个共享 execution environment helper同时绑定权威 Node executable、对应 bin 的 PATH 首项、npm shim与可审计 Node identity。本地 Candidate、release prepare、tarball/Registry smoke和 hosted publication helper MUST复用该 contract；任何 consumer MUST NOT只冻结父进程 executable而让子进程从会话 PATH 解析其他 Node。

#### Scenario: inherited PATH 含另一个 Node
- **WHEN** 权威 executable 与 inherited PATH 中首先可见的 Node 版本或路径不同
- **THEN** 父进程 MUST使用权威 executable
- **AND** 所有子进程执行 `node`/`npm` 时 MUST解析到同一 Node bin
- **AND** evidence MUST输出 executable、version、bin 与 PATH head identity

#### Scenario: Node 或 PATH 漂移
- **WHEN** executable 不是绝对可执行文件、version不满足当前声明、PATH head不匹配或子进程 identity不同
- **THEN** smoke/publish helper MUST在安装、tag或npm publish前 fail closed
- **AND** MUST不依赖硬编码历史复盘中的 Node 版本恢复

### Requirement: Release transaction evidence 必须提供正式关联与可验证 readback
Buildr MUST以 closed release transaction context/evidence schema关联 source release Task、其 retrospective sources、显式 support Tasks、Candidate source SHA/workflow/run、publish workflow/run、main/dev收敛提交、tag、npm version/dist-tag、GitHub Release与Registry smoke。context MUST由Task/Application与GitHub/Git/npm正式读模型形成；terminal evidence MUST保存在既有 release evidence artifact，并 MUST提供按 publish run读取和验证的 portable inspect结果。

#### Scenario: dispatch 正式 release transaction
- **WHEN** 维护者明确授权 publication 且runner准备dispatch唯一 protected workflow
- **THEN** runner MUST在dispatch前验证 release/support Tasks、retrospective source、Candidate run/source、Git bridge与Environment binding
- **AND** workflow input MUST携带 canonical closed context及其 digest
- **AND** Task Record MUST只保留既有顶层/Parent/retrospective事实，不得复制关联正文

#### Scenario: 读取完成的发布链路
- **WHEN** 调用方按 publish run ID执行 release transaction inspect
- **THEN** read model MUST下载同一 run 的正式 evidence artifact并校验 context digest、source/workflow/run/attempt和公共发布事实
- **AND** result MUST同时返回 release/support Tasks、Candidate、publish、bridge、tag、npm/GitHub Release与Registry smoke关联
- **AND** 不匹配、缺失或跨 run evidence MUST fail closed

#### Scenario: transaction 在公共写入前失败
- **WHEN** workflow 在 tag/npm mutation 前失败
- **THEN** evidence MUST保留已确认的 context、Candidate与publish run facts及失败阶段
- **AND** recovery MUST指向同一 transaction run/attempt或明确的新 attempt，不得删除tag、重发旁路 workflow或伪造完成关联
