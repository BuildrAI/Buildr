## Context

Buildr 有三类由固定输入可重建的文件仍在 Git 中：`services/buildr/web-dist/**`、`services/buildr/package/targets/test-context/**`、Buildr/Buildr Web 两端 `src/**/generated/*-dto.ts`。当前 Web verifier 已能在系统临时目录重建 `web-dist`，Test Context builder 已能向任意 `outDir` 编译，DTO generator 也拥有统一 Schema authority；但正式消费者仍读取仓库副本，Candidate builder 不负责先生成全部输入。

约束包括：开发检出使用固定 Node 24.15.0 和可擦除 TypeScript；正式 npm 包不能运行源码 TypeScript、Vite 或 generator；Application Payload 和 npm 压缩包必须只形成一次并绑定确定性 manifest；Buildr Web 必须继续由 Buildr Runtime 同源托管；公开 CLI、HTTP、JSON、SQLite、Launcher 和 Test Context 子路径保持兼容。

## Goals / Non-Goals

**Goals:**

- 让人工源码、Schema、锁文件、迁移和产品资源成为 Git 中唯一权威输入。
- 让本地开发、验证和 Candidate 使用同一组显式 generator/build primitives，并让正式 Candidate 冻结一次完整生成物集合。
- 从 Git 移除 Web dist、Test Context ESM/声明和两端 DTO，同时保持干净检出可生成、可检查、可测试、可打包。
- 让生成物身份、消费者、清理和失败边界可诊断，并保持已安装 npm 包完全自包含。

**Non-Goals:**

- 不在本 Change 中迁移其他业务 `.mjs` 或普通测试到 TypeScript。
- 不改变 HTTP Schema 字段、Task/System/Workspace 业务语义、页面交互或 npm 公开 API。
- 不改变发布授权、唯一 tarball 或发布后 readback 模型。
- 不把依赖目录、临时目录、Task 状态或运行时投射变成源码 authority。

## Decisions

### 1. 区分本地物化与正式候选暂存

开发入口可以把 DTO、Test Context 和 `web-dist` 写入现有相对位置，但这些目录由 `.gitignore` 精确排除。保留相对路径可以避免 TypeScript path alias、运行时 loader 和大规模 import 改写。

正式 Candidate 不读取这些本地物化结果。Candidate owner 创建独立暂存根，显式传入 DTO 目标、Test Context 目标和 Web dist 目标，并以本次生成结果继续构建 Application Payload 与 npm 压缩包。

备选方案是让 Candidate 直接消费开发目录；它会把本机陈旧文件带入正式产物，无法证明干净构建，因此拒绝。另一个方案是把全部生成物嵌入源码模块；它会破坏标准 ESM/`.d.ts` 发布和静态 Web 托管，因此拒绝。

### 2. Generator 接受显式目标，统一编排只拥有顺序和清单

现有DTO、Test Context与Vite builder继续拥有各自格式语义，但都必须支持调用方提供输出目录。新增TypeScript构建编排器负责解析权威输入、创建目标、按固定顺序调用builder、枚举普通文件、计算SHA-256、写入排序后的生成物manifest，以及在失败时清理自己拥有的暂存。Candidate向隔离目录生成DTO身份副本后，还必须用同一次Schema render刷新源码树中ignored generated目录，供Buildr与Buildr Web的相对类型import完成编译；这些本地副本不进入Candidate identity或Git。

manifest 至少绑定 generator/tool 版本、输入身份、输出逻辑名称、相对路径、mode、size 与 digest。DTO 虽不进入 npm 包，也必须进入同一生成批次身份，证明后端和前端类型来自相同 Schema。

备选方案是保留三个互不相关的 npm scripts；它不能证明 Candidate 使用同一批次，也无法为发布消费者提供闭合身份，因此拒绝。

### 3. 类型检查先生成，再检查全部人工 TypeScript

干净检出缺少 DTO 和 Test Context 编译输出是合法初始状态。正式 typecheck/build 入口先运行生成准备，再执行 `tsc --noEmit`、前端 `tsc` 和适用 contract checks。Buildr `tsconfig` 必须覆盖 `src/**/*.ts`、全部 `tools/**/*.ts` 和 `test/**/*.ts`；不能让已改为 `.ts` 的 generator 因目录遗漏而绕过严格检查。

生成准备写入的文件被忽略，但生成检查仍可在两个临时目标重复运行并比较 manifest/bytes。没有 tracked expected copy 时，确定性证明从“与仓库比较”转为“同输入重复构建一致 + consumer compile/behavior + Candidate inventory”。

