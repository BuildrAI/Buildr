# 命令与结果

本模板没有真实系统适配。以下操作只证明模板可执行、宿主私有上下文（Context）可消费及槽位（Hook）格式有效，不证明外部账号、权限或业务结果。

- `node scripts/client.mjs --help`：直接查看帮助，不接收认证、不联网。
- `node scripts/client.mjs --self-test`：直接运行离线模板检查，不接收上下文（Context）或认证。
- `buildr connection-skill test --connection <模拟实例编号> --json`：使用明确保存的虚构实例验证私有上下文（Context）；结果应为 `status: success`，并明确业务未实现。
- `buildr connection-skill discover --connection <模拟实例编号> --hook scopes --json`：返回固定 `example-scope` 选项；正式接入应替换为有界只读发现，保持 `value/label` 都是文本。

实例输入参考制作技能（Skill）的接入约定，从当前 `definitions list` 取得准确绑定及观察版本；不要把真实账号放入示例。草稿的 `test/discover --file <draft.json>` 采用同一格式，并明确 `authentication.source/intent`。测试和发现不保存候选，不改变当前认证来源。

槽位（Hook）的标准输出（Standard Output）仅为单个 JSON 对象，必需 `status: success|failure|unknown`；说明数组使用 `checks/diagnostics/limitations/warnings`，发现另有 `options/truncated`。正常成功退出码为 0；失败返回非零退出码，未知不能冒充成功，超时先调查再判断，不盲目重试。

需要持续集成与交付（CI/CD）等专业程序时，在 `programs` 中声明真实能力，通过通用 `buildr connection-skill run` 调用；业务输入与结果由专业方法定义。本模板不提供服务部署协议或可直接提交的部署样例。

替换真实适配时，保留明确实例选择、完整认证组和写前上下文（Context）再核验，另行验证远端对象版本与授权。结果包含秘密、准确标识或写入依据时，提供调用方明确选择的受限本机产物（Artifact）；普通展示可能隐藏秘密，不能复制为原文或授权依据。参数和格式由真实系统方法定义。
