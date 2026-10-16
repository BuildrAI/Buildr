# Buildr 与 DSH 插件发布流程

本页是发布、恢复和清理的唯一流程入口。准备停在公开发布之前；公开动作须绑定所选包的准确版本、内容和授权。插件专属事实见[插件发布说明](dsh-plugin-release.md)，测试职责见[验证框架](../architecture/verification-framework.md)。

![发布职责、交接与恢复边界](../../archify/flows/release-architecture.html)

## 谁负责什么

| 责任 | 实际技能与实现 |
| --- | --- |
| 工作方法 | `buildr-release` 指导发布；`project-testing` 建设测试，`task-verification` 选择已有检查并登记真实报告 |
| 冻结与推进 | [发布协调](../../../services/buildr/tools/release/release-orchestration-runner.ts)调用[发布选择](../../../services/buildr/tools/release/release-selection.ts)，固定包、版本、准确提交与源码树；后续 `dev` 不自动进入 |
| 定义、选择与执行 | `test/verification/` 的 `registry.ts`、`planner.ts` 与 `plan-runner.ts`；本机和 GitHub 共用[输入读取](../../../services/buildr/test/verification/verification-source-inputs.ts)及依赖选择，执行地点不另定规则 |
| 生成安装包 | [主包生产](../../../services/buildr/test/verification/release/candidate-package.ts)与[插件构建](../../../services/dsh-plugin/tools/build-package.ts)，分别保留原包身份 |
| 采用与完整汇总 | [正式补验](../../../services/buildr/test/verification/candidate-repair.ts)逐项核对输入、平台、原包及清理，[候选汇总](../../../services/buildr/test/verification/candidate-ci-evidence.ts)核对必需集合齐全 |
| 公开与回读 | [发布执行](../../../services/buildr/tools/release/release-publication.ts)及各包的受保护工作流（Workflow），只公开获准原包并核对真实效果 |

这些是工程职责，不是六个通用产品模块。`src/modules/project-testing` 管测试地图，任务验证应用（Task Verification Application）管报告；两者不执行产品测试或发布。缺哪项补哪项，汇总失败重做汇总，登记失败重做登记；已成立的检查和原包事实保留。

## 选择发布内容

两个包独立版本、独立原包、独立发布；选择公开哪个包，不等于选择验证哪些源码。

| 选择 | 版本参数 | 必须验证的组合 |
| --- | --- | --- |
| `--packages buildr` | `--version` | 新主包与已公开插件；确认插件不存在时可单发主包 |
| `--packages dsh-plugin` | `--plugin-version` | 新插件与固定的已公开主包原字节 |
| `--packages buildr,dsh-plugin` | 两个版本 | 新／新及公开过程中的新／旧组合，据此决定安全顺序 |

兼容声明 `buildrCompatibility` 来自各自原包的 `package.json`。公开对端固定官方 npm、精确版本和完整性（Integrity），不能用 `latest`、开发源码或同号版本替代。旧包保留 `legacy`；可选来源采集缺失可为 `unsupported`，已声明能力报错为 `failed`，未查明为 `unknown`。

## 正常主线

| 阶段 | 在哪里做什么 | 失败时处理 |
| --- | --- | --- |
| 1. 固定选择 | 本机确定包、版本、基线及按序选入内容，先处理与 `main` 的历史关系 | 解决版本、来源、组合和语义冲突 |
| 2. 补齐源码证明 | 本机只执行缺失或失效检查，导出有效结果 | 修复对应产品或测试工具，再定向补验 |
| 3. 唯一包与平台 | 构建一次原包；远端复用源码结果，补真实平台与原包消费 | 保留成功项；只有构建输入变化才重建包 |
| 4. 纳入与就绪 | 通过受保护合并请求（Pull Request）纳入同一源码，读回聚合、原包与逐包就绪事实 | 恢复未完成操作 |
| 5. 公开与回读 | 获得授权后发布原包，核对官方记录并安装验证 | 保留已发生效果，只恢复未完成事项 |

