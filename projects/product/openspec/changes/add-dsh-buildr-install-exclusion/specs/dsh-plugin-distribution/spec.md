## ADDED Requirements

### Requirement: Buildr 插件安装必须互斥并明确提示
在采用本增强的 DSH 安装环境中，安装管理器 SHALL 按待装包的真实身份识别 Buildr 正式版、开发版和开发组合。当前环境已经安装任一 Buildr 插件时，DSH 原插件安装页面及同一候选运行时的官方命令行（CLI）MUST 在开始新增安装之前拒绝该操作，显示「同一时间只能安装一个 Buildr 插件，请先卸载当前版本，再继续安装」及已有包身份。禁用但尚未卸载的包 MUST 计入已有安装；同包更换版本同样 MUST 先卸载。检查 MUST NOT 根据压缩包文件名或显示标题猜测身份，MUST NOT 阻止无关插件的正常安装。

#### Scenario: 安装另一版或更新同包
- **WHEN** 环境已有 Buildr 插件，用户在原安装页面输入另一 Buildr 版本，或通过同一候选运行时的官方命令行（CLI）安装 Buildr 包
- **THEN** 安装 MUST 在启动安装操作之前停止，并显示先卸载提示和已有包身份
- **AND** 原插件、选择状态、预设引用和会话 MUST 保持

#### Scenario: 已有插件被禁用
- **WHEN** 当前 Buildr 包仍安装但未启用，用户安装 Buildr 包
- **THEN** 检查 MUST 仍拒绝安装并提示先卸载

#### Scenario: 没有 Buildr 或安装无关插件
- **WHEN** 当前没有 Buildr 包而安装 Buildr，或当前有 Buildr 但安装无关插件
- **THEN** 互斥检查 MUST 放行该操作，原兼容和授权检查 SHALL 继续适用

#### Scenario: 本地压缩包具有不同文件名
- **WHEN** 本地压缩包清单的真实包名属于 Buildr，但文件名不包含 Buildr
- **THEN** 检查 MUST 根据有界读取的包清单识别冲突，不安装或执行包代码

### Requirement: 互斥拒绝不得隐式切换或修复
互斥检查 MUST 只返回拒绝与提示，MUST NOT 自动卸载、替换、禁用现有插件或改写会话。检查后用户仍拥有卸载和再次安装的决定权；采用新检查 MUST NOT 将 Buildr 业务插件标记为不可卸载的系统管理组件。仅构建补丁或新插件包 MUST NOT 被报告为现装 DSH 已生效。

#### Scenario: 拒绝后继续使用当前插件
- **WHEN** 新 Buildr 安装被拒绝
- **THEN** 当前插件 MUST 保持原运行和配置，用户可以取消安装并继续使用
- **AND** 诊断或操作日志 SHALL 仅说明此次拒绝，不宣称已切换版本或修复卸载
