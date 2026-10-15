# 接入成果约定

新连接技能源统一使用 `skills/connections/<skill-id>/`，完整包含 `SKILL.md`、`assets/connection.yml`、必要 `scripts/` 和 `references/`。内置与公司自有来源遵守同一目录规范，身份继续独立；制作指引自身位于普通技能（Skill）目录。唯一登记仍是 `skills/manifest.yml` 的 `path: connections/<skill-id>`；目录存在不等于已启用。`skills add --source` 根据 `connectionDefinitions` 将新完整源放入标准位置；本地已有目录登记必须使用标准位置，非标准清单条目在连接目录中局部诊断。安装其他同系统方法不改变既有实例绑定。

`connectionDefinitions` 引用技能（Skill）受支持附件目录内的文件；连接定义使用 `(assetIdentity, definitionId)` 加 `sourceIdentity` 绑定，不按类别（Category）路由。`assets/connection.yml` 使用 `buildr.connection-definition/v1`：名称、说明、类别、配置版本、配置字段、完整认证字段、认证目标字段、程序、只读槽位和展示引用。程序帮助定义专业命令，Buildr 不预定义业务动词。

`connectionDefinitions` 是 Buildr 支持的技能（Skill）头部扩展；部分通用校验器的字段白名单不包含它。用 Buildr 实际登记和 `definitions list` 核对该扩展，不因通用白名单提示删除有效声明或修改上游校验器。需要保持通用头部时，可不写此字段，登记时显式使用 `--connection-definition`，仍须验证完整附件与绑定。

字段支持 `string`、`url`、`integer`、`boolean`、`enum`、`select`、`multiselect`，认证组另支持 `secret`。`required` 检查字段存在；需要非空文本时声明 `minLength: 1`，允许空密码时不增加该约束。使用 `minLength/maxLength`、`minimum/maximum`、固定 `values`、`optionsFrom` 及 `dependsOn: {field, equals}` 表达简单条件。不允许任意脚本表达式；秘密字段不能有默认值，不能进入摘要或网站字段。网站只接受不嵌账号密码的 HTTP/HTTPS 地址，不能用查询或锚点参数承载密码、令牌；普通页面锚点保留。

动态选项使用 `options: [{value: string, label: string}]`，单选与多选分别保存文本编号和文本编号数组。程序将数值编号规范为文本后返回，不依赖页面静默转换；非法选项只使该次发现失败，不使连接整体不可用。提供者（Provider）不能预先用隐藏文本改写选项编号；编号与已知秘密重合时由宿主明确拒绝该次发现，不生成替代身份，可按该方法支持的准确只读定位或私有产物（Artifact）接续。单选与多选的固定 `values` 同样必须为文本编号；数值或布尔固定值使用 `enum`。固定枚举及条件相等值可使用文本、布尔值或有限数值，不能使用 `NaN` 或无穷值。

`presentation.categoryLabel` 与 `methodLabel` 仅提供类别和接入方式的纯文本展示名，不参与选择或授权。`groups` 是有序区块数组，每项为 `{id, title, fields, collapsed?}`；`fields` 使用 `config.<key>` 或 `authentication.<key>` 引用，可混合编排地址、团队认证与业务范围，每个字段至多出现一次。未列字段由通用页面回落展示；低频内容声明 `collapsed: true`，不能隐藏必需保护或通过任意界面代码执行操作。实例名称、环境、启用状态与默认收起的个人账号入口由 Buildr 维护，不重复声明。

`programs` 是命名程序对象：`bundled` 使用技能（Skill）目录相对 `entry` 和可选 `runtime`；`installed` 使用独立 `executable` 名称。二者可以声明参数数组、`helpArgs`、`dependencies` 和 `installHint`；版本检查使用 `version: {args, constraint}`。所有随附运行代码放在声明入口所属的同一附件树，通常为 `scripts/`，例如 `scripts/bin/client.mjs` 与 `scripts/lib/`；通用启动会观察该树的当前文件，文档与配置附件继续按各自职责保存。独立安装程序的内部依赖不由启动入口完整证明，应声明依赖及版本检查并由该方法自行核验实际可用性。只读测试与动态选择在 `hooks` 引用程序并声明 `effect: read`，不得借测试发布配置或部署。动态发现可使用 `inputs` 列出所需字段引用，让地址与认证齐备后先发现业务范围；只降低该发现动作对未给配置字段的必填要求，所有已给值仍校验，完整认证和认证目标边界不变。省略 `inputs` 沿用完整配置检查，连接测试始终检查完整配置。

共享认证绑定的是声明接收方 `kind/entry/runtime/executable/args`，不保存本机程序绝对路径。目录返回 `declarationRevision`（声明文件摘要）、`programRecipients`（本机实际接收方位置或缺失）及当前 `revision`；后者同时观察声明与本机位置。输入 `expected.definitionRevision` 使用刚读到的 `revision`，不得用 `declarationRevision` 替代。目录读取只定位程序，不执行版本探测或登录；缺失程序仅影响使用它的动作。相同机器程序位置变化后重读当前接收方再继续；换机器在声明相同、依赖可用且没有个人组时使用团队组，不为路径差异改写团队文件。旧版独立程序的路径耦合认证若被诊断为失效，须明确重新录入该组，不能猜测迁移。

## 私有上下文与写前再核验

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

运行先读取所选实例，再使用 `run --connection <完整id> --expected-revision <刚读revision> --program <程序编号> -- <专业参数>`。交付前在隔离现场创建两条同类同目标、不同 `id` 的实例，分别调用并核对上下文；用虚构配置及认证确认没有串用，不把认证值输出作证据。

个人保存使用 `auth set --connection <id> --file <auth.json>`，输入 `{ "values": {"username": "EXAMPLE_USER", "password": "EXAMPLE_PASSWORD"}, "expected": {"teamRevision": "<observed-team-revision>", "localRevision": "<observed-local-revision>", "definitionRevision": "<observed-definition-revision>"} }`。显式恢复团队使用 `auth use-team`，提交同一 `expected`，不含 `values`；不存在个人组的观察值为 `absent`。个人组存在但不完整或失效时不自动恢复团队。

已保存实例只读测试使用 `test --connection <id> --json`。草稿测试使用 `test --file <draft.json>`：包含可选已保存实例 `id`、完整 `binding` 和 `config`、上述观察 `expected`，以及 `authentication: {source: team|personal, intent: replace, values: <完整候选组>}`；`keep` 仅适用于相应已保存完整组。新草稿使用 `teamRevision: absent`。动态选择使用 `discover --file <draft.json>` 并增加 `hook: <声明槽位编号>`。测试不保存候选，也不变更当前生效认证；没有测试槽位就明确未提供。
