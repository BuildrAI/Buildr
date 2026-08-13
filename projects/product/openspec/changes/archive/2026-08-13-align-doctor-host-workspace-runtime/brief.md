# 对齐 Doctor 的 Host Node 与 Workspace Node 契约

Buildr 当前正式主进程只使用 npm Host Node，Workspace-owned subprocess 使用精确声明的 Workspace Node。此 Change 删除一条遗漏的 Product Node/platform Doctor 正向承诺，使 canonical spec 与 npm-only 产品、实现和验证真值一致。
