## Why

现有源代码管理（Source Control）只能阅读文字差异（Diff），修正当前文件必须离开对比现场，无法按用户提供的旧编辑器示例直接修改新内容。现在补齐直接编辑、前后定位和逐块恢复，让人可在同一现场核对、修正并撤销操作。

## What Changes

- 未暂存和未跟踪的完整当前文本允许直接编辑：左右对比的右侧可改，旧侧只读；上下对比的当前内容可改，旧删除内容只读。
- 提供上一处／下一处差异（Diff）的定位、当前位置和数量，编辑后按当前正文重新计算。
- 可将单个变化块恢复为当前比较基线，每次恢复可撤销（Undo）和重做（Redo），并通过既有自动保存（Auto-save）写入当前文件。
- 共用 `FileEditingController` 的真实文件身份、完整原文、保存历史、中文组合输入、受管区块（Managed Block）保护及冲突处理。
- 已暂存、固定历史、已删除、二进制、超限或无法确认完整内容的对象保留只读；原有图片、完整文件、来源、复制和历史阅读继续可用。
- 不包含破坏性变更，不改变既有命令行接口（CLI）和只读网页接口（API），不新增暂存、提交、推送或发布副作用。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `code-source-control`：在明确当前文件的差异（Diff）中共享既有文件编辑能力，增加前后变化定位和可撤销的逐块恢复，并维持比较层与只读边界。

## Impact

- `services/buildr-web/src/features/code/`：按真实来源为所选文件接入共享编辑状态，展示状态、导航和恢复操作。
- `services/buildr-web/src/components/file-editing/`：以成熟的 `@codemirror/merge` 差异（Diff）呈现能力复用既有编辑事务（Transaction）与保存控制；不另建保存体系。
- `services/buildr-web/src/features/task/components/TaskDiffReader.tsx` 及其共享使用方：保留原有只读默认行为和历史、图片及完整文件入口。
- 相关现有检查及必要代表性回归：真实比较层、完整原文、编辑权限、保护区、撤销（Undo）、中文输入和外部变化。
- 当前知识检查（assess）：实现后复核 `knowledge/code-map/system-services-assets.md` 的代码区域职责及 `knowledge/code-map/task-system.md` 的共享差异（Diff）阅读说明；未获得知识维护授权，仅提出受影响内容和具体校准建议。
