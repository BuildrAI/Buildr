## Why

Buildr 已经用单一 `openspec converge` 事务取代旧 OpenSpec baseline/stage sidecar workflow，并把 Skill source authority 收敛到 workspace；继续保留三个 Legacy CLI 会维持两套相互矛盾的路径、扩大产品表面，并让新 consumer 继续依赖已退役的数据模型。现在应按用户明确决定完成破坏性清退，使 CLI 只保留当前 authority。

## What Changes

- **BREAKING** 删除 `buildr openspec baseline create` 与 `buildr openspec check`，同时删除旧 baseline/pre-sync sidecar 的创建、阶段检查、公开 JSON schema、deprecation registry 和兼容测试。
- 修改 OpenSpec Component/Skill consumer：apply 前只使用上游 strict validation、Planning Review 与当前 Change artifacts；最终冲突、expected tree、canonical drift、写后确认和 archive 继续只由 `buildr openspec converge` 持有。
- **BREAKING** 删除 `buildr skills migrate-project-assets --check|--apply` 及 Project Skill 自动迁移实现，不再复制或删除 legacy Project Skill source。
- 删除 Doctor、render、Skill mutation 和文档中指向 Project Skill migration 的恢复建议；遇到 legacy Project Skill source 时保持 fail closed，并明确当前版本不再提供自动迁移。
- 删除 CLI 的 `legacy` surface 与根帮助 Legacy 分组；剩余命令只属于 `primary`、`agent-machine` 或 `maintenance`。
- 更新产品规范、current knowledge、package/runtime assets、测试和 changelog，不保留兼容 alias、隐藏入口或第二 writer。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cli-product-surface`: 删除全部 Legacy CLI 与 legacy surface，规定已删除命令的零写入 unknown-command 行为，并收敛 OpenSpec 与 Skill source 的当前入口。
- `buildr-package-assets`: 更新随包 OpenSpec Component、Buildr Skill 与 runtime source，使新安装和 sync 不再投射 Legacy CLI 指引。

## Impact

- CLI registry、OpenSpec/Skills Application handlers、JSON contracts、Doctor/runtime diagnostics。
- OpenSpec Component contributions、`openspec-contract-guard`、产品入口 Buildr Skill 及 package integrity。
- CLI architecture/compatibility、capability migration、Doctor、package 和 OpenSpec convergence tests。
- 产品说明、CLI reference、JSON contracts、Skill capability contracts、current knowledge 与 changelog。
- 旧脚本调用三个命令时将收到标准 unknown-command；含 legacy Project Skill source 的旧 workspace 不再有自动迁移路径，需要在升级前自行完成 source 整理。