### 4. Browser 直接托管本次隔离 Web dist

Browser verifier 在系统临时目录构建 Web dist，确认文件类型、资源闭包和禁止项后，直接让隔离 Buildr Web HTTP Server 托管该目录。它不再读取、比较或修改 checkout 的 `web-dist`。阶段诊断仍保留 `web-dist → fixture → browser → assertions → cleanup`，其中 `web-dist` 阶段表示生成和验证暂存产物。

本地 `build:web` 仍可物化被忽略的 `services/buildr/web-dist` 供开发 Launcher/手动运行；这不是 Candidate 或正式 Browser evidence。

### 5. Candidate 是正式生成物的唯一冻结 owner

`createCandidatePackage`先创建DTO、Test Context和Web dist生成物集合，再把显式Web dist根和生成物manifest identity交给Application Payload builder，把显式Test Context根交给npm staging。Payload拥有独立canonical manifest和`applicationPayloadDigest`；最终release artifact同时绑定生成物identity与Payload identity。Payload builder不执行Vite、不从tracked `web-dist`复制，也不重新生成DTO/Test Context。npm staging只复制已冻结输出，并保持现有exports、bin、runtime与inventory。

发布 workflow 继续下载并消费唯一 Candidate tarball，不重新生成。相同 source commit、锁文件和工具版本重复构建必须得到相同逻辑输出 manifest；存在差异时 Candidate 在公开写入前失败。

### 6. Git 边界使用精确忽略与静态门禁

删除 tracked 生成物后，为以下路径增加精确 ignore：

- `services/buildr/web-dist/`
- `services/buildr/package/targets/test-context/`
- Buildr 与 Buildr Web 已登记 DTO generated directories

架构和开源候选 verifier 必须拒绝这些路径重新成为 tracked 文件，同时允许它们作为 ignored 本地输出存在。`package/targets/runtime/skills/buildr/SKILL.md`、锁文件、Schema、migration、图标和其他产品资源不属于此删除范围。

## Risks / Trade-offs

- [Risk] 干净检出直接运行 Web 或 typecheck 时缺少生成文件 → 由统一准备入口先生成，并提供明确缺失诊断；项目声明继续准备两个服务的锁定依赖。
- [Risk] Candidate 仍从旧目录读取陈旧产物 → builder 改为必需的显式 artifact-set 参数，测试在旧目录存在恶意陈旧文件时仍证明正式产物不受影响。
- [Risk] 重复生成增加开发耗时 → 本地允许按输入 identity 复用 ignored 输出；正式 Candidate 始终干净生成，不能复用未证明的本地缓存。
- [Risk] Vite 或 declaration emit 存在非确定性 → 用双暂存构建比较 manifest/bytes，并在差异时阻断 Candidate。
- [Risk] 一次删除跨越多个消费者 → 按“新增显式 builder → 切换消费者 → 干净检出验证 → 删除 tracked 文件”顺序迁移，任何阶段都不发布半闭合产物。
- [Trade-off] Git checkout 不再天然携带可启动 UI → 维护者必须构建；npm 用户仍获得完整预构建产物，源码仓库换取单一权威和更小历史噪音。

## Migration Plan

1. 为 DTO、Test Context 和 Web builder 增加显式输出能力，新增生成物 manifest 与双构建确定性测试。
2. 调整 typecheck/build scripts 和 TypeScript include，使干净检出先生成再编译全部人工 TypeScript。
3. 切换 Browser verifier，直接托管隔离 staging Web dist。
4. 切换 Candidate/Application Payload/npm staging，显式消费同一冻结 artifact set。
5. 更新 package/architecture/verification tests，证明旧 tracked 目录不再是正式输入。
6. 删除 tracked 生成物并加入精确 ignore；在无这些文件的干净树运行生成、typecheck、Browser、Application Payload 与 Candidate 验证。
7. 更新 Project verification source paths、技术架构、发布流程与两个 Service 当前知识，再收敛 OpenSpec。

回滚时整体回退本 Change commit，恢复 tracked 输出及旧消费者；不在半迁移状态只恢复生成文件而保留新 Candidate 输入模型。

## Open Questions

无。用户已经确认 Git 只保存源码/权威输入，正式产物由本地或 Candidate 构建生成；有明确兼容目的的 JavaScript fixture 和发布包内生成文件继续保留。
