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

Harness 提供完整唯一对话实现和通用外壳。独立网页自行装配；Development 通过公开 `conversation.ts` 入口装配完整对话组件，第一方组合使用同一 React 页面树，不再加载对话 iframe。工程区域开合与专注/分屏只调整布局，保留同一对话实例、草稿、阅读位置和执行身份。当前产品启动、路由与组合入口仍在 Development，尚未完成 Harness 独立主入口接入可选环境的全套装配。

Harness 的可选工作上下文区域不是“任务专属空位”，没有内容时不留固定占位。Development 提供任务关联和工程参与控件，自行维护工程对象与已观察修订；Harness 不管理任务状态，也不因呈现关联而获得新的执行授权。上下文组件故障局部显示提示，不卸载对话或停止控件。

文件能力和工作对象打开使用不同的明确接口，由装配层接线：当前 Development 继续核验准确工程来源，并打开现有文件浏览器或任务页面；普通网址仍按网页链接处理。现有文件浏览器不搬入 Harness，也不重复实现。独立 Harness 已有目录文件读取和预览，不等于已有完整文件管理器。未来 DSH 若提供可用能力可按实际接口适配，不以当前接线认定所有宿主必须由 Development 打开文件。

显式工程上下文交接继续由 Harness 自己执行首次提交和恢复，未知响应不自动重发。独立网页及旧窗口兼容路径仍保留准确 origin、父/子窗口及消息类型校验；Development 同页路径不使用窗口消息或数值坐标覆盖。流程图安全渲染 iframe 保留，不是完整对话的嵌套。

上述接口是可信第一方的构建时装配边界，不是动态插件平台或权限沙箱；不加载任意远程工作环境，不下发长期后台密钥。本步不建设插件市场、多环境管理中心、通用链接注册中心或 DSH 适配。

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

页面会话从启动器票据兑换后按认证活动滑动续期，不活动窗口 30 天；兼容重启或更新保留会话，同一浏览器刷新页面即可恢复访问，文档加载会按服务端剩余寿命同步刷新 Cookie。超过不活动窗口、显式登出或换绑撤销后，才需要重新从启动器打开。
