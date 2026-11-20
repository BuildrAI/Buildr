## Why

独立 Buildr Harness 能选择目录、运行智能体并从对话预览文件，但要主动浏览、修正和审阅代码，仍需切换到 Development 或外部编辑器。实际使用也表明：原生 Codex、Claude Code 等可以通过 CLI 和技能使用 Development，不必改用 Harness；两者的深度组合不应让工程能力依赖某一种交互入口。

## What Changes

- Harness 拥有目录级工作环境和两个可单独装配的功能：资源管理器、源代码管理（Source Control，Git 工作界面）。在普通目录无需工程登记即可浏览、搜索和编辑；在准确选定的 Git 工作树查看状态、差异和历史，显式暂存、取消暂存和本地提交。
- Development 持有工程登记、跨库/任务上下文、任务工作树生命周期、验证和交付；现有入口通过明确适配复用通用实现，保留路由、工程范围和现有能力。CLI 和技能仍可被外部智能体独立使用。
- 更新产品总览、双产品架构说明及相关术语和代码定位；明确原生内核、订阅/自带密钥、Buildr 自身编排与交互的分工，以及 DSH 插件只是可选装配和发行方式。
- 不迁移工作空间、账号、对话或任务数据，不移除兼容入口；不新增远端 Git 操作、任务工作树管理或发布动作。没有计划中的破坏性变更。

## Capabilities

### New Capabilities

- `harness-directory-workbench`：无工程登记的本机目录工作台、准确授权和受保护的文件/Git 操作。

### Modified Capabilities

- `harness-product`：将通用目录操作划归 Harness，工程能力与执行入口分离。
- `harness-web-composition`：资源管理器和源代码管理由 Harness 提供可独立装配的界面，Development 通过工程适配复用。

## Impact

改动涉及四个既有服务 `buildr-harness`、`buildr-harness-web`、`buildr`、`buildr-web` 及产品知识。用户可从独立 Harness 使用相同文件与差异界面，不以启动 Development Web、配置模型或创建对话为前提。Git、文件和原工程应用仍分别是当前内容与业务记录的依据。任务说明见[任务](@task/harness-directory-workbench)。
