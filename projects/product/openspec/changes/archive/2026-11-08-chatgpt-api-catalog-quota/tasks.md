## 1. ChatGPT API 官方能力目录

- [x] 1.1 新增 OpenAI API 模型能力目录模块，按官方模型页表达显示名、输入模态、工具、上下文、最大输出与推理档位，并支持带日期快照归一；用单元测试覆盖 `gpt-6.1-sol`、`gpt-5.4-mini-2026-03-17` 与未知模型回退
- [x] 1.2 在 ChatGPT API provider 中消费能力目录并收紧文本对话过滤（排除 `gpt-live-*` 与 `search-api`）；用 provider 单元测试核对目录项标签、图片、推理档位、上下文与过滤结果
- [x] 1.3 核对 ChatGPT API 推理档位经本机模型网关传递且未支持档位仍被拒绝；运行 provider/网关聚焦测试

## 2. Qoder 额度与模型目录

- [x] 2.1 修正 Qoder 额度观察，解析 `addOnQuota` 并保留 `orgResourcePackage`，分别生成套餐与资源包窗口，按可用额度总量计算账号级剩余比例；用单元测试覆盖套餐耗尽但资源包有余额、额度读取失败和团队资源包
- [x] 2.2 合并 Qoder `/models` 的 `chat` 与 `app` 分组，按 key 去重并优先 `chat` 配置；用单元/集成测试覆盖 QoDuck 出现一次、重复模型去重和真实配置保留
- [x] 2.3 核对有资源包余额的 Qoder 账号不再被 `modelQuotaFailure` 误判耗尽；运行额度与模型网关聚焦测试

## 3. Web 模型来源展示

- [x] 3.1 把模型来源 `codex` 显示名改为 `ChatGPT`，新增独立执行智能体名称映射保持 `Codex`；更新状态行与来源分组测试
- [x] 3.2 模型来源快捷行改为单行横向可滚动布局；用静态样式测试核对不再使用 `flex-wrap: wrap`，并保留可聚焦按钮
- [x] 3.3 ChatGPT API 账号卡片使用模型观察时间兜底，并把额度未知说明改为 OpenAI 平台账单/用量指引；用账号视图测试覆盖模型已读取但额度不可读
- [x] 3.4 核对 ChatGPT API 模型在账号模型表中显示统一名称、图片与推理档位；运行 Web 模型选择与账号视图聚焦测试
- [x] 3.5 DSH 接入的模型来源显示为 DeepSeek，执行智能体仍显示 DSH；用来源名称、状态行和账号视图测试核对

## 4. 当前知识与验证

- [x] 4.1 更新 `knowledge/docs/architecture/agent-integration.md` 中 ChatGPT API 分类名称、官方能力补充、余额未知与 Qoder 资源包/QoDuck 事实，并核对不再保留“现有 Codex 分类”或“不按官方来源补充能力”的旧结论
- [x] 4.2 运行相关类型检查、构建与聚焦测试，记录实际通过项；未执行的付费推理或平台账单验证如实保留
- [x] 4.3 运行 `openspec validate chatgpt-api-catalog-quota --strict` 与 convergence preflight，核对规划材料与实现清单一致
