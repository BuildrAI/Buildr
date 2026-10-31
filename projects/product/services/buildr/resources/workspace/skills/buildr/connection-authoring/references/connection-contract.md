# 接入成果约定

新连接技能源统一使用 `skills/connections/<skill-id>/`，完整包含 `SKILL.md`、`assets/connection.yml`、必要 `scripts/` 和 `references/`。内置与公司自有来源遵守同一目录规范，身份继续独立；制作指引自身位于普通技能（Skill）目录。唯一登记仍是 `skills/manifest.yml` 的 `path: connections/<skill-id>`；目录存在不等于已启用。`skills add --source` 根据 `connectionDefinitions` 将新完整源放入标准位置；本地已有目录登记必须使用标准位置，非标准清单条目在连接目录中局部诊断。安装其他同系统方法不改变既有实例绑定。

`connectionDefinitions` 引用技能（Skill）受支持附件目录内的文件；连接定义使用 `(assetIdentity, definitionId)` 加 `sourceIdentity` 绑定，不按类别（Category）路由。`assets/connection.yml` 使用 `buildr.connection-definition/v1`：名称、说明、类别、配置版本、配置字段、完整认证字段、认证目标字段、程序、只读槽位和展示引用。程序帮助定义专业命令，Buildr 不预定义业务动词。

`connectionDefinitions` 是 Buildr 支持的技能（Skill）头部扩展；部分通用校验器的字段白名单不包含它。用 Buildr 实际登记和 `definitions list` 核对该扩展，不因通用白名单提示删除有效声明或修改上游校验器。需要保持通用头部时，可不写此字段，登记时显式使用 `--connection-definition`，仍须验证完整附件与绑定。

`authentication.allowedSources` 可选，只接受非空、不重复的 `team|personal` 列表，省略保持两者兼容。只允许个人授权时声明 `[personal]`：主表单使用本机个人组，保存共享配置不保存认证；共享候选、恢复团队组、缺少个人组后回退均被宿主拒绝。它限定认证保存和交接来源，不定义远端账号种类或权限。当前账号、目标和步骤的权限由远端事实决定；用户授权与工具支持/验证范围分别说明。认证来源约束变为不兼容时提升 `configVersion` 并说明明确迁移方式。

完整个人组加密保存于规范工作空间（Workspace）的 `.buildr/local/connection-skills/` 当前本机应用身份目录，文件和目录只允许本人访问并忽略 Git；加密密钥仍在本机应用数据目录。旧本机路径只兼容读取，存储迁移和共享转个人必须显式执行、核对双方观察并保全目标，冲突不覆盖。相同认证目标的实例合并须由应用重新绑定个人组，不能复制旧密文或从其他来源借凭据。界面可显式查看本人当前已保存的单个秘密字段，普通列表/详情/诊断不返回秘密，查看不会自动更换认证。

`authentication.authorization` 可选，适用于只允许 `[personal]` 的接入。它引用命名授权程序并可声明 `args/inputs/label/reauthorizeLabel/timeoutMs/accountLabelField`；`inputs` 只引用配置字段，账号展示字段只能引用非秘密认证字段。授权程序与普通业务程序使用不同上下文，默认不接收旧认证；显式有限复用、目标参数及按需准备见下方“按需站点会话”。完整字段声明仍用于宿主校验和密文保存，界面不显示这些字段的录入与令牌查看。首次新增先保存必要非秘密配置，再授权和发现范围；授权后才能确定的范围不应阻塞授权本身，业务命令另行要求准确目标。

授权和重新授权均为明确动作，普通打开页面不执行。程序须使用本次独立浏览器会话或外部系统支持的安全回调交接，不从其他用户资料借用会话，不把秘密放进公开回调网址、普通输出或诊断。取消、超时、关闭浏览器、异常退出、无效结果及开始观察变化时，提交前失败保留原个人组并清理本次资源；新组已经替换后若持久化核验失败，准确报告待核验并重新读取，不虚构旧组仍在，也不盲目重授权。

