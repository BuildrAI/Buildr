## Why

用户在项目资料和资源管理器（Explorer）中已经能看到真实文件，但明确的小范围修改仍需离开当前页面。用户已确认两入口的统一编辑原型（Prototype），现在需要把模拟交互接入真实文件，并保护外部变化和未保存输入。

## What Changes

- 项目 README.md、AGENTS.md、从项目资料内链接逐层打开的当前 Markdown 文档，以及资源管理器（Explorer）当前普通文本，共用文件面板、编辑状态、自动保存（Auto-save）与冲突处理。
- 默认阅读，进入编辑后停止输入片刻即保存；保留撤销（Undo）、重做（Redo）和立即保存快捷键，不显示单独撤销、重做按钮。
- 紧凑显示相对路径、目录、版本和保存状态；完整绝对路径悬停可见。
- 保存校验实际文件及已观察版本，失败保留输入，冲突提供双方对照、合并保存和明确采用磁盘内容。
- 历史版本、二进制文件、大文件片段及 Buildr 管理的生成副本保持只读，受管区块（Managed Block）只允许修改区块外内容。
- 保留现有只读接口和其他资料入口；无破坏性变更，不自动提交、推送或发布。

## Capabilities

### New Capabilities

- `file-editing`: 项目资料与资源管理器（Explorer）统一文件编辑、保存、历史和冲突处理。

### Modified Capabilities

无。现有读取操作保持无文件写入副作用，新增明确的编辑读取与保存操作。

## Impact

- `services/buildr/src/modules/code/` 增加有身份与版本条件的文件能力；复用项目来源解析、本机会话（Session）写入授权和现有网页接口（API）贡献。
- `services/buildr-web/` 增加成熟编辑依赖，共享编辑会话（Session）与面板，接入项目资料和资源管理器（Explorer）。
- 复用 `.worktrees/file-editing` 中已确认的源码与分支（Branch）；确认原型（Prototype）保存在本变更的 `prototypes/`。
- 不新增服务（Service）或测试体系；复用当前准备、构建、后端与前端测试及浏览器验证入口。
