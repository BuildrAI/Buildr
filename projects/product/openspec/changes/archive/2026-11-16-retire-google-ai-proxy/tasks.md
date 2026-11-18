## 1. 退役迁移

- [x] 新增一次性退役来源读取：从 `<数据根>/CLIProxyAPI/buildr-quota.json` 读取旧自定义来源映射，校验回环 Base URL、账号 ID 与协议。
- [x] 在模型账号加载时移除 `google-ai-subscription` 账号和匹配的旧自定义来源，清理私有凭据目录与偏好，保留历史对话。
- [x] 移除 `replacesSource` 接口、旧来源隐藏逻辑与 `model_source_migrated` 分支。

## 2. 删除代理实现

- [x] 删除 CLIProxyAPI 供应商、安装器、静态模型目录、直接 OAuth 供应商和代理额度读取文件。
- [x] 更新默认供应商注册，移除代理供应商和自定义供应商的 CLIProxyAPI 额度回调。
- [x] 移除代理专属安装、生命周期、目录与协议测试，更新验证登记。

## 3. 原生 Antigravity 额度

- [x] 实现受管 `agy -p '/usage'` 读取与 TSV 解析，识别 Gemini / Claude & GPT 的每周与 5 小时窗口。
- [x] 在 Antigravity 账号探测中接入额度读取、短缓存、显式刷新和失败回退，不读取系统密钥环。
- [x] 更新原生来源展示说明与 UI，按分组显示剩余百分比和重置时间，移除代理专属模型标签。

## 4. 测试与验收

- [x] 更新单元、集成和 UI 测试，覆盖退役迁移、四窗口解析、缓存/失败回退和原生卡片渲染。
- [x] 运行 Harness 相关静态检查、单元测试、集成测试与 Harness Web 构建。
- [x] 更新架构知识说明，执行 OpenSpec 校验并在实现完成后归档变更。
