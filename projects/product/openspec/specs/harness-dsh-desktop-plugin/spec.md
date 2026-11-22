# harness-dsh-desktop-plugin Specification

## Purpose
TBD - created by archiving change add-harness-dsh-desktop-plugin. Update Purpose after archive.

## Requirements

### Requirement: DSH 桌面提供独立的 Harness 主工作区

开发插件 SHALL 通过受支持的 DSH 桌面面板入口展示完整独立 Harness Web。该页面 MUST 使用 Harness 的原有账号、对话、权限、目录与执行接口，不需要 DSH 对话，不跳转外部浏览器。返回入口 MUST 还原 DSH 画面；切换本身不得开始或停止任一套执行。

#### Scenario: 在 DSH 打开 Harness 后再返回
- **WHEN** 用户从受支持的 DSH 桌面入口进入已绑定的 Harness、返回并再次进入
- **THEN** 整块工作区显示 Harness 服务的真实网页，DSH 的输入框不参与操作，同一窗口保留 Harness 的页面和原运行

### Requirement: 开发包仅委托已绑定的本机 Harness

开发插件 MUST 独立于 Development 插件，采用显式本机安装身份与数据域。桌面客户端 MUST 经宿主的本机认证和隔离网页租约进入准确的环回网页；普通 Web 客户端、鉴权失败或不匹配目标不得取得进入票据。插件不得打包另一份 Harness、削弱网页来源限制或修改日用配置。

#### Scenario: 缺少桌面桥或绑定不可用
- **WHEN** 非桌面客户端加载插件，或用户点击入口但明确绑定无法核验
- **THEN** 插件不得从另一配置域启动或发放会话票据；已绑定的其他入口和执行保持原状
