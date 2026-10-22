# 命令与结果

本模板没有真实系统适配。以下操作只证明模板可执行、宿主私有上下文（Context）可消费及槽位（Hook）格式有效，不证明外部账号、权限或业务结果。

- `node scripts/client.mjs --help`：直接查看帮助，不接收认证、不联网。
- `node scripts/client.mjs --self-test`：直接运行离线模板检查，不接收上下文（Context）或认证。
- `buildr connection-skill test --connection <模拟实例编号> --json`：使用明确保存的虚构实例验证私有上下文（Context）；结果应为 `status: success`，并明确业务未实现。
- `buildr connection-skill discover --connection <模拟实例编号> --hook scopes --json`：返回固定 `example-scope` 选项；正式接入应替换为有界只读发现，保持 `value/label` 都是文本。

实例输入参考制作技能（Skill）的接入约定，从当前 `definitions list` 取得准确绑定及观察版本；不要把真实账号放入示例。草稿的 `test/discover --file <draft.json>` 采用同一格式，并明确 `authentication.source/intent`。测试和发现不保存候选，不改变当前认证来源。

槽位（Hook）的标准输出（Standard Output）仅为单个 JSON 对象，必需 `status: success|failure|unknown`；说明数组使用 `checks/diagnostics/limitations/warnings`，发现另有 `options/truncated`。正常成功退出码为 0；失败返回非零退出码，未知不能冒充成功，超时先调查再判断，不盲目重试。

部署适配器（Deployment Adapter，只有 CI/CD 接入需要）：`scripts/deployment-adapter.mjs` 实现服务运行与部署（Service Runtime & Deployment）契约。输入经标准输入（Standard Input）交付单个 JSON 对象 `{protocol: 'buildr.service-deployment/v1', action: 'submit'|'list-branches', service.code, environment, target, targetRef, plan?}`，认证只走私有上下文（Context）。输出只能是单个 JSON 对象：`submit` 必需 `state: success|submitted|failed|unknown`，可选 `version`（省略时宿主记为 `分支@提交前 7 位`）、`at`、`externalUrl`（只接受 `http`/`https`）与 `diagnostics`（宿主最多保留 20 项、每项 1024 字符）；`list-branches` 返回 `branches: [{branch, commit, integration?}]`（最多 200 项），只读发现不提交任何内容。受理不等于成功；超时、输出超限、无法启动或输出无法解析都保留 `unknown`，宿主不自动重试同一“服务＋环境＋分支＋提交”计划，程序未启动则记为 `failed` 并说明提交未发出。离线核对样例：`node scripts/deployment-adapter.mjs --mock success|failed|unknown|branches` 与 `node scripts/deployment-adapter.mjs --self-test`。真实适配在 `submit` 前 `await revalidate(context)`，未发出提交报 `failed`，可能已发出报 `unknown`；外部构建阶段与日志留在外部系统，只回传外链。服务侧只需在 `services/<service>/runtime.yml` 的 `environments.qa` 下写 `connectionId`、`program`、`target`、`targetRef` 与 `integrationBranch`；其他环境在同一 `environments` 映射增加编号即可，无需改动产品代码；更换 CI/CD 提供者实现同一契约即可，无需宿主代码改动。

替换真实适配时，保留明确实例选择、完整认证组和写前上下文（Context）再核验，另行验证远端对象版本与授权。结果包含秘密、准确标识或写入依据时，提供调用方明确选择的受限本机产物（Artifact）；普通展示可能隐藏秘密，不能复制为原文或授权依据。参数和格式由真实系统方法定义。