字段支持 `string`、`url`、`integer`、`boolean`、`enum`、`select`、`multiselect`，认证组另支持 `secret`。`required` 检查字段存在；需要非空文本时声明 `minLength: 1`，允许空密码时不增加该约束。使用 `minLength/maxLength`、`minimum/maximum`、固定 `values`、`optionsFrom` 及 `dependsOn: {field, equals}` 表达简单条件。不允许任意脚本表达式；秘密字段不能有默认值，不能进入摘要或网站字段。网站只接受不嵌账号密码的 HTTP/HTTPS 地址，不能用查询或锚点参数承载密码、令牌；普通页面锚点保留。

动态选项使用 `options: [{value: string, label: string}]`，单选与多选分别保存文本编号和文本编号数组。程序将数值编号规范为文本后返回，不依赖页面静默转换；非法选项只使该次发现失败，不使连接整体不可用。提供者（Provider）不能预先用隐藏文本改写选项编号；编号与已知秘密重合时由宿主明确拒绝该次发现，不生成替代身份，可按该方法支持的准确只读定位或私有产物（Artifact）接续。单选与多选的固定 `values` 同样必须为文本编号；数值或布尔固定值使用 `enum`。固定枚举及条件相等值可使用文本、布尔值或有限数值，不能使用 `NaN` 或无穷值。

宿主可在实例顶层保存可选 `fieldLabels: {"<字段名>": {"value": "<准确编号>", "label": "<显示名称>"}}`，仅供具有 `optionsFrom` 的动态单选字段显示。每条记录必须匹配当前配置值，最多 100 条、名称最长 2048 个字符；它不属于配置，不进入认证目标或程序上下文（Context）。旧文件没有名称时显示编号，损坏或失配的名称局部忽略；旧客户端省略该字段时保持仍匹配的记录。专业程序继续只使用配置中的准确编号，不读取或依赖显示名称。读取选项只更新表单草稿，明确保存后名称才进入实例文件；列表不会为了补名称自动查询远端。

`presentation.categoryLabel` 与 `methodLabel` 仅提供类别和接入方式的纯文本展示名，不参与选择或授权。`groups` 是有序区块数组，每项为 `{id, title, fields, collapsed?}`；`fields` 使用 `config.<key>` 或 `authentication.<key>` 引用，可混合编排地址、团队认证与业务范围，每个字段至多出现一次。未列字段由通用页面回落展示；低频内容声明 `collapsed: true`，不能隐藏必需保护或通过任意界面代码执行操作。实例名称、环境、启用状态与默认收起的个人账号入口由 Buildr 维护，不重复声明。

`presentation.environment: hidden` 可隐藏通用连接环境输入、名称示例中的环境及列表空环境标签；省略保持兼容。它只影响连接级元数据展示，不能替代专业操作的目标环境，也不形成权限开关。

网站入口用 `presentation.websiteField` 引用已声明的 `url` 配置字段；双地址方法可另用 `websiteFallbackField` 显式引用基础地址字段。网站覆盖值缺失、为空文本或仅含空白时使用回落值，字段默认值仍按声明生效；非空覆盖值优先，非法时不改用另一目标。最终候选继续经过网址安全校验，整体配置问题仍单独诊断；该选择不修改实例配置、认证目标或程序上下文（Context）。未声明回落字段时不按常见字段名猜测基础地址。

`programs` 是命名程序对象：`bundled` 使用技能（Skill）目录相对 `entry` 和可选 `runtime`；`installed` 使用独立 `executable` 名称。二者可以声明参数数组、`helpArgs`、`dependencies` 和 `installHint`；版本检查使用 `version: {args, constraint}`。所有随附运行代码放在声明入口所属的同一附件树，通常为 `scripts/`，例如 `scripts/bin/client.mjs` 与 `scripts/lib/`；通用启动会观察该树的当前文件，文档与配置附件继续按各自职责保存。独立安装程序的内部依赖不由启动入口完整证明，应声明依赖及版本检查并由该方法自行核验实际可用性。只读测试与动态选择在 `hooks` 引用程序并声明 `effect: read`，不得借测试发布配置或部署。动态发现可使用 `inputs` 列出所需字段引用，让地址与认证齐备后先发现业务范围；只降低该发现动作对未给配置字段的必填要求，所有已给值仍校验，完整认证和认证目标边界不变。省略 `inputs` 沿用完整配置检查，连接测试始终检查完整配置。

