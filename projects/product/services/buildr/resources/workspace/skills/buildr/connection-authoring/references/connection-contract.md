# 接入成果约定

新连接技能源统一使用 `skills/connections/<skill-id>/`，完整包含 `SKILL.md`、`assets/connection.yml`、必要 `scripts/` 和 `references/`。内置与公司自有来源遵守同一目录规范，身份继续独立；制作指引自身位于普通技能（Skill）目录。唯一登记仍是 `skills/manifest.yml` 的 `path: connections/<skill-id>`；目录存在不等于已启用。`skills add --source` 根据 `connectionDefinitions` 将新完整源放入标准位置；本地已有目录登记必须使用标准位置，非标准清单条目在连接目录中局部诊断。安装其他同系统方法不改变既有实例绑定。

`connectionDefinitions` 引用技能（Skill）受支持附件目录内的文件；连接定义使用 `(assetIdentity, definitionId)` 加 `sourceIdentity` 绑定，不按类别（Category）路由。`assets/connection.yml` 使用 `buildr.connection-definition/v1`：名称、说明、类别、配置版本、配置字段、完整认证字段、认证目标字段、程序、只读槽位和展示引用。程序帮助定义专业命令，Buildr 不预定义业务动词。

`connectionDefinitions` 是 Buildr 支持的技能（Skill）头部扩展；部分通用校验器的字段白名单不包含它。用 Buildr 实际登记和 `definitions list` 核对该扩展，不因通用白名单提示删除有效声明或修改上游校验器。需要保持通用头部时，可不写此字段，登记时显式使用 `--connection-definition`，仍须验证完整附件与绑定。

字段支持 `string`、`url`、`integer`、`boolean`、`enum`、`select`、`multiselect`，认证组另支持 `secret`。`required` 检查字段存在；需要非空文本时声明 `minLength: 1`，允许空密码时不增加该约束。使用 `minLength/maxLength`、`minimum/maximum`、固定 `values`、`optionsFrom` 及 `dependsOn: {field, equals}` 表达简单条件。不允许任意脚本表达式；秘密字段不能有默认值，不能进入摘要或网站字段。网站只接受不嵌账号密码的 HTTP/HTTPS 地址，不能用查询或锚点参数承载密码、令牌；普通页面锚点保留。

动态选项使用 `options: [{value: string, label: string}]`，单选与多选分别保存文本编号和文本编号数组。程序将数值编号规范为文本后返回，不依赖页面静默转换；非法选项只使该次发现失败，不使连接整体不可用。固定枚举及条件相等值可使用文本、布尔值或有限数值，不能使用 `NaN` 或无穷值。

`presentation.categoryLabel` 与 `methodLabel` 仅提供类别和接入方式的纯文本展示名，不参与选择或授权。`groups` 是有序区块数组，每项为 `{id, title, fields, collapsed?}`；`fields` 使用 `config.<key>` 或 `authentication.<key>` 引用，可混合编排地址、团队认证与业务范围，每个字段至多出现一次。未列字段由通用页面回落展示；低频内容声明 `collapsed: true`，不能隐藏必需保护或通过任意界面代码执行操作。实例名称、环境、启用状态与默认收起的个人账号入口由 Buildr 维护，不重复声明。

`programs` 是命名程序对象：`bundled` 使用技能（Skill）目录相对 `entry` 和可选 `runtime`；`installed` 使用独立 `executable` 名称。二者可以声明参数数组、`helpArgs`、`dependencies` 和 `installHint`；版本检查使用 `version: {args, constraint}`。所有随附运行代码放在声明入口所属的同一附件树，通常为 `scripts/`，例如 `scripts/bin/client.mjs` 与 `scripts/lib/`；通用启动会观察该树的当前文件，文档与配置附件继续按各自职责保存。独立安装程序的内部依赖不由启动入口完整证明，应声明依赖及版本检查并由该方法自行核验实际可用性。只读测试与动态选择在 `hooks` 引用程序并声明 `effect: read`，不得借测试发布配置或部署。动态发现可使用 `inputs` 列出所需字段引用，让地址与认证齐备后先发现业务范围；只降低该发现动作对未给配置字段的必填要求，所有已给值仍校验，完整认证和认证目标边界不变。省略 `inputs` 沿用完整配置检查，连接测试始终检查完整配置。

Node.js 随附程序使用独立进程间通信（IPC）接收 `{type: buildr.connection-context, context}`，`context.protocolVersion` 为 `buildr.connection-context/v1`。认证不进入业务标准输入（Standard Input）、参数或普通环境。上下文包括调用及工作空间（Workspace）身份、定义观察、显式命名的实例及配置认证和提供者隔离的 `privateStateRoot`；程序只使用本次明确选择的实例。外部写入前发送 `{type: buildr.connection-revalidate, requestId, callId: context.callId}`，等待相同 `requestId` 的 `buildr.connection-revalidated` 消息中 `ok: true`；失败时停止旧上下文，不自行换认证重试。此校验只核对本机版本，专业授权、对象版本和副作用保护仍由专业程序执行。

程序不打印认证、登录令牌或远端认证回显；诊断保持有界。通用启动成功、请求受理、构建或发布成功、回读一致、服务加载和业务验证分开表达。超时不证明远端未执行；结果未知先查询记录再判断，不能盲目重复提交。原始业务内容作为专业产物保留，不能把遮蔽文本冒充原文继续用于摘要和写入。

程序安装、本机登录、技能（Skill）投射与真实验证分别维护。现有远端 `resolved.kind: skill-url` 只有单个 `SKILL.md`，不能视为完整附件包；完整私有成果可由组织自己的代码库（Repository）分发，再使用本地登记。实际共享配置与团队认证属于用户实例文件，个人覆盖属于本机整组认证，不进入技能源和公开交付物。

Node.js 程序及进程间通信（IPC）模板提供本轮已验证的路径；其他语言的私有通道适配、独立程序内部依赖及其他操作系统（Operating System）应记录实际验证范围，未实测不能根据声明或安装状态推断已经可用。

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

个人保存使用 `auth set --connection <id> --file <auth.json>`，输入 `{ "values": {"username": "EXAMPLE_USER", "password": "EXAMPLE_PASSWORD"}, "expected": {"teamRevision": "<observed-team-revision>", "localRevision": "<observed-local-revision>", "definitionRevision": "<observed-definition-revision>"} }`。显式恢复团队使用 `auth use-team`，提交同一 `expected`，不含 `values`；不存在个人组的观察值为 `absent`。个人组存在但不完整或失效时不自动恢复团队。

已保存实例只读测试使用 `test --connection <id> --json`。草稿测试使用 `test --file <draft.json>`：包含可选已保存实例 `id`、完整 `binding` 和 `config`、上述观察 `expected`，以及 `authentication: {source: team|personal, intent: replace, values: <完整候选组>}`；`keep` 仅适用于相应已保存完整组。新草稿使用 `teamRevision: absent`。动态选择使用 `discover --file <draft.json>` 并增加 `hook: <声明槽位编号>`。测试不保存候选，也不变更当前生效认证；没有测试槽位就明确未提供。
