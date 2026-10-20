## Why

同一任务（Task）先整理方案、再按实施范围追加代码仓（Repository）是正常工作。当前创建入口把完整清单摘要的任何变化视为冲突，阻止了保留既有成果的安全追加，需要改为逐项身份核验。

## What Changes

- 重复创建合并已有成员与显式新增来源，只创建缺少的工作树（Worktree），保留原始起点及未提交内容。
- 真实身份冲突继续在创建前拒绝；失败保存完整组及逐项结果，重试不遗漏已完成成果。
- 同组创建与清理使用同一短期互斥锁（Mutex），已有登记文件位置保持稳定。
- 预览（Preview）允许已核验的成员集合扩展，保留自身归属与认证边界。
- 同步技能（Skill）源与能力契约（Capability Contract）的追加指引；不改变命令名称、默认目录或删除授权，无破坏性变化。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-environments`：增加同组增量追加、完整失败登记、写入互斥和稳定登记位置保证。
- `worktree-buildr-web-preview`：允许安全追加后的同属预览（Preview）复用和停止，继续拒绝已有成员身份变化。

## Impact

影响 `git-worktree-provider.ts` 的起点处理、预览（Preview）归属解析，以及对应真实 Git 与进程检查。只修改 Product 源资产，不更新受管副本，不发布或改动业务代码仓（Repository）。