共享认证绑定的是声明接收方 `kind/entry/runtime/executable/args`，不保存本机程序绝对路径。目录返回 `declarationRevision`（声明文件摘要）、`programRecipients`（本机实际接收方位置或缺失）及当前 `revision`；后者同时观察声明与本机位置。输入 `expected.definitionRevision` 使用刚读到的 `revision`，不得用 `declarationRevision` 替代。目录读取只定位程序，不执行版本探测或登录；缺失程序仅影响使用它的动作。相同机器程序位置变化后重读当前接收方再继续；换机器在声明相同、依赖可用且没有个人组时使用团队组，不为路径差异改写团队文件。旧版独立程序的路径耦合认证若被诊断为失效，须明确重新录入该组，不能猜测迁移。

## 私有上下文与写前再核验

个人授权程序须声明 `contextProtocol: buildr.connection-authorization-context/v1`。它不作为普通业务认证接收方，不用于只读槽位；新增此专用程序不改变既有业务程序的稳定认证接收集合，但仍进入定义与执行观察。宿主通过 `{type: 'buildr.connection-authorization-context', context}` 发送本次 `protocolVersion/callId/workspace/definition/connection/privateStateRoot`；`connection` 包含准确实例 `id`、有限前置配置 `config` 和三项 `revisions`，默认没有旧认证。只有显式声明 `reuseFields` 时才另经 `context.reusableAuthentication` 私有交付本实例同一有效绑定的指定字段，其他实例及未声明字段不会交付。授权程序只在本次受限 `privateStateRoot` 创建临时资源，收到父通道断开、终止或 `{type:'buildr.connection-authorization-cancel',callId}` 时关闭本次浏览器并清理。

## 按需站点会话

已有个人共享浏览器基础时，不必要求用户逐连接点击授权。方法可在 `authentication.authorization` 声明：

- `parameters`：最多16个独立非秘密字段，使用现有字段类型，不使用动态选项或条件。调用输入 `parameters` 经过校验，以 `context.authorizationParameters` 交付。
- `reuseFields`：最多32个已声明认证字段；仅用于相同绑定的本实例本人组，默认不交付旧组。声明复用后，授权程序及其参数、允许字段集合纳入认证接收方绑定；首次增加或改变旧字段接收范围不能静默沿用旧组，需显式重新授权。程序仍交回完整新组，不自行保存凭证。不声明复用的原授权程序保持原绑定，避免破坏已有方法。
- `identityFields`：必填非秘密认证字段，表达同一站点稳定本人身份，不能使用显示名冒充稳定身份。
- `sessionCheck: {program,args,effect:read,requiredParameters?:[...]}`：引用普通私有程序。该程序只读检查准确参数目标，接收完整所选认证及 `authorizationParameters`，唯一输出 `{sessionStatus:"valid"|"expired"|"unknown"|"identity-mismatch"}`。权限拒绝、网络失败和模糊响应不能判为 expired；该声明需要 `identityFields`。`requiredParameters` 只能引用已声明参数，限定按需准备前必须给出的目标；显式手工授权仍遵循参数本身的 `required`，可保留原恢复入口而不让缺少自动目标触发全量登录。

正常使用前由智能体调用 `auth ensure --connection <id> --file -`，输入 `{expected:{teamRevision,localRevision,definitionRevision},parameters?:{...},browserMode?:headless|interactive}`。有效则直接复用；个人组缺失或明确 expired 时最多后台授权一次，保存前比较稳定身份，之后再检查目标会话。返回最新公开 `instance` 及 `renewed`，后续动作须使用新 `instance.revision`。

未知、身份变化、取消、版本冲突和保存待核验均不自动重试。只有明确 `interaction-required` 时才请求本人完成实时交互；不得把每个连接缺业务凭证都变成人工步骤。该动作不执行、重放或恢复业务写入。未声明此能力的旧方法保持原行为；新协议未可用前不覆盖旧方法。命令行接口（CLI）与 `POST /connection-skills/instances/<id>/auth/ensure` 共用同一应用。

