## MODIFIED Requirements

### Requirement: 阶段结果、冲突现场与局部重新观察

获取、整合及推送 MUST 分别报告成功、无需执行、不可用、失败、未执行或结果未知，保留各阶段已核实的实际分支（Branch）、完整提交（Commit）和副作用。变基（Rebase）冲突 MUST 保留真实冲突现场及可查看改动入口，停止后续推送，MUST NOT 自动中止、丢弃或以零效果失败掩盖现场。超时、身份变化和未知结果 MUST 只报告已知事实，不自动重发写入。应用内针对同一 Git 公共目录（Common Directory）的 Git 写入 MUST 防止相互交错；外部写入仍 MUST 逐阶段核对。一个来源的问题 MUST 不阻止其他健康代码库（Repository）。

页面 MUST 提供真实等待及逐阶段反馈，全部正常完成或已确认无需执行时 MUST 静默，MUST NOT 显示成功通知；异常、不可用、结果未知或部分失败时 MUST 以不占源代码管理（Source Control）目录布局的通知浮窗（Notification）展示，默认驻留约 6 秒、悬停暂停自动关闭且可手动关闭。异常通知 MUST 使用沿用主题且清楚可辨的边框和背景。通知 MUST 保留本次具体来源及获取、整合、推送的真实阶段结果、说明和冲突改动查看入口，MUST NOT 以最终失败抹除已成功阶段；结束后按发起时工作空间（Workspace）、代码库（Repository）和工作树（Worktree）身份重新观察对应代码库（Repository）及受影响当前内容；成功事实 MUST 不等待全部目录重读。较旧或跨工作空间（Workspace）迟到响应 MUST NOT 覆盖较新或其他来源事实；离开页面或关闭菜单（Menu） MUST NOT 自动取消已发写入、重发请求或遗漏对应局部重新观察。显式历史筛选、固定提交（Commit）阅读及其他来源 MUST 保持。

#### Scenario: 冲突后保留现场
- **WHEN** 变基（Rebase）发生冲突
- **THEN** 系统 MUST 反馈获取已成立、整合冲突及推送未执行，保留冲突文件与 Git 现场并允许查看，MUST NOT 自动中止整合或继续推送

#### Scenario: 推送失败与页面迁移
- **WHEN** 整合成功而推送失败，或原页面关闭后结果才返回
- **THEN** 系统 MUST 保留并表达本地整合成果，按原来源触发局部重新观察，不否定已成立阶段、不影响其他工作空间（Workspace）且不重发写入

#### Scenario: 同库并发写入
- **WHEN** 同一真实代码库（Repository）的另一个工作树（Worktree）已有应用内 Git 写入进行中
- **THEN** 同步（Sync） MUST 明确等待或局部拒绝重叠写入，MUST NOT 与其交错执行获取、整合和推送

#### Scenario: 同步结果浮窗保留阶段及现场
- **WHEN** 同步（Sync）获取成功但整合冲突，用户停留查看通知浮窗（Notification）
- **THEN** 浮窗 MUST 表达获取已成立、整合冲突和推送未执行，保留查看现有改动入口，悬停期间 MUST 保持可操作
- **AND** 浮窗 MUST 默认约 6 秒后关闭且允许手动关闭，MUST 不占目录常驻空间；关闭 MUST 不取消已发写入或清理冲突现场


#### Scenario: 正常同步静默且已成立事实保持
- **WHEN** 本次同步（Sync）全部正常完成或已确认无需整合与推送（Push）
- **THEN** 页面 MUST 不显示结果通知浮窗（Notification），已成立分支（Branch）、提交（Commit）及适用状态仍 MUST 按原有身份重新观察并保持
- **AND** 后续异常或部分失败 MUST 得到短时通知，MUST NOT 因静默成功而取消写入、清除结果事实或自动重试

## ADDED Requirements

### Requirement: 同步观察与阶段执行采用一致有效配置

同步（Sync）的来源、上游（Upstream）、获取和推送配置观察，以及各阶段 Git 执行 MUST 一致采用有效本机系统、用户及代码库（Repository）配置，并尊重调用环境明确选择的配置文件或系统配置禁用。应用 MUST NOT 无条件屏蔽系统配置或硬编码平台凭证助手（Credential Helper）；外部 Git 定位和未授权配置注入 MUST 继续被清理，非交互认证、禁止隐式获取、固定目标及既有阶段安全边界 MUST 保持。配置变化 MUST 按原有漂移规则拒绝受影响阶段，MUST NOT 修改用户配置以尝试恢复同步（Sync）。

#### Scenario: 系统传输配置在同步阶段有效
- **WHEN** 固定上游（Upstream）的传输或凭证配置来自本机系统配置，用户显式同步（Sync）
- **THEN** 配置观察和适用写入阶段 MUST 使用同一有效配置，不因应用屏蔽系统配置而改变目标或制造认证失败
- **AND** 真实认证失败 MUST 保留逐阶段事实，不弹出交互输入或自动重试

#### Scenario: 观察后有效配置漂移
- **WHEN** 原观察使用的有效配置在同步（Sync）后续阶段前发生变化
- **THEN** 受影响阶段 MUST 拒绝旧观察，已确认效果 MUST 保留，MUST NOT 按新配置猜测替代上游（Upstream）或推送目标
