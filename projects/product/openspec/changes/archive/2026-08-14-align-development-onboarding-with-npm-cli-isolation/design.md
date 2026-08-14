## Context

Buildr 的 npm-only 模型已把 PATH 默认 `buildr` 定义为 npm installation，并把源码开发入口固定为 checkout 内的 `projects/product/buildr`。但是 `repository-onboarding` 仍调用 `scripts/install-buildr-cli`，该 POSIX 脚本会在临时 PATH 中建立 development wrapper、隐式准备依赖并重复卸载/安装。Windows Node 无法直接执行该无扩展名 POSIX 脚本，且 verifier 在失败前还要复制约 42 MB tracked tree、重新 `git add/commit` 全仓库，导致 dev changed feedback 很晚才暴露错误。

本 Change 只修正 development checkout onboarding 的 primary owner。npm tarball lifecycle、npm-owned Launcher、完整 Candidate 分片和正式发布 workflow 均保持不变。

## Goals / Non-Goals

**Goals:**

- 让 clean-checkout verifier 在 macOS 与 Windows 通过显式 Project bridge验证 development identity、sync、Development Launcher、Doctor 与 update source。
- 明确证明整个流程不改变 PATH 默认 `buildr` 或 `buildr.cmd`。
- 删除失去产品契约的 development PATH CLI 安装/卸载实现与重复测试。
- 缩短 Windows changed feedback 的准备路径，并用真实 timing 判断预算是否需要校准。

**Non-Goals:**

- 不改变 npm CLI、npm-owned Launcher、npm package installation/update 或发布 tarball。
- 不把 repository onboarding 加入完整 Candidate；它仍是 changed/focus/Release 专项 owner。
- 不削减 sync、Development Launcher、Doctor、Git remote 或 update source 的必要行为证据。
- 不处理 retained Finish preflight/prepare 自修复；该问题由独立 Task 与 Change 持有。

## Decisions

### 1. development checkout 只验证显式 Project bridge

Verifier 以 Environment/CI 当前 Host Node设置 `BUILDR_NODE`，在 POSIX 直接执行 `projects/product/buildr`，在 Windows 通过 Git for Windows 提供的 `sh` 执行同一相对 bridge。identity 必须指向 copied checkout 的 `run-development-cli`、Service CLI entry 与当前 Host Node，`wrapperSchema` 必须为空。

不采用“给旧 installer 增加 `.cmd` 版本”，因为这会恢复已被 npm-only 模型禁止的 PATH development installation。也不直接调用 `bin/buildr.mjs` 替代 bridge，因为那不能证明公开的 checkout 开发入口仍然闭合。

### 2. 依赖准备是显式 onboarding 阶段

Clean checkout 使用当前 Host Node旁经过解析的 npm CLI执行 `npm ci --omit=dev --no-audit --no-fund`。依赖准备不再是 CLI installer 的隐藏副作用；npm CLI identity 与 Host Node闭合，且 verifier 不从 PATH 猜测另一个 npm。

### 3. Git candidate snapshot 复用源 repository objects

Verifier 从当前 worktree的 `HEAD` 创建 `git clone --shared --no-checkout`，检出精确 commit，再应用当前 tracked delta与未忽略 untracked files。只有实际 delta需要重新形成临时 candidate commit；随后把 origin改绑到临时 bare remote并继续真实 sync/push 检查。

相较全目录 `fs.cpSync` 后重新初始化 Git，此方案仍覆盖 clean checkout、当前未提交 Content Target、删除与新增文件、临时 remote和 managed projection commit，但避免在 Windows 重复复制、索引和压缩整个 tracked tree。

### 4. PATH 零 mutation 使用双 sentinel 证明

临时 PATH 前置目录同时放置 `buildr` 与 `buildr.cmd` sentinel。完整 onboarding 完成后逐字节核对两者未变。该证据覆盖 POSIX 与 Windows 常见命令形态，并防止未来又把依赖准备或 self-bootstrap 偷渡回 PATH installer。

### 5. 预算先优化后校准

`budgetMs` 继续是非阻断目标，而不是正确性 timeout。先删除重复 repository copy、全量 Git 建库和安装/卸载/重装，再在Change收敛前收集多轮本地成功timing。只有稳定中位数和波动范围证明15秒目标不现实，才调整registry target与调度成本；不得以调高预算替代覆盖核对。最终source SHA只在converge/archive后的Formal Task Content Target形成，因此hosted Windows feedback由Task Verification对最终SHA执行一次，不作为archive前checkbox或预算猜测输入。

## Risks / Trade-offs

- [Windows runner 缺少 `sh`] → GitHub Windows runner本身以 Git checkout为前提并提供 Git for Windows；verifier在入口阶段明确失败并给出 command，而不回退到直接调用内部 CLI。
- [`--shared` clone 依赖源 object store] → 临时 checkout只在同一 verifier生命周期内使用，源 worktree在测试期间保持存在；新 candidate/sync commits写入临时 repository自己的 object store。
- [本地 dirty tree含未跟踪源码] → 显式复制未忽略 untracked files并把 candidate delta提交到临时仓库；ignored runtime、`node_modules`与 Workspace local state保持排除。
- [删除 installer影响未知消费者] → static search、registry inventory与 release/self-bootstrap contract test共同证明支持路径已迁移到显式 Project bridge；任何遗留引用在 changed/contract验证中 fail closed。
- [单机 timing波动] → Change内只按多轮成功数据校准非阻断目标，单次over只记录warning；最终hosted Windows timing作为Task Verification证据，不倒写已归档Change。

## Migration Plan

1. 更新 canonical requirement 与验证 owner文档，声明显式 bridge和 PATH 零 mutation。
2. 重写 repository onboarding fixture，显式准备依赖并采用 Git candidate snapshot。
3. 删除 legacy installer/uninstaller、POSIX-only System test及 registry/suite/static residue。
4. 运行 OpenSpec strict、契约/plan、clean-checkout focus与changed验证，并按多轮本地成功timing保留或校准非阻断target。
5. deterministic converge/archive后形成Formal Task Content Target；只对该最终source SHA执行一次hosted Windows development feedback。若Windows入口或candidate snapshot失败，回到同一Task修复并重新形成Content Target，不得恢复PATH development installer。

## Open Questions

无阻塞设计问题。目标预算的最终数值由本 Change成功验证数据决定，而不是预先指定。