成功时发送唯一 `{type:'buildr.connection-auth-result',callId:context.callId,status:'success',values:<声明要求的完整认证组>}`，等待进程间通信（IPC）发送回调完成后断开并正常退出。不得把完整组写到标准输出（Standard Output）、标准错误（Standard Error）、文件回执或普通日志。宿主抑制授权输出，重新校验当前观察、认证组及目标后保存；单纯发送消息不等于保存成功。普通业务程序仍使用下述原上下文，不能接收或模拟授权上下文。

失败消息只允许 `{type:'buildr.connection-auth-result',callId,status:'failure',reason}`，`reason` 使用固定枚举 `dependency-unavailable|browser-closed|session-invalid|cancelled|timeout|authorization-failed`。宿主将其映射为固定诊断，不接受或转述程序任意错误正文，避免错误中出现新令牌；失败不会保存认证。

Node.js 随附程序通过独立进程间通信（IPC）接收 `{type: 'buildr.connection-context', context}`。认证不进入业务标准输入（Standard Input）、参数或普通环境；只消费本次明确命名的实例。精简结构如下，尖括号均为占位，不能写入真实秘密：

```json
{
  "protocolVersion": "buildr.connection-context/v1",
  "callId": "<本次调用编号>",
  "workspace": {"id": "<工作空间编号>", "root": "<本机工作空间目录>"},
  "definition": {"skillAssetIdentity": "<技能资产身份>", "definitionId": "example", "revision": "<本次定义观察>"},
  "connections": {
    "primary": {
      "id": "<明确选择的实例编号>",
      "revision": "<实例观察>",
      "revisions": {"teamRevision": "<团队观察>", "localRevision": "<个人观察或absent>", "definitionRevision": "<定义观察>"},
      "config": {"website": "https://example.invalid/"},
      "authentication": {"source": "team", "values": {"username": "EXAMPLE_USER", "password": "EXAMPLE_PASSWORD"}},
      "authenticationRevision": "<所选整组认证观察>"
    }
  },
  "privateStateRoot": "<宿主提供的本机私有状态目录>"
}
```

`run` 的主实例名固定为 `primary`；显式 `--context <name>=<id>@<revision>` 可增加同一接入来源的命名实例，不按类别（Category）自行选取。草稿测试和发现只提供 `primary`，其 `revision/authenticationRevision` 为 `draft`，没有 `revisions`。个人认证整组替换团队认证，缺失或失效不能自行回退。`privateStateRoot` 用于提供者（Provider）自己的受限本机状态，不是其他连接的认证发现入口，也不进入共享身份。

外部写入前发送 `{type: 'buildr.connection-revalidate', requestId: '<唯一编号>', callId: context.callId}`，等待相同 `requestId` 的 `{type: 'buildr.connection-revalidated', ok: true}`。失败、断开或超时就停止旧上下文（Context），不换认证重试。此校验只核对本机当前事实；专业授权、远端对象版本和副作用保护仍由专业程序执行。草稿槽位（Hook）没有写前再核验能力，不能把它用于真实写入；其只读测试无需请求这项能力。

## 槽位输出与退出结果

`test/discover` 的标准输出（Standard Output）必须只有一个 JSON 对象，前后可有空白，不能夹杂日志、进度行或多个对象。必需 `status` 为 `success`、`failure` 或 `unknown`，固定状态及字段名属于协议控制，不按密码子串改写；诊断日志使用标准错误（Standard Error），且不能包含认证或远端秘密回显。`run` 的专业结果由该方法定义，不受以下槽位（Hook）字段限制。

| 字段 | 约定 |
| --- | --- |
| `status` | 必需；`success/failure/unknown` |
| `checks` | 可选数组；本次实际执行的检查 |
| `diagnostics` | 可选数组；失败、冲突或未知原因 |
| `limitations` | 可选数组；未证明的范围 |
| `warnings` | 可选数组；不等同失败的观察 |
| `options` | 动态发现的 `{value: string, label: string}` 数组；不能返回数值编号 |
| `truncated` | 可选布尔值；选项是否不完整 |

