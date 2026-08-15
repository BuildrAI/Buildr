## Context

Buildr 已有单一 verification registry、affected/full planner、独立 Browser capability 和分布式 Candidate topology。当前 Browser dispatcher 能按页面选择 selector，但没有区分“路径不适用”和“声明适用却未选中”；Browser scripts 又直接调用 Vite 写入 tracked `web-dist`。`dev` PR 的 workflow 则用同一 matrix 在 macOS/Windows 重复完整 affected plan，Browser capability 未进入 hosted feedback。

本变更跨 `buildr`、`buildr-web` 与 GitHub workflow，但不新增测试平台、第二 registry、持久 evidence store 或 Candidate shard。

## Goals / Non-Goals

**Goals:**

- 让 Browser plan 对 selected、not-applicable 与声明覆盖缺口形成机器可判定的闭合结果。
- 让 Browser smoke 证明前端源码可重建出 tracked `web-dist`，且验证不修改冻结目标。
- 让 `dev` PR 由 macOS 持有主 affected/admission 和条件 Browser evidence，Windows 只运行真实平台敏感 owner。
- 继续从单一 verification registry 推导测试选择，并保持 Candidate topology、tarball与 `Candidate gate` 不变。

**Non-Goals:**

- 不拆分现有 `system-windows-platform` 内部测试文件；更细领域分组属于后续重型测试拆分任务。
- 不把 Browser smoke 纳入本地 `test:candidate` 或 Candidate CI shards。
- 不改变 Browser capability 的 `requiredForDelivery: true`、资源容量或 Chrome 环境要求。
- 不引入跨 run cache、远端浏览器服务或新的 CI artifact authority。

## Decisions

### 1. Browser dispatcher 持有适用性闭合

Dispatcher 以 Product-relative changed paths 生成 closed plan：

- `selected`：至少一个 selector，并可进入 staging build 与 Chrome；
- `not-applicable`：没有 Browser-owned path，明确不启动构建或 Chrome；
- Browser-owned path 却无法选择 selector：以稳定 diagnostic 失败，不得成功退出。

`services/buildr-web/src/**` 继续使用页面级映射；共享 package、lockfile、Vite/TypeScript 配置和 Browser 选择机制变化使用显式完整 selector。选择规则与 `verification.yml` applicability 由 Contract test 对齐。

备选方案是让 0 selector 永远运行 `core`。该方案会把 HTTP-only 或其他非 Browser 路径错误升级为 Chrome 负担，无法表达合法 not-applicable，因此不采用。

### 2. Browser 运行前执行 staging build 与 exact tree comparison

`buildr-web` 的 Vite config 接受仅供受控构建入口传入的绝对 staging outDir。Buildr verification helper 在系统临时目录构建，递归比较 staging tree 与 tracked `buildr/src/interfaces/local-app/web-dist` 的相对路径、类型和文件 bytes；一致后才启动生产 HTTP hosting 的 Browser smoke，最终清理临时目录。

备选方案是原地 build 后运行 `git diff --exit-code`。即使最终无差异，它仍会删除并重建冻结目标，失败时还会留下 mutation，因此不采用。

### 3. Windows development feedback 是 registry 的窄投影

Registry step 可声明 `developmentRunners: [windows]`。新的 platform development planner 只在 changed paths 命中该显式 owner inputs 时选择它，并复用原 step executor、testing metadata、依赖与资源声明；空投影明确返回无平台敏感步骤。macOS 继续使用现有 `test:changed` 与同次 admission wave。

首版只标记现有 `system-windows-platform`，避免在本任务中同时拆分重型测试组。未来拆分该 owner 时，CI 无需维护第二份文件清单，只消费 registry 投影。

备选方案是在 workflow 中硬编码 Windows 测试文件或始终运行 `group:windows-npm-preflight`。前者会建立第二 authority，后者包含 release/Candidate owner且成本过高，均不采用。

### 4. Browser evidence 条件接入 macOS 主 feedback job

macOS job 使用与 affected verification 相同的 base 先输出 Browser plan。只有 `selected` 时才安装 `buildr-web` 依赖并执行 `test:browser:changed`；plan JSON与既有 timing/diagnostics一起上传。这样复用 Buildr checkout、Node、Buildr dependencies和 Workspace Node，不新增常驻 Browser job。

Windows job与 macOS job并行，只调用 platform development projection。Candidate jobs、needs、runner和 `Candidate gate` 名称保持原样。

## Risks / Trade-offs

- [Vite 输出包含非确定性内容导致误报] → exact comparison 先由 Contract/Integration 反例和本地真实构建校准；若上游确有时间戳，必须定位并消除来源，不能放宽为只比文件存在。
- [单一 Windows owner 仍较宽] → 首版只在平台敏感路径命中时执行；后续重型测试拆分可在 registry 内细化，不改变 CI 契约。
- [Browser 在 macOS affected 后顺序执行会增加 Web PR wall-clock] → 复用同一 job 的依赖与准备，且非 Web PR 只付出廉价 plan 成本；Candidate coverage不重复。
- [声明与 dispatcher applicability 漂移] → Contract test枚举 Browser declaration paths，并证明每类声明输入得到 selector或明确 not-applicable；选择机制自身变化强制 full selector。

## Migration Plan

1. 先交付 closed Browser plan 与 staging build helper及其低成本 Contract/Integration tests。
2. 在 registry 增加 Windows development projection与 planner tests。
3. 经 Declaration Intake 精确授权后更新 `verification.yml` Browser applicability/proves。
4. 修改 `verify.yml` 的 dev jobs并用 YAML/registry contract tests确认；Candidate section保持字节级无语义变化。
5. 回滚时可恢复 dev workflow 与 Browser scripts；没有数据迁移或持久状态清理。

## Open Questions

无。`verification.yml` 的精确长期写入仍按 Declaration Intake 单独取得用户确认。
