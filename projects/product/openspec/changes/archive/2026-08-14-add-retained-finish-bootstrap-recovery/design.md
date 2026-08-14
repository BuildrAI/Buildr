## Context

Task Finish 的 canonical Application、SQLite repository、Execution Record 与五阶段状态机来自 retained runtime，Product phase provider 只在真正执行 phase 前延迟加载。这个边界允许在不运行 candidate CLI 的前提下替换 provider，但候选模块仍是可执行代码，且可以通过 retained runtime 发起 Product phase 所需的效果。

当前草案把 capsule 创建放在 pre-registry dispatcher 中，导致它早于完整 registry、Execution Record open gate 和 current Environment/Development 校验产生恢复资源；恢复时也只复核入口文件 digest。cleanup 又在 phase output 持久化前删除包含 manifest 的 capsule，存在进程中断后无法判断 authority 是否已撤销的窗口。

## Goals / Non-Goals

**Goals:**

- 恢复已有 run 在 `preflight` 或 `prepare` 的确定性 Product phase-provider 执行缺陷。
- 保留 retained Application/repository/runtime 的 canonical writer provenance。
- 在任何候选代码 import 前闭合 run、Environment、Development/Candidate/Content Target 与完整 capsule Git identity。
- 让 failed/blocked、capsule 撤销与 terminal finalize 中断都能复用同一 run。
- 只增加 run-owned transient 和 additive Result evidence，不增加第二状态 authority。

**Non-Goals:**

- 恢复 CLI entry、registry、Task Finish Application、repository、migration 或 Structured Store 损坏。
- 把 candidate provider 当作 sandbox；本设计信任的是经过正式 Development/Verification/Review 的冻结候选代码，而不是任意调用方代码。
- 替代 Delivery Adaptation、target-race、retained Doctor self-bootstrap 或 Task Environment cleanup。
- 支持 caller source/module/manifest/tarball、candidate CLI、npm pack/install、shell 或递归恢复 Task。

## Decisions

### 1. 在 retained Application 内选择恢复路径

`task finish run` 的完整 registry 不会提前导入 Product phase provider，因此不需要 pre-registry recovery dispatcher。CLI 只解析 `--bootstrap-recovery` 并调用同一 retained Task Finish Application；Application 在正常 executor import 点之前选择 retained provider 或 capsule provider。

这样可以直接复用完整 retained runtime 的 Task Environment、Task Development、Execution Record 和 repository authority，也保证 registry/Application/repository 损坏会在任何 capsule side effect 前停止。

### 2. 只接受状态机标记的 provider execution failure

状态机在调用 phase handler 时捕获异常，并把 `origin: product-phase-provider` 写入 compact failure。首次 recovery 只接受：

- existing current run；
- failure phase 为 `preflight` 或 `prepare`；
- failure origin 为 `product-phase-provider`；
- run 为 `failed|blocked`，后续 phase 未执行；
- 无 carrier、lease、equivalence、delivery、prepared completion、completion 或 cleanup fact。

普通 readiness finding、retained dirty、handoff stale、外部暂态、语义审查或低于 Application/repository 的失败不满足该 predicate。failed phase 在同一 run 内重置并保留原 attempt；blocked run 保留当前 Product resume token。

### 3. 先闭合只读 authority，再通过 record gate 创建 capsule

在创建 capsule 前，retained Application 必须：

- 由 current Environment read model 证明 Task、canonical Workspace、ready Receipt 和 execution root 精确匹配 run；
- 由 Task Development Application 证明 handoff、Candidate/generation 与 Content Target current；
- 证明 source 是非 symlink、clean、committed、与 canonical Workspace 共享同一 Git common directory的 checkout；
- 重新观察冻结内容，证明 source bytes 仍等于 run 的 Content Target identity。

这些检查只读。只有独立 Finish Execution Record open 成功后，才允许创建或复用 capsule、写 manifest 或把 bootstrap facts绑定到 run。

### 4. capsule 使用完整 Git identity，不把导出函数冒充 sandbox

