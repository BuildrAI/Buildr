## ADDED Requirements

### Requirement: Buildr Web 必须显示可信的开发环境标识
Buildr Web Runtime MUST 将已经解析并校验的 closed Web profile 注入同源入口页面。应用壳 MUST 仅在该 profile 精确为 `development` 时持续显示用户可见的“开发版”环境标识，并把浏览器标签页产品名显示为 `Buildr Web Dev`；released、缺失或未知 profile 的产品名 MUST 保持 `Buildr Web`。前端 MUST NOT 根据端口、URL、Workspace 或 Launcher 文件名推断环境；该标识 MUST 只用于展示，不得成为权限、路由、数据或实例生命周期 authority。

#### Scenario: development 页面显示开发版
- **WHEN** development/development product identity 启动 Buildr Web，且 Runtime 已解析 development Web profile
- **THEN** Runtime MUST 在入口页注入 `development` profile，应用壳 MUST 在所有路由持续显示“开发版”
- **AND** 标识 MUST 使用稳定 DOM identity 供浏览器验收
- **AND** 浏览器标签页产品名 MUST 显示为 `Buildr Web Dev`，并保留既有 Workspace 标题上下文

#### Scenario: released 页面不显示开发版
- **WHEN** npm/host product identity 启动 Buildr Web，且 Runtime 已解析 released Web profile
- **THEN** Runtime MUST 在入口页注入 `released` profile，应用壳 MUST NOT显示“开发版”标识
- **AND** 浏览器标签页产品名 MUST 保持 `Buildr Web`
- **AND** released 的端口、Launcher binding、Workspace registry 与 Data Root 行为 MUST保持不变

#### Scenario: profile 缺失或未知时不误报
- **WHEN** 旧入口页、源开发入口或异常页面没有可识别的 closed Web profile
- **THEN** 应用壳 MUST NOT把页面标记为开发版
- **AND** 浏览器标签页产品名 MUST 保持 `Buildr Web`
- **AND** 前端 MUST NOT回退到端口、URL、Workspace 或 Launcher 文件名猜测环境
