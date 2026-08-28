## Why

当前 Buildr Core 同时混合产品理念、资产模型与硬边界，章节名称和重复表述削弱了 Agent 对真正约束的识别；同时，权威规范已经要求 Core 提供简明表达和下一步引导，但当前随包模板与契约测试没有完整落实。现在需要把 Core 收敛为面向所有用户 Workspace 的基础行为契约，并补充统一的 Mermaid 可视化判断原则。

## What Changes

- 按“责任与治理、用户沟通、工作资产职责、不可绕过边界”重组 Core，移除“产品哲学”等说明性章节和不可判定、重复的表述。
- 删除只在设计新硬门禁时触发、并非所有用户 Workspace 都需要的门禁设计条目。
- 恢复直接、简练、易懂的用户表达与明确下一步要求，并要求专业术语每次都使用“中文（English Term）”或“中文释义（English Term）”形式。
- 在输出环境支持且文字难以准确表达关系、时序、分支或状态转换时使用 Mermaid，并要求图后用一句话说明结论；简单线性内容继续使用文字或表格。
- 更新 Core 契约测试，使其验证稳定行为而不是旧章节标题或被删除的文案。
- 同步受影响的产品架构当前认知，避免继续把 Core 描述为“核心产品哲学”。

本变更不包含破坏性 API、数据或兼容性变化，但会改变所有新建或同步用户 Workspace 中 Agent 的必需表达行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-first-runtime-projection`：精炼 required Core 的用户表达契约，增加按需 Mermaid 可视化，强制专业术语使用中英文对照，并使下一步规则与随包 Core 一致。

## Impact

- `services/buildr/resources/workspace/rules/buildr/core.md`
- Core Rule 契约测试
- `workspace-first-runtime-projection` 规范与产品架构当前认知
- Buildr 同步后投射到用户 Workspace 的 required Core 内容
