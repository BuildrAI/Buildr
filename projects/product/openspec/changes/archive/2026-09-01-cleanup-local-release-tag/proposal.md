## Why

正式发布成功后，本地同名 Tag 只是远端正式 Tag 的可重建投射，不应作为必需本地资源长期保留。当前 closeout 已清理本地发布分支、生命周期 refs、generation carrier 和任务工作树，却留下本地 Tag，导致“发布资源已清理”的结果与本机 Git 现场不一致。

## What Changes

- 发布成功且 Publication evidence、远端 Tag 名称、Tag 提交与目标 release source 全部匹配时，删除本地同名 Tag。
- 正式远端 Tag、GitHub Release、npm version/dist-tag 和正式远端 `release-<version>` 分支保持不变。
- 本地 Tag 缺失时幂等返回已清理；本地 Tag 指向不匹配时停止清理并保留现场。
- 在任何删除前预检本地 Tag 与远端正式事实，防止发生部分清理。

不包含破坏性变更；用户可见安装与发布接口保持不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `release-collection-model`：扩展发布成功后的必需本地资源清理范围，明确远端 Tag 保留、本地同名 Tag 删除及幂等/漂移处理。

## Impact

- OpenSpec：`release-collection-model` 的 closeout requirement 与 scenarios。
- 实现：发布 Git 收敛与 release closeout 结果投影。
- 验证：真实 Git Tag 创建、远端核验、本地删除、错误指向拒绝与重复 closeout。
