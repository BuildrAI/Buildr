## MODIFIED Requirements

### Requirement: 目标执行来源必须可验证且保持安装所有权
发布版归属 MUST 使用已验证的当前 npm 来源；开发版归属 MUST 优先从本机 `Buildr Development Dev` 启动器（Launcher）的有效登记发现源码根及 Node，在其不存在时兼容回退读取已登记的 `Buildr Web Dev` 启动器，并校验其当前来源与可执行性。MUST NOT 写死开发目录、从网页进程反推程序或把仅接受 npm 的安装登记冒充双版统一登记。默认 `buildr` 的机器入口所有权 MUST 继续属于 npm。

#### Scenario: 开发来源移动并更新登记
- **WHEN** 有效的开发启动器（Launcher）登记已切换到新的可用源码根及 Node
- **THEN** 后续默认调用 MUST 使用该当前登记来源
- **AND** MUST NOT 依赖之前开发目录或运行实例

#### Scenario: 仅存在旧名开发启动器时保持路由兼容
- **WHEN** 升级过渡期本机尚未重装 `Buildr Development Dev`，但存在有效的 `Buildr Web Dev` 启动器登记
- **THEN** 默认入口 MUST 兼容读取该旧名开发启动器登记并路由到已验证的开发来源

#### Scenario: 所选来源不可用
- **WHEN** 目标归属开发版，但开发启动登记损坏、源码根无效或其 Node 不可执行
- **THEN** 默认入口 MUST 非零退出并指出所选来源及恢复方向
- **AND** MUST NOT 静默改用发布版、其他源码根或未登记 Node
