# 将生成物移出 Git

## 摘要

Buildr 将 Git 中已跟踪的 Web、公共测试上下文和 HTTP DTO 生成物改为由干净检出在隔离暂存中确定性生成，并让浏览器验证、应用负载和唯一 npm 候选产物消费同一冻结结果。

## 背景与问题

当前人工源码、Schema 和锁文件已经是生成物的真实权威，但仓库仍保存 `web-dist`、ESM/`.d.ts` 和两端 DTO 副本。它们增加提交噪音、仓库体积、合并冲突与漂移检查成本，并让本地工作树承担候选产物存储职责。

## 目标与非目标

- 目标：Git 只保存人工源码、Schema、锁文件、迁移和产品资源；构建生成物进入忽略的本地输出、隔离候选暂存或正式发布包。
- 目标：相同源码、锁文件和固定工具链产生可复核的相同生成清单，正式发布继续复用唯一候选压缩包。
- 目标：公开 CLI、HTTP、JSON、SQLite、测试上下文 npm 子路径、Buildr Web 同源托管与 Launcher 行为保持兼容。
- 非目标：本 Change 不迁移剩余业务 `.mjs`，不重写前端页面，也不改变发布授权、任务验证报告或业务数据语义。

## 受影响角色

- Buildr 维护者：干净检出后通过声明的生成/构建入口取得本地产物，不再从 Git 获得生成副本。
- npm 使用者：继续安装包含完整运行代码、公共声明和 Web 静态资源的唯一包，不需要 TypeScript、Vite 或开发检出。

## 核心流程

1. 干净检出安装两个服务的锁定依赖。
2. 构建入口从 Schema 生成两端 DTO，从 TypeScript 生成公共测试上下文 ESM/声明，从 Buildr Web 源码生成静态资源。
3. 类型检查、契约测试和浏览器验证消费本次生成结果。
4. 候选构建冻结相同输出，应用负载和 npm 压缩包只消费冻结结果。
5. 发布流程复用已经验证的唯一候选压缩包，不重新构建。

## 关键变化、影响与风险

- 删除 tracked 生成物会改变维护者工作方式；生成入口、缺失诊断和 `.gitignore` 必须在删除前落地。
- Browser smoke 不再比较仓库副本，而是托管本次隔离生成的正式静态资源。
- 候选构建新增生成顺序和显式输入身份；任一步缺失、漂移或非确定性都必须在打包前失败。
- 最大风险是开发检查、Preview、Application Payload 或 npm pack 仍隐式读取旧路径；必须通过干净检出、重复构建、Browser 和候选压缩包验证闭合全部消费者。

## 验收摘要

- Git 不再跟踪目标生成物，精确忽略规则阻止重新提交。
- 干净检出可以通过正式入口生成、类型检查、运行 Browser smoke 并构建唯一候选压缩包。
- 两次相同输入构建的清单和关键摘要一致；正式包继续包含 Web dist、测试上下文 ESM/`.d.ts` 和应用负载。
- 已安装包不读取 Buildr Web 源码、开发依赖或源码 TypeScript。

## 技术入口

- `services/buildr/tools/contracts/`
- `services/buildr/tools/testing/test-context-build.mjs`
- `services/buildr/tools/release/application-payload.mjs`
- `services/buildr/tools/release/release-artifact.mjs`
- `services/buildr/test/verification/web-dist.mjs`
- `services/buildr-web/vite.config.ts`
