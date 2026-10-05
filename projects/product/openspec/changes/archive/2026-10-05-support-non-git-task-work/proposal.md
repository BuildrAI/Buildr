## Why

Buildr 允许先组织项目资料，但默认工作位置指引把所有持久修改都交给 Git 工作树（Worktree），纯资料任务因此在首次真实修改前受阻。开始与交付必须依据实际成果归属选择安全方式，不能要求用户为了资料工作先建仓库。

## What Changes

- 将默认工作位置选择分为实际 Git 文件、已确认的非 Git 资料、身份未明三种情况；保留 Git 默认隔离及已明确的原地修改例外。
- 非 Git 资料在已授权的实际位置使用所属专业工具，修改前核对身份和版本、保全已有内容、修改后从真实成果回读；未知或损坏仓库不能降级为非 Git。
- 任务分流、工作树指引、任务材料维护、收尾及五个 OpenSpec 增强入口共同消费此判断；混合范围只局部停止受影响写入。
- 校正直接相关规范中“登记前必须先取得 Git 基线”及旧任务能力版本的冲突表述，沿用当前任务记录（Task Record）能力，不改变记录实现。
- 修改随包静态检查和有意义回归，核对真实投射、无 Git 资料闭环、专业版本保护及既有 Git 安全。
- 不引入新依赖、任意文件写入接口、通用许可层、状态库或新提供者（Provider）。没有接口、数据或既有 Git 用法的破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`：按真实对象条件化工作位置、执行上下文和专业能力交接。
- `buildr-package-assets`：任务记录条件消费与当前 `buildr.task-record/v4`、登记不依赖 Git 的已有实现一致。

## Impact

影响 `services/buildr/resources/workspace/` 的相关技能（Skill）、OpenSpec 增强及内容摘要，`services/buildr/tools/verification/package-check/`、相关契约与集成回归，以及现有任务代码地图（Code Map）的工作位置解释。上游 OpenSpec 技能、Git 提供者与契约、能力绑定、任务和知识接口均保持现有职责；非 Git 根下独立 Git 子仓库的检出布局属于后续范围。