宿主每类说明数组最多保留 100 项，动态选项最多 1000 项，标签最长 2048 个字符；超限选项截断并标记限制。除上述字段与 `error.message`（并入诊断）外，不依赖其他字段进入通用表单。完整专业结果另走 `run` 或明确的私有产物（Artifact）。

```json
{"status":"success","checks":["已读取本机模拟上下文"],"diagnostics":[],"limitations":["未访问真实系统"],"warnings":[],"options":[{"value":"example-scope","label":"模拟范围"}],"truncated":false}
```

```json
{"status":"failure","checks":[],"diagnostics":["必要输入不符合已知要求，未执行请求"],"limitations":[],"warnings":[]}
```

```json
{"status":"unknown","checks":["请求已发出"],"diagnostics":["无法确认结果，先查询记录再判断"],"limitations":["没有取得可核验响应"],"warnings":[]}
```

| 程序与输出 | 宿主结果 |
| --- | --- |
| 正常退出且退出码为 0，合法 `status: success` | `success`；只证明声明的检查范围 |
| 正常退出，合法 `status: unknown` | `unknown`，不因退出码为 0 宣称成功 |
| 正常退出但非零退出码、`status: failure` 或无效输出 | `failure`；不能仅凭退出码推断远端没有执行 |
| 超时、输出超限或无法启动 | `unknown`；部分输出不作为接续依据 |

只输出 `{"options":[]}`、混入普通日志、返回数值选项均为无效结果。模板 `--self-test` 不接收上下文（Context）或认证；声明中的 `test/discover` 则用虚构实例经 Buildr 私有通道验证上述协议，只返回固定模拟范围。替换为真实适配后按实际证明范围修改检查和限制，不沿用模拟成功作为真实能力证据。

程序不打印认证、登录令牌或远端认证回显；诊断保持有界。通用启动成功、请求受理、构建或发布成功、回读一致、服务加载和业务验证分开表达。超时不证明远端未执行；结果未知先查询记录再判断，不能盲目重复提交。原始业务内容作为专业产物（Artifact）保留，不能把隐藏秘密后改变的文本冒充原文继续用于摘要和写入。需要准确标识、原文或后续授权依据时，由方法提供调用方明确选择的受限本机文件或等效私有产物（Artifact）；预检冲突和写入权限，说明原样读取、权限和失败后的接续方式，不能因本机保存失败否定已成立的外部事实。参数名称和格式由专业方法定义，不扩展通用启动协议。

程序安装、本机登录、技能（Skill）投射与真实验证分别维护。现有远端 `resolved.kind: skill-url` 只有单个 `SKILL.md`，不能视为完整附件包；完整私有成果可由组织自己的代码库（Repository）分发，再使用本地登记。实际共享配置与团队认证属于用户实例文件，个人覆盖属于本机整组认证，不进入技能源和公开交付物。

Node.js 程序及进程间通信（IPC）模板提供本轮已验证的路径；其他语言的私有通道适配、独立程序内部依赖及其他操作系统（Operating System）应记录实际验证范围，未实测不能根据声明或安装状态推断已经可用。

## 专业部署程序

持续集成与交付（CI/CD）等专业能力继续由用户自己的连接技能（Skill）和 `programs` 声明实现，通过通用 `buildr connection-skill run` 调用。程序接收明确选择的实例与观察版本（Observed Revision），认证使用私有上下文（Context）；输入、输出、目标版本、授权及结果核验由该专业方法定义。

服务本地运行模块暂不提供部署计划、提交、最近结果或专属部署协议；不要在 `runtime.yml` 为新接入登记部署绑定。已有用户连接、技能（Skill）、配置与历史不会因此自动删除。请求受理、远端完成和业务生效分别核对，结果未知先调查，不盲目重试。

## 实例身份与文件定位

Buildr 在 `connections/instances/` 管理一实例一文件。新建及保存时，文件名使用 `<系统>-<环境>--<唯一后缀>.yml`，例如 `nacos-qa--<12位后缀>.yml`；系统取声明的 `systemId`，未声明时取 `definitionId`，环境为空或清理后为空时用 `default`。片段会规范化并限制长度，保留中文；后缀由完整 `id` 的 SHA-256 摘要前 12 位生成。命名和路径整理属于通用应用，不由专业技能（Skill）或程序实现。