capsule 位于 `.buildr/transient/task-finish/bootstrap-recovery/<run-id>/<identity>/`：

- `authority.json` 位于 source checkout 外，记录 run、handoff/Candidate/Content Target、Environment root、source commit/tree、provider path/digest、retained controller 与显式授权 identity；
- `source/` 是同一 repository 的 detached shared-object clone；
- `revocation.json` 与确定性 quarantine path记录撤销恢复事实。

首次和每次 resume/import 都验证 source HEAD、tree、cleanliness、provider path/digest与manifest identity。ES module import 会执行 provider 模块及其本地依赖闭包，文档不得声称只执行一个导出函数。Application 只向 provider 传入精确 allowlist 的 retained runtime façade；candidate CLI 不运行，caller 不能选择 executable source。

若进程在 capsule 创建后、run 绑定前退出，下一次调用只能在所有 identity 完全一致时接管同一个 deterministic capsule；否则 fail closed，不创建第二份资源。

### 5. Application 保持 run 与 writer ownership

Application 把 bootstrap provenance 持久化到同一个 current run，然后从受验证 capsule import `createTaskFinishProductHandlers`。`executeFinishRun`、phase persistence、resume token、Task Record completion、terminal association和SQLite finalize都继续使用 retained implementation与repository。

provider façade只暴露当前 Product phase 所需方法；它不改变 Structured Store 的 retained `sourceRoot`。不过候选模块仍是可信 Product 代码，不把 façade描述为通用安全 sandbox。

### 6. capsule 撤销由 retained finalizer 完成

candidate cleanup handler只完成既有 Environment cleanup、Delivery Carrier cleanup、Task Record completion和prepared completion，不删除 capsule。

当 cleanup phase 已持久化为 passed 后，retained run finalizer才处理 capsule：

1. 验证外置 authority manifest和source identity；
2. 原子把`source/`移到确定性 quarantine path，撤销原 executor URL；
3. 原子写入`revocation.json`并把 revocation evidence持久化到run；
4. 尽力删除quarantine；失败只记attention；
5. 最后提交terminal SQLite state。

撤销前失败保留完整 source供同一run resume。rename后进程退出时，外置manifest与确定性quarantine足以证明已撤销并补写tombstone。terminal finalize失败时，所有phase已经passed且provider authority已经撤销，后续resume只运行retained finalizer，不再import candidate provider或重放phase。

### 7. 不复制既有 capability authority

Task Environment 已独占Receipt-bound cleanup，Workspace Structured Store 已独占writer provenance；本Change不修改两者的Requirement。新增规范只放在`task-finish-execution`、`cli-product-surface`和`product-agent-skills`，避免一项事实出现多个delta authority。

## Risks / Trade-offs

- **风险：候选provider是可执行代码。** → 只接受current正式Candidate、完整Git identity、显式授权和封闭来源；文档不承诺sandbox。
- **风险：provider failure分类过窄，某些逻辑bug不能恢复。** → fail closed；只扩展稳定machine evidence，不用Agent推理替代产品资格。
- **风险：文件系统撤销与SQLite不能形成同一事务。** → cleanup phase先持久化、manifest外置、确定性quarantine+tombstone、retained-only finalize resume闭合崩溃窗口。
- **风险：shared clone依赖源objects。** → capsule是同repository、短生命周期run-owned transient；每次使用重新核验commit/tree并在terminal前撤销。

## Migration Plan

1. Additive扩展failure origin、run bootstrap provenance和Result projection；旧run无字段时保持普通Finish语义。
2. 在Application中接入flag、资格、record gate后capsule创建与受限provider façade。
3. 将capsule撤销从Product executor移到retained run finalizer，并实现幂等撤销/terminal-only resume。
4. 更新Task Finish Skill、contract、CLI help和产品文档。
5. 增加focused unit/integration/contract测试和最小affected development feedback。
6. 不需要数据库migration或数据回填；未授权/不适用run保持原行为。

## Open Questions

无。若未来需要恢复Application/repository/migration层，应建立独立能力，不扩大本入口。
