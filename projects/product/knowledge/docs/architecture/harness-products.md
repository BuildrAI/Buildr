# Buildr Harness 与 Development：产品、代码与发行边界

当前重构采用两层产品关系：**Harness 负责 Agent 执行及完整网页；Development 为 Harness 准备工程现场和上下文。** 本页解释实现边界，不代替任务验证、人工验收或公开发布批准。

整体关系见[双产品系统图](../../archify/system/buildr-system-overview.html)。

## 产品关系

| 产品 | 拥有的功能 | 不承担的职责 |
| --- | --- | --- |
| Buildr Harness | 原生 Harness/执行程序和多模型来源接入、独立账号、对话、附件、问题与审批、停止、接续、恢复、普通工作目录，以及完整网页 | 工程任务、知识、工作空间治理与工程成果状态 |
| Buildr Development | 工程工作空间、任务、知识、代码与成果；向 Harness 交接准确目录和工程上下文 | 第二套对话 UI、原生执行状态机、模型账号管理 |

两种产品界面统一称“工作空间”，都是从目录开始。Harness 接受普通本机目录，Development 提供自身管理的目录及工程上下文；同名不代表工程对象由 Harness 管理。独立 Harness 不要求目录先初始化为 Development 工作空间。

## 四个目录

- `services/buildr-harness/`：原 buildr-agent 核心，合并 CLI、启动器及独立包工具；公开包名 `@buildr-ai/buildr-harness`。
- `services/buildr-harness-web/`：完整唯一网页，包含全部对话、设置及目录交互；原独立 buildr-harness-ui 服务删除。
- `services/buildr/`：Development CLI、后端、工程应用、资源和发行。
- `services/buildr-web/`：Development 工程页面，`src/features/harness-ui/` 专门维护工程集成。

开发对话输入、工具展示、模型设置或执行控制时修改 Harness；开发任务、知识、工作空间或工程导航时修改 Development。Development 的 harness-ui 只是集成模块，不是可复用对话组件包。

## 网页集成

独立入口和 Development 消费同一 Harness 网页产物。Development 从公共核心包取得静态资源目录，经受认证的 `/harness/` 同源路径托管，使用 iframe 嵌入；不导入对话 React 组件。内嵌与专注只调整外层布局，保留同一 iframe、当前对话、草稿和阅读位置。

布局和交互尽可能沿用重构前形态，不因 iframe 增加重复导航、外层工具栏或新对话工作空间弹窗。工作空间在原对话信息位置选择；收起只留下窄侧栏，专注与分屏保留同一页面。

工作空间目录选项、任务关联、工程参与和工程文件导航留在 Development；Harness 呈现工作空间选项但不接管工程登记。Development 根据完整网页上报的数值布局锚点，将自己拥有的任务关联放回输入区下方，不向 Harness 导入任务组件。有限页面协议核对准确 origin、父/子窗口和消息类型。配置、新建、打开、历史、设置只改变界面；显式工程上下文交接由 Harness 自己执行首次提交和恢复。未知响应不自动重发。

同源 iframe 是可信产品模块边界，不是不可信网页的权限沙箱。页面来源必须是安装负载中的真实 Harness 产物，不能接入任意远程网页或下发长期后台密钥。

## 核心与数据兼容

包与源码改名不迁移 `agent-service` 的已有数据根、账号、对话库及控制脚本路径。相同用户、配置域和准确数据根可复用同一逻辑后台；开发、发布和隔离预览不隐式混用。关闭或卸载入口不删除共享历史与账号。原生程序仍拥有其推理循环；Harness 统一接入与控制，不自研另一套循环。

## 发行内容

Harness 本机包携带编译核心、CLI、启动器、完整网页、运行依赖和许可证据；不含 Development 工程业务、用户账号或工作空间私人资料。Development 主包 `@buildr-ai/buildr` 携带工程实现与网页、工程资源，并携带所用 Harness 运行负载及完整网页，无需用户手动先装另一份独立 CLI。

Node 最低要求仍为 `24.15.0`；原生程序管理、真实模型账号和使用权是各自边界，不因制包成功自动取得。Harness 独立包当前仍 `private:true`，本机验收包不是正式公开发布旁路；许可证据和平台批准不能代填。Windows 实测不在本轮范围。

## DSH 插件组合

清楚的上下层边界允许未来独立提供 Harness 插件、只准备工程现场的 Development 插件，以及两者组合的插件。本轮只保证代码职责可区分，不声称已经实现或发行三套新插件；现有 dsh-plugin 服务仍独立。

文件定位见[代码地图](../../code-map/harness-products.md)。具体承诺见[网页集成变更](../../../openspec/changes/archive/2026-11-16-extract-harness-web/proposal.md)、[核心变更](../../../openspec/changes/archive/2026-11-16-split-buildr-harness-product/proposal.md)和[发行变更](../../../openspec/changes/archive/2026-11-16-distribute-harness-products/proposal.md)。

## 独立网页端口

独立 Harness CLI 和启动器默认按配置域使用固定端口：开发版 `9519`，发布版 `9518`；`web --port <端口>` 可显式覆盖。Development 自身的端口与入口保持不变。已有独立网页地址不同，启动命令通过第一方管理接口核对端点与代次后安全换绑；新端口被占用时保持原地址并报错，不抢占或停止Agent执行。换绑撤销旧页面登录，需从启动器重新打开；账号、历史和执行仍保留原数据域。旧地址下未发送草稿仍留在原浏览器origin，不自动搬迁。
