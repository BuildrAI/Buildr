## MODIFIED Requirements

### Requirement: 独立程序凭据与最小授权

系统 SHALL 允许用户经任一获管理权的第一方页面创建、查看元信息及按已观察版本撤销程序凭据；明文仅创建返回一次，持久记录保留摘要和既有安全令牌文件语义，程序凭据 MUST 不依赖网页会话。Harness MUST 是程序凭据的唯一维护者，Development 仅调用管理接口，不再直接写同一凭据库。权限 SHALL 区分读取、执行、问题回复和审批，并限制明确的来源化执行范围；未显式公开操作 MUST 拒绝。目录范围 MUST 先由本机用户登记，程序不能凭路径自行扩大范围。

凭据 SHALL 保留“允许全部授权执行”开关 `allowFullAccess`，默认开启；人 SHALL 能在创建时选择并按凭据已观察修订切换。该开关 MUST 不改变读取/执行/答复/审批分权，不自动提升任何请求的权限模式；关闭时显式请求 full-access MUST 被拒绝且不产生执行副作用。原令牌、其他授权及既有省略权限模式的行为 MUST 保持：start/send 沿用原 default 规则，单步 `/messages` 沿用主规范“单步续聊”中继承最近轮次、无最近模式时 default 的规则；本变更 MUST NOT 将后者统一改成 default。

既有凭据 ID、摘要、令牌文件、撤销状态与回推关联 MUST 保留。旧 `workspaceIds` MUST 精确映射到原 Development 来源，不授予其他来源或模型账号管理权限。旧客户端更新 MUST 保留其无法表达的新范围，不能因省略字段删除未知授权项；明确撤销整个凭据仍按原语义生效。

#### Scenario: 无凭据、撤销与越权
- **WHEN** 程序无有效凭据、使用已撤销凭据或访问未授权范围/操作
- **THEN** 系统 MUST 拒绝相关调用且不产生执行副作用

#### Scenario: 网页安全边界保留
- **WHEN** 程序凭据请求网页管理、账号管理或共享后台生命周期接口
- **THEN** 系统 MUST 不将其视为页面会话或后台管理身份

#### Scenario: 切换全部授权开关
- **WHEN** 人以已观察修订切换某凭据的 `allowFullAccess`
- **THEN** 系统 MUST 按新版本保存开关，后续显式 full-access 请求按新值门禁，原令牌与其他授权保持

#### Scenario: 迁移后保留不同操作的省略语义
- **WHEN** 程序以同一有效凭据分别调用省略模式的 start/send 与最近一轮为 full-access 的 `/messages`
- **THEN** 前者 MUST 保持 default，后者 MUST 沿用最近轮次；显式 full-access 仍按主规范的凭据开关和连接能力校验

#### Scenario: 既有凭据在拆分后使用
- **WHEN** 已有本机程序沿旧工作空间 URL 和 Bearer 凭据调用
- **THEN** 其原范围和权限 MUST 保持，凭据转移维护者不要求重新签发或重新登录模型

#### Scenario: 旧客户端修改混合范围凭据
- **WHEN** 凭据已有其他来源范围，旧客户端仅修改可表达的 workspaceIds
- **THEN** 系统 MUST 版本化修改原 Development 子集并保留其他范围，显式整体撤销仍撤销该完整凭据

### Requirement: 可发现的当前能力

系统 SHALL 在固定 HTTP 发现入口返回认证调用方可访问的来源化执行范围、Agent 连接与模型、版本、就绪状态和能力及文档链接；MUST 不暴露实例管理秘密和账号凭据。目录范围 MUST 使用准确来源引用和有限展示信息，不能伪装为已登记业务工作空间。旧工作空间发现字段与 URL MUST 保留兼容投影，新来源须经新能力协商后使用。能力清单 SHALL 包含现有列表查询优化、单步续聊 messages、事件补查 events 与凭据回推配置操作，并按凭据权限过滤。

发现中的连接 `capabilities.permissionModes` MUST 透传真实支持的权限模式；支持全部授权的连接 MUST 列出 `default` 与 `full-access`，不能统一硬编码为 default。能力支持 MUST 不被当作调用者已经获得该权限。

#### Scenario: 无需浏览器发现
- **WHEN** 程序仅持有地址与 Bearer 凭据
- **THEN** 程序 MUST 能读取自己获准的范围及连接，发现清单反映当前可用的 messages、events 与回推配置操作

#### Scenario: 连接权限模式可见
- **WHEN** 程序读取发现且某连接支持 full-access
- **THEN** 该连接的 `capabilities.permissionModes` MUST 包含 full-access，仅支持 default 的连接 MUST 只列出 default

#### Scenario: 旧程序只理解工作空间
- **WHEN** 调用方使用原工作空间发现契约
- **THEN** 系统 MUST 只投影其获准的 Development 工作空间，不扩大到目录来源，不破坏原 URL

#### Scenario: 新程序选择目录范围
- **WHEN** 凭据明确获得已登记目录来源范围，且调用方协商了来源化能力
- **THEN** 发现 MUST 返回准确范围引用，执行 MUST 使用该引用核验，不接受任意 CWD 代替授权
