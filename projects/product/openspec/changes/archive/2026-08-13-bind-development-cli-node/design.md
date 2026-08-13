## Context

`scripts/install-buildr-cli` 接受并校验 `--node-executable`，但当前只把 `~/.local/bin/buildr` 链接到 `run-development-cli`。后者启动时再次扫描 PATH，因而安装 evidence 与真实默认 CLI identity 可以分叉。该问题在前一个局部修复 Task Finish 后才由原始 closeout runner 暴露，证明完成门禁缺少最终本机投射的端到端演练。

## Goals / Non-Goals

**Goals:**

- 安装出的默认 development CLI 精确绑定已验证 retained Node 与 checkout entry。
- 入口可原子刷新、可验证 ownership、可安全卸载，并兼容迁移旧 managed symlink。
- 在当前修复 Task 交付前证明完整自举恢复闭环，不再按症状拆分 Task。

**Non-Goals:**

- 不改变 npm 正式 package、npm-owned Buildr Web Launcher 或 Workspace Node。
- 不把本机 wrapper 变成新的产品安装或更新渠道。
- 不恢复 SEA、PKG、MSI 或平台签名范围。

## Decisions

1. 安装器写入带 closed marker 的 POSIX shell wrapper，内容只保存绝对 retained Node 与 `run-development-cli` 路径，并通过 `BUILDR_NODE` 调用现有 canonical launcher。相比新增 Node wrapper 或复制 CLI，这保留单一实现并让 identity probe 继续由 `run-development-cli` 提供。
2. wrapper 先写入目标目录内权限为 `0755` 的临时文件，再以原子 rename 替换。只接管当前 marker 可验证的 wrapper、精确 canonical/legacy symlink，或 package identity 可证明的旧 Buildr symlink；其他目标 fail closed。
3. uninstall 使用相同 ownership reader，只移除 managed wrapper/symlink。marker 只是候选，closed 字段和精确 source path 必须共同通过，避免仅凭一行文本接管 foreign file。
4. 验证分两层：脚本级系统测试覆盖原子刷新、Node identity、迁移与拒绝；修复 Task 的自举门禁在真实 retained 投射上演练 CLI、Launcher、sync、Doctor 与原 Finish resume preflight。只有两层均通过才允许 Finish。

## Risks / Trade-offs

- [绝对路径随 checkout 清理失效] → development CLI 本来就是 checkout-backed；status/identity fail closed，并由同一 installer 在 retained checkout 刷新。
- [wrapper 内容中的特殊字符导致 shell 注入] → 使用严格单引号转义，只写已验证绝对路径，不拼接用户命令文本。
- [并发安装留下部分文件] → 只在同目录创建临时文件并原子 rename，失败时清理精确临时文件。
- [闭环演练触达 canonical 自举状态] → 只由唯一 self-bootstrap runner 和已绑定原 Finish evidence 执行；普通测试使用隔离目录，不手工拆分副作用。

## Migration Plan

1. 安装器识别旧 managed symlink并原子替换为 owned wrapper。
2. 重复安装刷新 Node/checkout绑定；foreign目标保持不变。
3. 定向和正式验证通过后，在修复 Task Finish 前执行完整自举恢复演练。
4. 若演练出现无关问题，停止并保留原始 Finish blocked，不再自动创建修复 Task。

## Open Questions

无。
