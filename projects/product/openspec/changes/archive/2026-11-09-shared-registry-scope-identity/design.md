# 设计

## 关键取舍

### 按文件身份而非覆盖变量判定共享范围

共享范围的真实不变量是"本次写入的就是该 Profile 的共享长期登记文件"。`overridden` 只是"是否声明了覆盖"的代理信号，当覆盖变量指向共享数据根本身时失真。改为：

```
isSharedRegistryScope() =
  sameFilesystemPath(本实例登记文件, 该 Profile 的共享长期登记文件)
```

`sameFilesystemPath` 复用既有 `filesystem-path-identity`，按 `realpath` 归一符号链接（如 `/var` 与 `/private/var`），与登记去重所用身份一致。

共享长期登记文件默认按 Profile 默认数据根计算：用注入的 `resolveWebProfile(productIdentity, { env: 去除 BUILDR_APP_DATA_DIR })` 得到默认数据根，再拼 `workspace-registry.json`。这样：

- 真实开发版/正式版（无论是否设覆盖变量，只要数据根即默认根）→ 同一文件 → 共享范围 → 拒绝临时根。
- 预览实例、指向独立目录的覆盖与测试环境 → 不同文件 → 非共享 → 允许临时位置。

### 可测试性

新增可选 option `sharedProfileRegistryFile`，默认按上式计算；测试可注入一个受控的"共享登记文件"路径，配合 `webProfile.dataRoot` 模拟共享或隔离范围，无需指向真实 `Buildr Dev` 目录，也不再靠强制 `overridden=false` 的旧 hack。

### 测试辅助工具强制隔离

`runBuildr`/`runBuildrAsync` 去掉 `|| process.env.BUILDR_APP_DATA_DIR` 条件：未显式传 `options.env` 时一律造隔离数据根（目标旁 `app-data` 或临时目录），并以该值覆盖继承的环境变量。调用方显式传 `options.env` 的路径保持不变。干净环境下行为与原先一致；智能体环境下不再继承真实数据根。

## 兼容策略

- 未设覆盖变量的真实实例：数据根即默认根，判定不变（仍共享、仍拒绝临时根）。
- 真正隔离的预览/测试：登记文件不同于共享文件，判定不变（仍允许临时位置）。
- 唯一行为变化是原本错误放行的"覆盖变量指向共享数据根"情形，现在正确拒绝。无数据迁移；既有污染条目不在本变更内自动清理。
- 预览只读合并共享登记（`resolvePreviewSharedRegistryFile`、owner 判定）不改。

## 迁移风险

- 风险低：判定收紧只影响临时根写入共享文件这一非法情形；合法真实工作空间登记不受影响。
- 依赖 `isSharedRegistryScope()` 的两处（`registerLocalWorkspace`、workspace preparation `select`）同步受益，无需各自改动。
- 测试需同步更新共享/隔离 profile 构造方式，否则旧 `overridden=false` hack 在新判定下不再代表共享范围。
