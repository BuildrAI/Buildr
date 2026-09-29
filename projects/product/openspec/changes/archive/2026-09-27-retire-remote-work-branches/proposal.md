## Why

历史发布保留了正式分支（Branch）和失败候选的旧轮次，普通开发交付后也没有持续执行远端清理。最新自动删除只覆盖最后一轮；恢复准备还会重建已经合并并删除的临时引用，需要让资源保留与真实工作用途一致。

## What Changes

- 在 Buildr 产品仓库明确长期保留 `main`、`dev`，对已交付且无活动用途的开发分支（Branch）提供有界、持续清理授权；通用收尾技能（Skill）只消费明确授权，不自行扩大范围。
- 新发布绑定 `delete-owned-release-branches/v2`，清理同版本所有可证明归属、历史保全、无活动用途的候选轮次；旧版本政策保持兼容。
- 发布准备先读取已合并事实，缺失且已完成用途的临时引用不重建；公开发布仍保留正式 `release-<version>` 到发布成功。
- 按对象报告删除、保留、未知与实际效果，单项异常不阻止其他可安全清理的对象。
- 本轮处理已核验历史引用和 Dependabot 安全更新，修复先交付 `dev`，不发布新版本。
- 不包含破坏性接口变化；新的远端删除范围只来自明确授权或新发布上下文（Context）绑定。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `release-collection-model`：同版本多轮次引用清理与已退休临时引用恢复。
- `open-source-release-governance`：发布清理授权兼容、活动用途和逐项结果。
- `agent-task-workflows`：开发交付后的显式仓库清理政策与结果报告。

## Impact

影响发布工具、发布集成测试、产品规则（Rule）、收尾及发布技能（Skill）源文件、发布流程说明、仓库合并后自动删除设置；Dependabot 仅更新已有 `js-yaml` 锁定版本。无新增服务（Service）、测试体系或对外发布。