准备候选版止于第 4 步。固定基线不追随后续 `dev`；额外内容经有序 `cherry-pick -x` 纳入。版本材料先交付 `dev`。主包、网页或共享构建有变化时，即使只公开插件，也须取得主包完整证明。普通开发只运行相关检查，不默认完整演练。

## 本机与远端的职责

| 内容 | 主要证明位置 |
| --- | --- |
| 通用功能、任务、工作目录、恢复和六组发布工具检查 | macOS 本机完整证明；受控候选核验并复用 |
| Windows 命令脚本、真实路径与链接、硬链接锁、进程清理 | Windows 最小检查 `system-windows-platform` |
| Git 大小写别名与 CRLF | Windows 一个指定用例，保留通用集合的主证明 |
| 原包安装、快捷方式、启动与退出 | 两系统真实原包消费；Windows 为 `release-tarball-smoke` |
| 最低／当前 Node | 两系统的轻量安装运行链路，不扩展为全套功能矩阵 |
| 网页及独立插件 | 主包原字节的核心浏览器（Browser）旅程；插件自己的原包和真实对端验证 |

平台依据与触发输入在[统一清单](../../../services/buildr/test/verification/platform-boundaries.ts)；名称含 Windows、出现 `win32` 或超时较长，都不足以重复整套检查。当前支持 macOS、Windows。源码与原包消费者分开；完整覆盖由实际执行及有效复用共同满足，另一平台成功不能替代。

在 `services/buildr` 使用项目包装入口：

```text
tools/development/run-development-npm run test:source -- --json
tools/development/run-development-npm run test:source -- --output <bundle.json>
```

`--json` 只看计划；`--force` 强制重跑。计划列出缺项、复用来源、失效原因与成本；估算不含下载和排队。类型检查等尚未声明可复用的项目仍执行。外部合并请求不能自带通过声明跳过检查。

[统一准备入口](../../../services/buildr/tools/verification/candidate-environment.ts)按需选择 `base`、`source-runtime`、`frontend`、`artifact`、`browser-artifact`、`consumer`、`host` 或 `publisher`。消费原包不重新构建网页，主包准备不获取 DSH SDK。稳定版 Node 要求为 `>=24.15.0`，每次记录实际程序并冻结子进程使用的版本，不要求恰等于最低版本。

## 操作入口

在 `services/buildr` 通过 `tools/development/run-development-node` 执行[发布入口](../../../services/buildr/tools/release/release-orchestration-runner.ts)：

```text
release-orchestration-runner.ts prepare --packages <选择> <对应版本参数> --workspace <主工作空间> [--baseline <ref>] [--source <sha> ...]
release-orchestration-runner.ts prepare <同一选择与版本> --workspace <主工作空间> --verification-source <exact-sha>
release-orchestration-runner.ts inspect|publish|resume <同一选择与版本> --workspace <主工作空间> [--selection-id <id>]
```

| 动作 | 边界 |
| --- | --- |
| `prepare` | 创建或复用隔离选择，先检查本机结果，再验证原包、纳入 `main` 并返回逐包就绪；不公开 |
| `inspect` | 只读当前阶段、运行和缺项 |
| `publish --authorized` | 只发布当前明确授权的包；主包用 `publish.yml`，插件用 `publish-dsh-plugin.yml` |
| `resume` | 读回真实效果，继续未完成事项，不重新构造已验证源码或打包 |
| `resume --recover-publication --authorized` | 核验原失败记录，仅采用受保护 `main` 上合格的发布工具修复；保留版本、标签、原包及对端 |

同一选择不能静默更换基线、包、版本或对端。运行未结束时跟踪原运行；响应丢失或请求未知时先回读，禁止重复派发。承载引用已合并并自动删除时，核对候选与合并事实后继续，不重建已完成用途的引用。

## 原包正式补验

