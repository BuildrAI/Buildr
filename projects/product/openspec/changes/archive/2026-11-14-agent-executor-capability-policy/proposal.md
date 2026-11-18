## Why

Buildr 已接入 Codex、DSH、Qoder、Qoder CN 与 Claude Code，但“哪个执行方能用哪些模型来源”“原生账号是否走原生直通”“原生工具详情从哪里读”“独立程序从哪里下载”这些规则，仍以供应商标识的硬编码分支散落在 `buildr-agent` 的对话、服务装配、模型网关、原生内容读取与程序准备，以及 `buildr-web` 的模型选择、准备说明和账号卡片中。即将接入的 Antigravity CLI（`agy`）同时具备“只用自己订阅”“订阅不可共享给其他执行方”“程序不经 npm 分发”三种新组合，继续追加品牌分支会扩大漏改与行为不一致风险。现在先把这些规则收敛为执行方与模型来源各自声明、由服务端统一判定的能力策略，并让程序准备支持官方发布清单归档分发，作为 [任务说明](@task/antigravity-subscription) 第一步。

本变更不改变现有五个执行方与全部模型来源对用户可见的行为，不包含破坏性变更。

## What Changes

- 执行方声明模型消费策略：能否经本机模型网关消费其他来源及其入口协议、关联的原生账号来源与绑定方式（沿用租约或按账号身份）、是否只接受自身原生来源、是否需要平台基础登录。对话发送校验、原生直通路由与网关配置统一按声明判定，移除按 `qoder`、`qoder-cn`、`claude-code` 等标识的分支。
- 明确两条模型路径的绑定契约：网关路径先签发租约；原生直通路径中，Qoder、Qoder CN 保持现有租约绑定，新增“按账号身份绑定、不签发租约”的方式，供不提供网关推理的来源使用；两条路径各自的输入、身份校验与失败行为写入规范。
- 模型来源声明共享范围与推理方式：默认可经网关供兼容执行方使用；可声明仅供指定执行方原生使用、或不提供网关推理（不可签发租约、不可用于单次生成）。
- 区分静态兼容与发送时可用性：账号视图公开服务端唯一判定的静态兼容结论，前端据此标记不可选；登录、过期、停用、身份变化等由服务端发送时按固定顺序实时校验（保留 Qoder CN 现有例外）。
- 执行方声明“无自带账号、必须选择模型来源”，Claude Code 不再返回伪造的就绪账号观察。
- 原生工具详情读取与原生内容根改由执行方注册时声明，移除按标识分派的读取链与路径拼接分支。
- 独立程序策略声明分发方式：既有 npm 包分发，或官方发布清单归档分发（按平台读取清单、逐跳校验重定向、版本格式校验、大小上限、摘要校验、单成员安全解压、校验后原子切换准备指针）。两种方式共用最新版本核对、读取失败不降级、准确版本受管目录、准备指针与回收保护；中断与并发准备不破坏旧程序与绑定；版本检查展示方式由策略声明。
- 准备说明、来源品牌名称、额度入口文案等界面显示由服务端视图提供，前端移除对应品牌分支。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-runtime-connections`：新增独立程序可由厂商官方发布清单准备（逐跳重定向、版本、大小、摘要、单成员解压、原子切换与并发中断边界）的要求；新增模型路径必须在执行前确定并各自校验的要求；新增执行方模型消费方式与原生详情来源必须由执行方声明、服务端统一判定的要求。
- `unified-model-subscriptions`：新增模型来源共享范围与推理方式由来源声明的要求，以及静态兼容与发送时可用性分别判定的要求。

## Impact

- `services/buildr-agent`：`contracts.ts`、`model-access/contracts.ts`、`application/{conversation-application,agent-service,connection-application,native-content-resolver,program-updates}.ts`、`executors/{index,model-gateway,program-policy,program-release,program-manager}.ts`、各执行方描述与 `claude` 账号观察，以及对应单元测试。
- `services/buildr-web`：`conversation-options.ts`、`lib/model-picker.ts`、`AgentProgramPreparation.tsx`、`AccountModelManager.tsx`、`account-model-view.ts`、`ConversationProcessBlock.tsx`、`types.ts` 及测试。
- 公开接口：`ConnectionView`、模型账号与目录视图新增可选只读字段；既有字段与语义保持兼容，不迁移存储、不改变已有绑定指纹或原生会话编号。
- 与进行中的 `bounded-native-history-and-latest-agent-programs`（程序最新版本读取）与 `agent-process-isolation`（执行后台独立）存在代码相邻，需在实施时基于其最新落地代码合并。
