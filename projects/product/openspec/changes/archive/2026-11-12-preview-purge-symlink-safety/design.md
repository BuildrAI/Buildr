## Context

purge 的删除动作是 `fs.rmSync(target, { recursive: true, force: false })`（preview-lifecycle.ts），Node 的递归删除对符号链接只 unlink 条目、从不跟随，目录符号链接 likewise。现有 `assertPurgeTargetSafe` 却遍历实例根并拒绝任何解析到根外的活链接；agent-service 的 `registerToolCache`（buildr-agent toolchain-locations.ts）按 agent-component-sharing 设计在实例内建固定名缓存声明链接指向宿主缓存，于是已运行实例必拒。代码注释对断链已承认"never followed"，对活链接的拒绝口径自相矛盾。

## Goals / Non-Goals

**Goals:**
- 已运行实例的托管 purge 可安全回收隔离根，链接目标（宿主缓存等）不受影响。
- 保留真正保护不变量的检查：清理目标位于预览根内、为真实目录而非符号链接。

**Non-Goals:**
- 不改普通停止保留数据的语义、owner 匹配与停止确认流程。
- 不改缓存声明链接的创建与选择逻辑。
- 不引入白名单路径清单或新的登记状态。

## Decisions

1. **统一放行符号链接，而非白名单缓存声明。** 备选白名单（仅放行 `toolchains/cache-targets/*`）保留了对其他合法链接的同类误判，且需要维护路径清单；删除不跟随链接是 rm 的确定语义，越界拒绝不保护任何真实不变量，故整体移除遍历与越界拒绝。根身份检查（dirname/basename 等于预览根与实例名、lstat 为真实目录）保留，防止清理目标被替换为根外路径或链接。
2. **错误码 `preview_purge_unsafe` 保留**，仅用于根身份违规（目标不在预览根内、不存在、非真实目录），调用方诊断语义不变。
3. **以测试固定不变量**：集成测试断言 purge 后实例外目标目录与内容完好、断链随根删除，防止未来删除实现改为跟随链接时静默破坏该不变量。

## Risks / Trade-offs

- 若未来删除实现改为跟随符号链接，放行越界链接将产生真实越界删除风险；由回归测试（外部目标完好）与实现处单行注释约束缓解。
- 放行后 purge 会删除实例内全部链接条目，包括用户手工放入实例的链接；实例根属于预览隔离现场，purge 语义本就是彻底删除，符合既有承诺。