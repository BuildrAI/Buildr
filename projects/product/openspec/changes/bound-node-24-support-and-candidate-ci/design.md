## Context

当前 CI 把开发反馈和候选发布证明混在同一条长链路：Windows 平台问题需要等待完整候选矩阵才能获得反馈，修复后又会重新运行与本次问题无关的 macOS 和发布包生命周期。最近的失败还表明，Windows 短路径/长路径身份、Node 脚本启动、路径断言和可执行权限分别在多个入口自行实现，单点修复无法证明整条平台语义已经收口。

与此同时，产品实际只验证 Node 24，但 `engines.node: >=24.15.0` 会把未来 Node 主版本也纳入公开兼容承诺。受管 Workspace runtime 已固定到 24.15.0，两种声明需要明确区分：前者是产品兼容范围，后者是 Workspace 可复现的精确运行时身份。

## Goals / Non-Goals

**Goals:**

- 将任务分支的 Windows 定向预检与最终候选发布证明分开。
- 最终候选保留 macOS/Windows 与最低/当前 Node 24 的四个完整矩阵，并让失败矩阵互不取消。
- 统一 Windows 文件系统身份、Node 脚本启动和平台相关文件模式判断，整批消除同类缺陷。
- 公开只承诺已验证的 Node 24 范围，同时保持 Workspace runtime 的精确版本可复现性。

**Non-Goals:**

- 不在本 Change 中发布候选版、创建 tag 或修改 npm dist-tag。
- 不承诺或适配 Node 25 及后续主版本。
- 不通过延长完整 CI 超时掩盖确定性的 Windows 平台错误。
- 不删除 release smoke 能力；只删除与完整 Candidate 重复的独立 CI 作业。

## Decisions

### 使用两级 CI，而不是每次运行完整候选矩阵

合入 `dev` 前仅运行 Windows × Node 24.15.0/当前 24.x 的定向平台预检，覆盖已识别的高风险边界及 Candidate tarball 生命周期。`dev -> main`、手工候选验证和 `main` push 才运行四个完整 `test:candidate` 作业。这样缩短 Windows 修复反馈，同时不降低最终候选证明。

备选方案是继续对每个任务分支运行完整矩阵；它提供的覆盖更广，但重复验证稳定的 macOS 路径，不能解决平台问题反馈过慢。

### Candidate 内置 release smoke 是唯一候选冒烟 owner

四个完整 Candidate 已包含 `release-tarball-smoke`，因此删除两个独立 `release-smoke` 作业。standalone verifier 和本地入口仍保留，供定向诊断或没有共享 tarball 的场景使用。

备选方案是保留独立作业以更早反馈，但它不会增加最终覆盖面，并会重复打包和安装生命周期。

### 平台身份和启动语义必须有共享 owner

文件系统身份比较统一使用 checkout identity 基础设施提供的平台感知比较；Windows 允许短路径、长路径和大小写差异在解析后表示同一对象。Node 脚本统一通过当前 Node executable 和脚本参数启动，测试夹具不得依赖 Windows 直接执行无扩展名脚本。runtime 文件一致性由一个平台感知 helper 判断，Windows 不把 POSIX executable bit 当作 stale 依据。Buildr 初始化的 Workspace 同时写入 `.gitattributes`，固定文本资产以 LF 检出，避免新 worktree 在 Windows 上把组件字节身份改写为 CRLF。

备选方案是继续在每个调用点增加 Windows 特判；这种做法会产生新的分叉，无法形成可审查的统一语义。

### 产品兼容范围限定到 Node 24

`engines.node` 改为 `>=24.15.0 <25`，安装入口、错误信息、锁文件和公开说明保持一致。Workspace metadata 仍保存精确 24.15.0，普通 sync 不自动升级。未来 Node 主版本必须通过独立 Change 明确加入范围。

备选方案是保留无上限范围并把 CI 结果理解为“尽力兼容”；这会让公开契约超过实际验证证据。

## Risks / Trade-offs

- [任务分支不再运行 macOS 完整 Candidate] → macOS 由最终候选四矩阵阻断；跨平台实现改动仍须先运行本地 affected/full 验证。
- [Windows 定向预检选择器漏掉新的平台 owner] → 预检以稳定 step/group 注册表声明，并用架构测试约束入口；最终 Candidate 继续无条件覆盖全部 step。
- [Node 25 用户升级后被拒绝] → 安装和诊断信息明确支持范围；Node 25 适配完成后通过独立 Change 扩展范围。
- [统一路径身份可能把不同字符串视作同一目录] → 仅在目录/checkout 身份语义使用共享比较，展示值和普通内容字段继续保留原始字符串。

## Migration Plan

1. 在独立 Task worktree 中完成共享平台语义和回归测试。
2. 同步 `engines.node`、锁文件、安装检查、公开说明和 current knowledge。
3. 调整 CI 触发分层并删除重复作业，先通过本地受影响和完整验证。
4. 任务分支通过目标为 `dev` 的临时验证 PR 运行 Windows 两版本定向预检；通过后再正式收尾合入冻结的 `dev`。
5. 发起 `dev -> main` 候选 PR，运行最终四矩阵候选验证并停在发布边界，不创建 release tag。
6. 若定向预检失败，停留在任务分支修复；若最终矩阵失败，完整汇总所有失败后回到独立 Task，不在单个作业内即时修改。

回滚时可恢复旧 CI 触发和 `engines.node` 声明；平台语义修复与新增测试可以保留，因为它们不依赖新 CI 拓扑。

## Open Questions

无。
