## Why

用户在真实业务工作空间使用服务本地运行时反馈四个缺口：服务编辑无法登记类型；前端只能声明一个后端且本地目标要求同范围唯一就绪实例，并行任务各起一套前后端时无法显式选择连接哪套后端；后端运行卡的「打开」按钮对纯后端无意义；目录浮层无边框、不可读。前端连接多个后端服务并逐个选择目标是真实存在的开发验证需求，现在需要把该能力做实。

## What Changes

- `services/<code>/runtime.yml` 的 `local.backend` 扩展为 `local.backends` 声明列表；每项仍是 serviceCode + environmentVariable + remoteUrl，旧单对象声明兼容读取。
- 启动/重启按声明逐个后端解析目标：显式选择的实例、同范围唯一就绪实例或远程地址；逐后端注入各自环境变量，运行记录保存逐后端实际连接。
- 服务详情/任务的启动与切换对话框按声明后端服务分组列出全部已就绪实例（跨范围可列、标注来源），每个后端独立选择「默认自动 / 指定实例 / 远程」；去掉与标题重复的大块告警，保留实例与影响的小字说明。
- 任务组合启动对声明的多个后端逐个等待所选实例或按规则回落。
- 「编辑服务」抽屉暴露已有 `type` 字段；服务运行摘要透出 `type`；运行卡「打开」仅对 `frontend` 类型显示，地址仍可复制。
- 服务目录「本地运行」浮层改为带边框的结构化条目。

无破坏性变更：旧 `local.backend` 声明、旧运行记录的 `connection` 字段与 `connection local|remote` 输入语义保持兼容。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `service-runtime-operations`: 运行定义支持多后端声明列表；运行实例保存逐后端连接；前端连接选择改为按后端服务分组的实例级显式候选；本地运行视图按服务类型控制「打开」入口。

## Impact

- `projects/product/services/buildr/`：运行定义解析与渲染、运行记录结构、启动/重启目标解析、任务组合启动、HTTP/CLI 契约与输出。
- `projects/product/services/buildr-web/`：service-runtime 客户端类型、启动/切换对话框、运行卡、目录浮层、编辑服务抽屉。
- `projects/product/services/buildr/resources/runtime/skills/buildr/references/local-services.md`：智能体（Agent）对多后端声明与连接选择的指引。
- 兼容面：`local.backend`、单 `connection` 记录、`connection local|remote` 与 `expectedBackendRunId` 输入继续可用；客户端逐后端目标为新增可选输入。
