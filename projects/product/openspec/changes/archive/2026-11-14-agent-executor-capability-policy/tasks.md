## 1. 锁定现状

- [x] 1.1 基于最新 `dev` 核对 `bounded-native-history-and-latest-agent-programs` 与 `agent-process-isolation` 的已合入代码，确认程序最新版本读取、执行后台契约的当前形态，并在工作树内完成必要同步；验证：工作树基线与 `dev` 无冲突，四服务现有单元测试通过
- [x] 1.2 为五个执行方 × 代表性模型来源（原生、Codex 订阅、Qoder、Qoder CN、Devin、OpenAI/Anthropic API Key、自定义）补充发送校验表征测试，覆盖可选结论、原因码与拒绝顺序（含 Qoder CN 所选原生账号就绪时旧连接观察不先行拒绝）、准备与发送两条路径的租约签发与原生直通判定、共享原生主目录、Devin+Codex 配置哈希、单次生成的来源选择；验证：新测试在重构前通过
- [x] 1.3 为升级验证路径（运行时验证 / Qoder CN 账号探针）、临时账号探针、原生工具详情读取（五家路径、越界、错误会话、错误工具身份、旧引用）与现有 npm 程序准备补充表征测试；验证：新测试在重构前通过

## 2. 执行方声明与模型路径

- [x] 2.1 在 `contracts.ts` 增加 `modelPolicy`（含 `native.binding`、`readySourceSupersedesConnection`）、`runtimeTraits`、`ExecutorObservationLost` 与 `ExecutorOpenOptions.nativeSource`（与 `gateway` 互斥），`ConnectionView` 投射公开子集，`nativeModel` 携带执行方标识；验证：`npm run typecheck` 通过
- [x] 2.2 为 Codex、DSH、Qoder、Qoder CN、Claude Code 填写声明，Claude Code 改为 `account: 'source-required'` 并移除伪造账号观察；验证：连接视图快照测试与 1.2 表征测试通过
- [x] 2.3 实现执行前路径确定（网关 / `gateway-lease` / `account-identity`），改造 `openSource()` 与准备路径：网关与 `gateway-lease` 保持租约，`account-identity` 不签发租约而校验来源就绪、身份、模型并传入 `nativeSource`；`checkedGateway()` 校验 `nativeModel` 的执行方与绑定方式；验证：1.2 表征测试原样通过，替身执行方测试覆盖 `account-identity` 成功、身份不符、模型停用、来源未就绪均零工作输入
- [x] 2.4 将 `conversation-application.ts` 发送校验按 design D2b 顺序改为读取声明，`participantHomeRoot()`、传输中断识别，`connection-application.ts` 升级验证与探针名单，`agent-service.ts` 原生账号装配与视图覆盖改为读取声明；验证：1.2、1.3 表征测试原样通过，`rg` 检查上述文件不再出现执行方品牌字面量判断

## 3. 模型来源声明与兼容判定

- [x] 3.1 在 `model-access/contracts.ts` 增加 `sharing`、`inference` 与 `presentation`，为现有全部来源补齐声明；验证：类型检查通过，账号视图快照包含新字段且旧字段不变
- [x] 3.2 实现唯一的 `sourceCompatibility()`（只判静态兼容）并接入发送校验第 7 步与租约签发；`inference: none` 拒绝签发租约并排除于 `models.generate` 与网关入口；账号视图投射 `executorCompatibility{compatible, reasonCode, reason}`；验证：单元测试覆盖共享、专属、无推理三类，以及“兼容但过期/停用时返回过期/停用原因而非不兼容”

## 4. 原生详情注册

- [x] 4.1 为五家执行方声明 `nativeContent`（会话根、安全路径、详情读取），改造 `executors/index.ts`、`native-content-resolver.ts`、`native-content-maintenance.ts`、`storage/native-content.ts` 与 `nativeTools` 登记判断为按注册查找，会话条目投射 `nativeDetail`；验证：1.3 详情表征测试原样通过，未注册执行方返回“不提供详情”的新测试通过

## 5. 程序分发策略

- [x] 5.1 在 `program-policy.ts` 增加 `distribution` 与 `versionDisplay`，现有五家迁为 `npm`；`program-updates.ts` 改读 `versionDisplay`；验证：1.3 npm 准备表征测试与版本检查测试通过
- [x] 5.2 实现官方发布清单读取：平台映射、手动重定向逐跳校验（HTTPS、主机白名单、最多 5 跳）、64 KiB 上限、字段与摘要格式校验、严格版本格式与主版本准入，读取失败不降级；验证：替身服务的单元测试覆盖成功、缺平台、非白名单首跳与中途跳、超限、非法版本（含路径分隔符）、网络失败
- [x] 5.3 实现清单归档安装：按尝试身份命名的临时目录、流式下载与 512 MiB 上限、SHA-512 校验、进程内 `tar.gz` 单成员解析（成员数 16、解出 1 GiB 上限）与直接二进制落盘、可执行权限与 macOS 隔离属性处理、`--version` 核对、原子重命名受管目录与原子更新 `prepared.json`、无主临时目录清理；验证：恶意与异常产物测试（链接、越界、多成员、缺成员、截断、超长、摘要不符、版本不符）全部失败且不留半成品
- [x] 5.4 实现同一提供者准备的互斥与尝试去重；验证：中断（下载中、解压中、切换前）与两次并发准备测试中，旧程序、`prepared.json` 与已有绑定保持可用，并发请求归并或得到进行中结果

## 6. 前端去品牌化

- [x] 6.1 `types.ts` 的 `ProviderId` 改为字符串，名称取服务端标签；`conversation-options.ts` 改用 `executorCompatibility` 生成可选与提示（字段缺失按原行为），移除 `qoderSourceNotice`/`qoderSourceUnsupported`；验证：`buildr-web` 单元测试覆盖 Qoder、Qoder CN 原有提示与可选结果不变，以及字段缺失时的兼容行为
- [x] 6.2 `AgentProgramPreparation.tsx` 改读服务端准备说明，`AccountModelManager.tsx`/`account-model-view.ts` 改读来源 `presentation`，`ConversationProcessBlock.tsx` 改读 `nativeDetail`，`model-picker.ts` 名称表退为兜底；验证：组件测试与现有快照通过，界面文案与升级前一致

## 7. 静态约束与当前认知

- [x] 7.1 新增静态检查：`buildr-agent` 公共层（`application/`、`model-access/application.ts`、`executors/{index,model-gateway,program-*}.ts`）与 `buildr-web/src/features/agent-conversations`、`src/lib` 不得出现执行方品牌字面量判断（执行方自身模块、原型与历史数据兼容除外）；验证：`npm run test:static` 通过
- [x] 7.2 更新 `knowledge/docs/architecture/agent-integration.md`，说明执行方声明、两条模型路径的绑定契约、来源共享范围与推理方式、静态兼容与发送时可用性、原生详情注册与程序分发失败边界，并按需校准 `knowledge/code-map/technical-layers.md`、`knowledge/code-map/system-services-assets.md`；同步维护 `.buildr/knowledge-impact.yml` 为本变更的影响评估；验证：文档与实现事实逐项核对，`knowledge/index.yml` 引用有效
- [x] 7.3 运行四服务静态检查与单元测试，并执行 `openspec validate agent-executor-capability-policy --strict`；验证：全部通过
