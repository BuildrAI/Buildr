## Why

rc.20 已证明 Candidate 的业务根因是测试入口递归，但现有 core-macos 在单个 capability 不退出时缺少即时完成事件、心跳、独立超时、完整进程组回收和增量 evidence，使局部错误退化为约 36 分钟黑盒停滞。发布准备、Task Environment cleanup、精确 Node/PATH 与发布关联 evidence 也分别采用不同所有权假设，导致恢复步骤和最终事实需要人工拼接。

## What Changes

- 为 Candidate capability 增加即时完成事件、周期心跳、按类型校准的墙钟超时、TERM→KILL 进程组回收和原子增量 checkpoint；最终 aggregate 仍只接受完整、同源、同 artifact 的 closed shard evidence。
- 为测试夹具增加产品 CLI 入口不变量，禁止把 Node test 文件当作 `currentProductInvocation`，retained 场景显式绑定 delivered `bin/buildr.mjs`。
- 将 core-macos 拆为 4 个语义 shard，并用 registry/workflow contract 保证每个原 capability 恰好一个 owner；对 Task Finish/self-bootstrap 等重型 owner 收敛 workspace-saturating 资源声明。
- 对当前 50ms `ps` 进程树采样建立可复核基准；只有同 tree 数据支持时才调整采样周期/缓存，且不删除进程追踪。
- 提供统一 exact Node execution environment：父进程使用 Environment 声明的 executable，同一 Node bin 置于子进程 `PATH` 首位，并输出可审计 identity；Candidate、本地/发布 smoke 与 release helper 复用同一实现。
- 明确采用“publish 从冻结 commit、Task Environment Plan/Receipt identity 与权威 Service preparation recipe 重建”的唯一 Release 环境模型；删除 Product 根目录 `npm ci` 指引并对 lockfile、cwd、Node/PATH 漂移 fail closed。
- 将现有 release transaction evidence contract 扩展为可 inspect/readback 的正式关联模型，关联 release/support Task、retrospective source、Candidate source/run、publish run、main/dev 收敛、tag、npm/GitHub Release 与 Registry smoke；不扩张 Task Record 顶层事实或通用 Execution Record owner。
- 本变更不包含破坏性公共发布行为；既有 Candidate 覆盖、macOS 验证与 GitHub protected publish authority 均保持。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 增加 capability 级止损、增量 evidence、语义分片、资源互斥和采样基准要求。
- `open-source-release-governance`: 统一发布环境重建、exact Node/PATH 与 release transaction 关联 evidence/readback contract。

## Impact

- Candidate registry、DAG/parallel runner、process lineage/cleanup、evidence writer、aggregate contract 与 `.github/workflows/verify.yml`。
- Task Finish retained fixture、release smoke、release helpers、`.github/workflows/publish.yml` 与 `buildr-release` Skill。
- OpenSpec 规范、current knowledge、release checklist、自动化 contract/integration/system tests。
- 不新增数据库表，不修改 Task Record/Retrospective 顶层 schema，不发布 npm 或 GitHub Release。
