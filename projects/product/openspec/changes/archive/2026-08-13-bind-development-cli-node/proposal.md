## Why

原始发布任务已完成代码交付但自举收尾仍被默认 CLI runtime identity 阻塞。前一个修复 Task 只验证了局部错误，没有在正式交付前演练完整自举闭环，导致 Node 绑定问题直到 post-Finish 才暴露；本 Change 必须修复该缺陷并把整条恢复链作为单一完成门禁，禁止继续形成症状驱动的递归修复 Task。

## What Changes

- 将 development CLI 安装结果改为本机薄 wrapper，持久绑定已验证的 Node executable 与 retained checkout canonical entry。
- 通过同目录临时文件和原子替换刷新 Buildr-owned wrapper；兼容迁移既有 managed symlink，但拒绝覆盖 foreign file/symlink。
- 卸载只移除当前 Buildr-owned wrapper 或可证明的 legacy managed symlink。
- 在修复 Task Finish 前完整演练 CLI 安装、精确 Node identity、Buildr Web Dev Launcher、workspace sync、Doctor ready 与原始 Finish resume preflight。
- 若闭环出现与本 Change 无关的新问题，保持原始 Task 阻塞并停止报告，不创建下一个递归修复 Task。
- 不改变 npm 正式分发、npm Launcher、Workspace Node 或 Buildr Web runtime 契约；无破坏性公开 CLI 变化。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-cli-self-update`: 自举 development CLI 刷新必须把已验证 retained Node 持久绑定到默认 CLI wrapper，并在交付前证明完整自举恢复闭环，而不能在后续启动时重新从 PATH 选择或逐症状递归交付。

## Impact

- 影响 `buildr` Service 的 development CLI 安装/卸载脚本、自举 closeout 的默认 CLI identity gate、安装与 onboarding/自举验证。
- 本机 `~/.local/bin/buildr` 从 managed symlink 迁移为 closed Buildr-owned wrapper；npm package 入口和公开 Launcher 不受影响。
- 原始 `optimize-platform-release-artifacts` Finish 在闭环验证和当前修复交付前继续保持 blocked。
