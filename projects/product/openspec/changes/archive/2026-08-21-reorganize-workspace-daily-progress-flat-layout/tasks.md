## 1. Workspace Daily Progress 模块迁移

- [x] 1.1 将 Daily Progress Domain、Application 和 ignored YAML Repository 迁入 `src/workspace/` 对应扁平技术层，保持 schema、校验、原子覆盖和 Task 只读语义不变。
- [x] 1.2 将 Daily Progress CLI 与 HTTP Adapter 迁入 Workspace interfaces，保持命令、endpoint、JSON 和错误映射不变。
- [x] 1.3 扩展 `src/workspace/module.mjs` 私有组装和 capability/interface contributions，移除 legacy runtime、公共 CLI registry 与 HTTP Host 的旧业务接线及全局旧文件。

## 2. 无效末级目录收敛

- [x] 2.1 将 Task Record Domain、Application 和 Persistence 文件扁平化到 `src/task/` 对应技术层并更新全部 imports。
- [x] 2.2 检查其他已迁移模块的单文件末级目录，记录保留依据，只处理没有私有协作者、真实子模块或实现分类意义的目录，并排除在途 Task Delivery/Finish 范围。
- [x] 2.3 更新架构 verifier、package assertions、verification owner 和相关测试中的新路径与扁平规则。

## 3. Current Knowledge 与验证

- [x] 3.1 更新 Service 架构文档、Buildr Service/technical knowledge、Change Brief 和 knowledge impact 声明，清除 Task Record 临时 `record/` 例外与 Daily Progress 旧所有权描述。
- [x] 3.2 增补或调整 Unit/Component/System 回归，覆盖 Workspace module 注册、CLI/HTTP 行为、唯一 Store/Application 与旧路径清理。
- [x] 3.3 运行 OpenSpec strict validation、架构/package 验证、相关测试与代表性 Daily Progress CLI/HTTP 回归，修复所有本 Change 引入的问题。
