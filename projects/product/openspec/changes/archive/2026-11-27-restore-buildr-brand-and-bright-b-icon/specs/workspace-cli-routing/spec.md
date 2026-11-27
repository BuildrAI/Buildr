## MODIFIED Requirements

### Requirement: 目标执行来源必须可验证且保持安装所有权
发布版归属 MUST 使用已验证的当前 npm 来源；开发版归属 MUST 优先读取目标开发数据目录下的稳定开发来源登记（`development-source.json`），在其不存在时兼容回退读取本机 `Buildr Dev` 启动器（Launcher）的有效登记，再在其不存在时兼容回退读取已登记的 `Buildr Development Dev` 或 `Buildr Web Dev` 启动器，并校验其当前来源与可执行性。当目标开发数据目录下存在 `development-source.json` 但内容损坏、格式无效或身份不匹配时，MUST 非零退出并报告可定位原因与恢复方向，MUST NOT 静默回退桌面启动器登记。MUST NOT 写死开发目录、从网页进程反推程序或把仅接受 npm 的安装登记冒充双版统一登记。默认 `buildr` 的机器入口所有权 MUST 继续属于 npm。

#### Scenario: 通过稳定数据目录来源登记完成路由
- **WHEN** 开发数据目录存在有效的 `development-source.json`，且桌面开发启动器不存在或尚未升级到最新名称
- **THEN** 默认入口 MUST 优先使用 `development-source.json` 声明的开发源码根及绑定 Node 执行命令
- **AND** 即使本机同时存在陈旧的桌面启动器登记，MUST 仍以 `development-source.json` 为准

#### Scenario: 稳定来源登记损坏时严格失败关闭
- **WHEN** 目标开发数据目录存在内容损坏或字段无效的 `development-source.json`，即使本机存在有效的桌面开发启动器
- **THEN** 默认入口 MUST 非零退出并指出 `development-source.json` 损坏或无效及恢复方向
- **AND** MUST NOT 静默回退到桌面启动器、发布版或其他来源

#### Scenario: 开发来源移动并更新登记
- **WHEN** 有效的开发来源登记或开发启动器（Launcher）登记已切换到新的可用源码根及 Node
- **THEN** 后续默认调用 MUST 使用该当前登记来源
- **AND** MUST NOT 依赖之前开发目录或运行实例

#### Scenario: 仅存在旧名开发启动器时保持路由兼容
- **WHEN** 开发数据目录尚未写入 `development-source.json` 且本机尚未重装 `Buildr Dev`，但存在有效的 `Buildr Development Dev` 或 `Buildr Web Dev` 启动器登记
- **THEN** 默认入口 MUST 兼容读取该旧名开发启动器登记并路由到已验证的开发来源

#### Scenario: 所选来源不可用
- **WHEN** 目标归属开发版，但开发来源登记或启动登记损坏、源码根无效或其 Node 不可执行
- **THEN** 默认入口 MUST 非零退出并指出所选来源及恢复方向
- **AND** MUST NOT 静默改用发布版、其他源码根或未登记 Node
