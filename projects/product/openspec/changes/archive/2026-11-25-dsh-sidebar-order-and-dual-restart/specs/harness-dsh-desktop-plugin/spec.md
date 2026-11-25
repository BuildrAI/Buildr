## MODIFIED Requirements

### Requirement: 自举采用同工作空间的 DSH 开发插件
自举 SHALL 在已交付范围命中开发插件包输入时更新本工作空间已安装的同源 DSH 开发插件（`@buildr-ai/dsh-buildr-harness-dev` 与 `@buildr-ai/dsh-buildr-development-dev`，并兼容将本工作空间已安装的旧包名 `@buildr-ai/buildr-harness-dsh-plugin-dev` 与 `@buildr-ai/buildr-development-dsh-plugin-dev` 先卸载再安装新包名）。不得注册新插件、改绑其他工作空间、更新正式版或发布。默认 MUST 不停止桌面进程；只有用户显式选择重开开发插件宿主且确认同源实例，才可请求正常退出。当多个待更新插件同时启用重开时，MUST 先批量完成全部候选构建与绑定核验，再仅请求 DSH 正常退出一次，在退出态顺序完成各插件迁移与安装后仅重开 DSH 一次并核对宿主回执。安装证明与桌面加载证明 MUST 分开。

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

#### Scenario: 同时交付双 DSH 开发插件并仅重开 DSH 一次
- **WHEN** 同一交付同时修改 `@buildr-ai/dsh-buildr-harness-dev` 与 `@buildr-ai/dsh-buildr-development-dev` 且用户使用 `--restart-dsh true`
- **THEN** 自举执行器先完成两个插件的候选构建与校验，只调用一次退出验证终止运行中的同源 DSH，在 DSH 退出态依次移除旧包并安装两个新包，全部安装确认成功后只调用一次重开并校验新进程的宿主加载回执，不将第二插件阻塞为待安装也不触发两次重启。

### Requirement: 正式与开发入口使用相应 Harness
正式插件 SHALL 核对本机正式安装与启动身份，通过受认证桌面桥连接对应 Harness；开发插件（本机开发包名 `@buildr-ai/dsh-buildr-harness-dev`）SHALL 显示 Buildr Harness Dev 并连接已明确配置的开发域。两者侧栏排序 MUST 使用正式 `4` / 开发 `5`，使入口紧接在 DSH `插件`（`0`）下方且位于 Buildr Development（正式 `6` / 开发 `7`）之前、原生 `自动化任务`（`10`）上方。两者均 SHALL 在产物中导出 `locale/en.json`、`locale/zh.json` 与 `icon.svg` 元数据供 DSH 插件管理页展示可读名称、简介与 Buildr Harness 官方彩色 H 品牌图标（左侧入口同样无白底方框）。缺失、漂移或不兼容时 MUST 提供修复及复查入口，不静默安装、升级或接管其他实例。

#### Scenario: 先装插件后装 Harness
- **WHEN** 用户打开正式插件而正式 Harness 未就绪，随后按提示安装并重试
- **THEN** 插件 MUST 从缺失状态转为连接核验后的正式 Harness，无须重装插件

#### Scenario: 侧栏入口紧接在插件下方呈现
- **WHEN** DSH 桌面侧栏渲染原生 `插件`（`0`）、Buildr Harness 与原生 `自动化任务`（`10`）
- **THEN** Buildr Harness 入口紧接在 `插件` 下方呈现且位于 `自动化任务` 与 Buildr Development 上方。