正文完整 `id` 是身份权威，名称与文件名只帮助辨认。列表、详情及来源影响说明中的 `sourcePath` 才是实际路径，不从 `id`、系统或环境手拼。只读发现保留已有 `<id>.yml` 或人工改名文件，下一次保存时整理名称；仅改文件名不改变内容观察版本（Observed Revision）及按 `id` 归属的个人认证。正文环境改变仍需当前观察版本保存。

不同 `id` 的同类、同地址甚至同名实例可以共存。先核对绑定来源、完整目标范围和用途；仍无法唯一确认就请用户明确选择，不能按文件名、名称或列表顺序取第一个。运行使用所选完整 `id` 和新读取的 `revision`；同目标实例仍访问同一外部环境。两个文件含相同 `id` 是身份冲突，不能当作两个可选实例；相关文件保留并局部诊断，其余唯一实例继续可用。

## 实例管理输入示例

先读 `definitions list --json` 得到准确绑定字段与声明 `revision`。下面仅用虚构值和占位；所有认证输入写入用户授权的受限文件或标准输入（Standard Input），不放在命令参数。创建使用 `buildr connection-skill create --file <input.json> --json`：

```json
{
  "id": "example-test",
  "name": "示例测试连接",
  "environment": "测试",
  "enabled": true,
  "binding": {"skillAssetIdentity": "<observed-asset>", "definitionId": "example", "sourceIdentity": "<observed-source>", "configVersion": 1},
  "config": {"website": "https://example.invalid/"},
  "authentication": {"intent": "replace", "values": {"username": "EXAMPLE_USER", "password": "EXAMPLE_PASSWORD"}},
  "expected": {"teamRevision": "absent", "definitionRevision": "<observed-definition-revision>"}
}
```

更新先读 `get --connection <id> --json`，提交完整当前绑定、配置及名称，使用 `update --connection <id> --file <input.json>`。`expected.teamRevision` 和 `expected.definitionRevision` 取刚读值；团队认证用 `intent: keep` 保持、`replace` 提交完整组、`remove` 移除。账号、认证目标或接收方变化不能仅保持旧组。未知或冲突后重读，不用旧输入盲目重试。

运行先读取所选实例，再使用 `run --connection <完整id> --expected-revision <刚读revision> --program <程序编号> -- <专业参数>`。需要等待外部状态变化时，由专业程序内部进行有界只读查询，仅在语义状态变化、失败、超时或完成时返回精简结果；可在 `--` 前通过 `--timeout-ms <10..300000>` 选择宿主运行时限，省略仍为60000毫秒。专业等待窗口应短于宿主时限，为单次请求、清理和输出预留余量，并通过准确对象身份及受限本机结果支持接续。宿主继续在程序退出后统一遮蔽完整输出，不把等待超时解释为外部业务失败，不自动再次执行外部写入。

交付前在隔离现场创建两条同类同目标、不同 `id` 的实例，分别调用并核对上下文；用虚构配置及认证确认没有串用，不把认证值输出作证据。

个人保存使用 `auth set --connection <id> --file <auth.json>`，输入 `{ "values": {"username": "EXAMPLE_USER", "password": "EXAMPLE_PASSWORD"}, "expected": {"teamRevision": "<observed-team-revision>", "localRevision": "<observed-local-revision>", "definitionRevision": "<observed-definition-revision>"} }`。显式恢复团队使用 `auth use-team`，提交同一 `expected`，不含 `values`；不存在个人组的观察值为 `absent`。个人组存在但不完整或失效时不自动恢复团队。

已保存实例只读测试使用 `test --connection <id> --json`。草稿测试使用 `test --file <draft.json>`：包含可选已保存实例 `id`、完整 `binding` 和 `config`、上述观察 `expected`，以及 `authentication: {source: team|personal, intent: replace, values: <完整候选组>}`；`keep` 仅适用于相应已保存完整组。新草稿使用 `teamRevision: absent`。动态选择使用 `discover --file <draft.json>` 并增加 `hook: <声明槽位编号>`。测试不保存候选，也不变更当前生效认证；没有测试槽位就明确未提供。
