# 共享资源目录自愈

## Why

Windows 用户在准备工作空间时看到原始文件系统错误 `ENOENT: no such file or directory, open 'D:\BuildrData\resources\resource-set.json'`。共享目录已存在但清单缺失或损坏时，普通准备只在目录不存在时才发布共享集，否则把 ENOENT 原样抛出；界面「重试」因此每次得到同一错误。显式更新能修复空目录，但顶层已有 `skills/` 而无清单时仍失败，用户只能手工删除目录。该状态与平台无关，Windows 因数据目录迁移、杀毒软件占用目录改名而更容易进入。

## What Changes

- 共享目录缺少可读清单时按「未准备」处理：普通准备在稳定锁内按当前安装重建完整共享集，不再把原始文件系统错误抛给界面。
- 目录顶层含非 Buildr 自有条目时保留现场，报告真实路径与条目，并提示移走目录后重试，不删除或覆盖自有内容。
- 显式更新对「有目录、无清单」的现场同样接管并替换，不再因顶层 `skills/` 直接失败；有可读清单时继续先做两段式退役保全。
- 目录切换与临时目录清理在 Windows 瞬时占用（`EPERM`/`EBUSY`/`ENOTEMPTY`）时有界重试，失败时恢复原目录并保留可重试现场。
- 工作空间准备把共享集不可用映射为带路径的中文提示与诊断详情，不显示裸文件系统错误。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `shared-package-resources`：普通消费对「无清单目录」的恢复边界，以及目录切换的瞬时占用重试与失败恢复。

## Impact

- `projects/product/services/buildr/src/infrastructure/product-resources/shared-resources.ts`：观察、判定、发布与恢复流程。
- `projects/product/services/buildr/src/modules/workspace/application/workspace-preparation.ts`：共享集错误的用户可见映射。
- `projects/product/services/buildr/test/integration/shared-resources.test.ts`：新增现场恢复与占用重试测试。
- `projects/product/services/buildr/docs/cli-reference.md` 与 `knowledge/docs/guides/getting-started.md`：补充共享集自愈说明。
- 不改变共享集内容范围、版本比较、两段式退役、保留区位置和工作空间采用清单格式。
