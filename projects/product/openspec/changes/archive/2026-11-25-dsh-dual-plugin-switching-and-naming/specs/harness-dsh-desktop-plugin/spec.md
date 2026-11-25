# harness-dsh-desktop-plugin Specification Delta

## MODIFIED Requirements

### Requirement: 正式与开发入口使用相应 Harness
正式插件 SHALL 核对本机正式安装与启动身份，通过受认证桌面桥连接对应 Harness；开发插件（本机开发包名 `@buildr-ai/dsh-buildr-harness-dev`）SHALL 显示 Buildr Harness Dev 并连接已明确配置的开发域。两者均 SHALL 在产物中导出 `locale/en.json`、`locale/zh.json` 与 `icon.svg` 元数据供 DSH 插件管理页展示可读名称、简介与 Buildr Harness 官方彩色 H 品牌图标（左侧入口同样无白底方框）。缺失、漂移或不兼容时 MUST 提供修复及复查入口，不静默安装、升级或接管其他实例。

#### Scenario: 先装插件后装 Harness
- **WHEN** 用户打开正式插件而正式 Harness 未就绪，随后按提示安装并重试
- **THEN** 插件 MUST 从缺失状态转为连接核验后的正式 Harness，无须重装插件

### Requirement: 自举采用同工作空间的 DSH 开发插件
自举 SHALL 在已交付范围命中开发插件包输入时更新本工作空间已安装的同源 DSH 开发插件（`@buildr-ai/dsh-buildr-harness-dev` 与 `@buildr-ai/dsh-buildr-development-dev`，并兼容将本工作空间已安装的旧包名 `@buildr-ai/buildr-harness-dsh-plugin-dev` 与 `@buildr-ai/buildr-development-dsh-plugin-dev` 先卸载再安装新包名）。不得注册新插件、改绑其他工作空间、更新正式版或发布。默认 MUST 不停止桌面进程；只有用户显式选择重开开发插件宿主且确认同源实例，才可请求正常退出。安装证明与桌面加载证明 MUST 分开。

#### Scenario: 交付开发插件且 DSH 仍在运行
- **WHEN** 自举确认同源插件且桌面仍运行，或无法确认其已退出
- **THEN** 已准备的候选可在 DSH 退出后采用；报告待安装，不改目标配置也不强退 DSH

#### Scenario: 只更新 Harness 网页
- **WHEN** 未改变插件包输入
- **THEN** 自举不因网页构建或提交号变化重装该插件

#### Scenario: 执行前检查更新范围
- **WHEN** 操作者对准确交付范围请求自举预检
- **THEN** 同一分类器列出适用的工作空间、开发运行（含 Harness）及 DSH 插件操作依据，不执行同步、构建、推送或换装

#### Scenario: 仅接续 DSH 待换装
- **WHEN** 使用同一交付的原完整结果接续，已验证其他阶段成功且此前因 DSH 尚运行而未尝试安装
- **THEN** 自举复核交付、保留检出和已安装插件，然后只尝试插件操作，不重复网页更新、同步和推送；若源码或绑定不匹配则不换装

#### Scenario: 显式更新插件并重开已绑定的 DSH
- **WHEN** 交付确实需要换包，用户发起重开，且自举核对当前桌面与开发包、配置及 Harness 数据域匹配
- **THEN** 独立执行器 MUST 在候选就绪后正常请求退出，确认退出后换包，并以原开发绑定重开；分别核对安装与插件宿主加载。绑定不明、拒绝退出或未验证退出时 MUST 保留待安装，不强杀。

## ADDED Requirements

### Requirement: 双插件共存时任意顺序切换不冲突
Buildr Harness 与 Buildr Development（含各自开发版与正式版）在同一 DSH 配置目录共存时，MUST 为 `main.conversation` 单槽位分配互不冲突的优先级，将槽位切换后的会话对齐延后到面板广播之外执行，并隔离单个状态订阅异常。从 Buildr Development 切换到 Buildr Harness 或反向、反复切换（包括同一工作空间目录共用 DSH 会话时）MUST 正常释放旧占位与浮层并展示目标工作区，不抛出单槽位同优先级冲突或导致中栏白屏。

#### Scenario: 先打开 Buildr Development 后再切换到 Buildr Harness
- **WHEN** 用户在 DSH 中先激活 Buildr Development（无论两插件在加载器中的初始化与订阅顺序如何），随后点击左侧栏 Buildr Harness 入口
- **THEN** Buildr Development 立即释放 `main.conversation` 与中心浮层，Buildr Harness 正常注册其独立优先级槽位、完成会话对齐并渲染中心工作区，不因同步广播顺序产生白屏。