`--verification-source` 必须是 `origin/dev` 中的准确提交，且与原产包源码的产品、依赖、构建和原工作流输入一致。检查源码与产包源码分别记录；补验代码不因此获得公开发布权限。

旧格式结果先用原始提交核验，再用当前共享输入规则比较前后两份源码；不改写旧记录，也不因输入算法升级全部重跑。无法核验的旧结果只补对应项；实际 Git 比较及宿主 Node 仍须重新观察。

| 变化或失败 | 处理 |
| --- | --- |
| 输入、配方、平台及原包均匹配 | 复用完整成功结果，保留原来源和时间 |
| 只改测试或验证工具，构建输入未变 | 使用原运行和原包，执行失效项；失败分组中已完成且清理干净的项也可保留 |
| 产品、构建、工作流或包内嵌源码身份变化 | 新基线和新包；仍有效的独立源码结果继续复用 |
| 未解析读取或旧证据缺少输入摘要 | 保守补齐对应证明，不伪造复用 |
| 明确暂态故障 | 同一运行最多自动恢复一次失败作业；同错重复进入诊断 |
| 工具内部失败 | 保存断言、超时、清理等各阶段事实，只修复相关边界，不无限扩时限 |

前端及 DSH 工具目前保留较宽的构建输入，不能推定任何工具修复都可保留原包。正式补验仍核对完整集合、必要 Git 事实和宿主 Node。普通诊断不能直接变成发布证明；有效完整演练可采用，正常发布不要求“演练后再全跑一次”。

Windows 定向诊断沿用 `verify.yml` 的 `diagnostic_scope`。原包诊断须同时提供 `expected_source_tree`、`diagnostic_candidate_run_id`、`diagnostic_candidate_source`；可选择 `runtime-windows`、`package-consumer-windows`、`nested-lifecycle-windows`、`task-lifecycle-windows`、`preview-lifecycle-windows`、`publication-effects-windows` 或组合 `failed-windows`。生产代码修改后的预览诊断用 `app-process-windows`，只绑定当前树，不借旧包。具体选择及边界见[诊断实现](../../../services/buildr/test/verification/release/windows-artifact-diagnosis.ts)。

## 公开、恢复与清理

[共享消费配方](../../../services/buildr/tools/release/release-consumption.ts)规定完整发布证明；[发布执行器](../../../services/buildr/tools/release/release-publication.ts)复核原字节、当前权限及官方状态，再公开和回读。RC 使用 `next`，稳定版使用 `latest`；不覆盖版本、移动标签、重打包、降低保护或回退本机令牌发布。GitHub Release 只维护说明。

| 已观察事实 | 下一步 |
| --- | --- |
| 标签存在、npm 不存在 | 核对同源码原包，只补 npm 及后续 |
| npm 已有相同完整性 | 不重发，只补说明、回读或安装验证 |
| 标签／原包冲突 | 保留现场并停止相关写入 |
| 查询超时、权限错误、响应不明 | 保留 `unknown` 并查询，不能当作不存在 |
| 两包部分成功 | 保留成功包，只恢复另一包；共享引用继续保留 |
| 公开成功，登记、清理或自举失败 | 只恢复对应事项；发布事实不撤销 |

清理使用原上下文绑定的政策：`delete-owned-release-branches/v2` 覆盖同版本且可证明归属的正式发布分支及各轮承载引用；`v1` 仅覆盖原绑定范围；未绑定政策不自动取得权限。先证明官方发布及主线历史保全、无开放合并请求和未结束运行，再按实时观察的准确提交删除并回读。未知、漂移或仍有用途时逐项保留。其他版本的历史批量清理须另行授权。

最终分别报告：各包公开事实、源码纳入、任务登记、引用清理及本机自举。公开版本、官方标签和发布证据长期保留。自举仅由 `buildr-self-bootstrap-sync` 的唯一执行器完成。无公开副作用验收不能证明真实平台审批、OIDC 或生产 npm 写入。
