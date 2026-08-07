## Context

当前 launcher builder 对 `release` 和 `development` 使用同一套自包含 bundle：复制 Node executable、Node 动态库、Buildr `src/`、`package/` 和依赖。`Buildr Dev` 虽然来源标记为 checkout，实际运行的是安装时快照；这使 Node runtime 成为约 110 MB 的主要体积，并造成源码修改后的快照滞后。

本 Change 只调整 development channel。Release launcher 必须在没有 Node、npm、PATH 或 Buildr checkout 的普通机器上启动，因此保持当前自包含模型。

## Goals / Non-Goals

**Goals:**

- `Buildr Dev` 绑定安装时的 Buildr Service checkout，启动其 `bin/buildr.mjs`。
- Development bundle 只保留平台启动入口、图标和 identity，不复制 Node、动态库、Buildr source 或依赖。
- 使用安装时由 canonical development CLI 解析出的 Workspace-managed Node，并在启动前验证路径和版本。
- 保留单实例、4317 端口、health handshake、staging/verify/switch、旧实例安全停止、回滚和 status 诊断。
- 源码修改后重启 Dev App 即读取当前 checkout，不要求重新复制 Node 或 Buildr source。

**Non-Goals:**

- 不改变 Release launcher 的自包含保证。
- 不让 Dev launcher 自动跟随任意 task worktree，不创建常驻多实例管理器。
- 不在启动时自动下载或升级 Node；缺失 runtime 只报告并建议 `sync`/重新安装。

## Decisions

### 按 channel 分离构建

`buildLauncher` 根据 channel 选择构建模式。Release 继续复制 runtime 和完整 Buildr application；Development 生成 thin launcher，并在 identity 中保存 source root、checkout identity、Node executable 和版本。这样 Release 行为不会被开发优化影响。

### 绑定 checkout 而不是源码快照

Development 脚本启动 `sourceRoot/bin/buildr.mjs app --port 4317`，把 source root 作为工作目录。启动前校验 source root、入口和 identity；允许 checkout 的 HEAD/dirty 状态自然变化，status 输出 observed checkout，不因每次源码编辑要求重装 launcher。

### 使用受管 Node 的已解析路径

安装入口使用 Workspace-aware development CLI 解析当前 checkout 的 Node，并把 executable 与版本写入 development identity。启动时只使用该路径并 probe 版本；路径或版本不匹配时 fail closed，不选择另一个 PATH Node，也不静默下载。

### 保留原子替换

Thin bundle 仍经过 staging、验证、旧 development 实例停止、原子切换和 rollback。macOS 使用 shell launcher，Windows 使用 `.cmd`/VBS launcher，只改变资源来源，不改变端口、日志、health handshake 或 Release 安装目标。

## Risks / Trade-offs

- [checkout 被移动或删除] → status/启动诊断报告 source root，并建议从当前 checkout 重新安装。
- [受管 Node 被删除或漂移] → 启动前 probe 失败并建议 `buildr sync`，不回退到 PATH Node。
- [checkout 依赖未准备] → 报告入口/依赖错误；依赖准备仍由 Environment/CLI 负责。
- [平台脚本转义差异] → 测试覆盖带空格 source path、日志、端口、identity 和失败反馈。
- [源码修改后仍需重启服务] → 文档明确无需重打包，但已运行的 Node 进程仍需重启。

## Migration Plan

1. 更新 builder、identity、status 和双平台 tests；Release fixture 继续证明自包含。
2. 从现有 development launcher 安全切换到 thin checkout-backed bundle，保留 `.previous` rollback。
3. 启动新 Dev App，验证 checkout、Node、health handshake 和 Workspace Registry。
4. 新 launcher 启动失败时恢复上一已验证的 development bundle；Release launcher 不参与切换。

## Open Questions

- 是否以后将 Dev source root 从绝对路径升级为可重新定位的 checkout registry 引用；本 Change 先保持安装时绝对路径。
