# 实施任务

## 1. 沿用模块与启动参数

- [x] 1.1 在 `services/buildr/src/web/application` 建立 preview reuse 模块骨架，定义 facet 契约、注册表、来源解析入口与逐 facet 结果模型；添加单元测试覆盖 facet 排序、未知 facet 拒绝与来源缺失失败（运行相关单元测试通过）。
- [x] 1.2 为 `web preview start` 增加 `--reuse <profile>[:facet,…]` 与 `--refresh-reuse` 解析和校验，为 `web preview stop` 增加 `--purge`；帮助文本同步；测试无参数调用保持既有参数集与行为（CLI/单元测试通过）。
- [x] 1.3 扩展 preview owner/instance 记录的可选 `reuse` 事实，并让启动结果与 `preview list` 返回来源、facet、播种/刷新时间与逐 facet 结果；测试不含凭证或敏感路径（单元测试断言字段与脱敏）。
- [x] 1.4 将 facet 执行接入预览启动：在 spawn 前按声明执行，失败不阻止启动；测试单个 facet 失败时其他 facet 与预览启动继续（单元/集成测试通过）。

## 2. model-catalog facet

- [x] 2.1 解析 `development` 来源为开发版应用数据根，与预览自身数据根分离；测试来源缺失、不可读和自定义环境变量场景。
- [x] 2.2 实现 `model-catalog` 的缺失播种：复制 `agent-service/model-access` 到预览实例根，保持账号、缓存模型与启用偏好；测试副本存在、权限为 owner-only 且来源未修改。
- [x] 2.3 实现已有副本复用与 `--refresh-reuse` 原子刷新：临时目录写入、校验后替换，失败保留旧副本；测试刷新失败不产生部分目录。
- [x] 2.4 增加预览启动集成测试：使用夹具开发版数据根断言模型目录可见启用模型、未启用模型不出现，并断言预览外部状态不受播种影响。

## 3. agent-runtime facet

- [x] 3.1 在 `services/buildr-agent` 提供连接重定位入口：只读取来源交互库的 `connections` 表，将连接体中的来源数据根前缀重定位到预览根，重新计算原生绑定并写入目标交互库；单元测试覆盖路径重写、绑定重算、会话表不复制与来源库只读。
- [x] 3.2 实现 `agent-runtime` 的文件准备：包含 `model-catalog`，复制账号、provider 登录配置（排除 `model-bindings`、`tmp` 与运行缓存）以及来源数据根内的程序；测试复制清单、排除项和系统可执行文件的只读引用。
- [x] 3.3 将连接重定位接入 facet 执行，失败连接以诊断返回且不写入指向来源根的回退记录；测试部分连接失败时其他连接与预览继续可用。
- [x] 3.4 增加集成测试：以夹具 provider 程序和配置完成一次预览内智能体执行，断言会话、附件、交接材料只出现在预览根，开发版交互库与附件未变化。
- [x] 3.5 核对 Qoder、Codex、DSH 的最小登录配置复制集；若发现 `model-bindings` 之外仍必需的文件，纳入显式清单并补充测试（provider 夹具测试通过）。

## 4. 隔离、清理与兼容

- [x] 4.1 增加会话双向隔离测试：预览与开发版分别存在会话时，列表与读取互不可见，预览刷新不写开发版。
- [x] 4.2 实现 `preview stop --purge`：停止确认、owner 匹配、路径归属和符号链接校验后删除实例根；测试成功删除及 owner 不匹配、停止未确认、越界路径的拒绝与现场保留。
- [x] 4.3 保持默认 `preview stop` 保留数据；回归测试既有停止、列表与启动 JSON 字段（无新参数时行为不变）。
- [x] 4.4 补充帮助与使用说明：`buildr web preview start|stop` 帮助说明 `--reuse`、`--refresh-reuse`、`--purge` 的来源、facet 与清理边界；CLI 帮助测试通过。

## 5. 当前知识与规范检查

- [x] 5.1 更新 `knowledge/docs/architecture/buildr-data-design.md` 的预览根说明，加入沿用副本根、来源只读、排除项与 purge 语义；核对路径与数据根表述与实现一致。
- [x] 5.2 更新 `knowledge/code-map/system-services-assets.md` 中 `web/` 与 `buildr-agent` 的职责说明，引用新的 reuse 模块与连接重定位入口；核对链接和符号存在。
- [x] 5.3 运行 `openspec validate preview-environment-reuse --strict` 与 `buildr openspec convergence preflight`，处理 active change 冲突或规范诊断后通过。
