# Buildr 测试与验证框架

Buildr 产品使用四类检查：静态检查（Static Check）、单元测试（Unit Test）、集成测试（Integration Test）、端到端测试（End-to-End Test，E2E）。日常开发按用户目标选齐相关检查，推送前取得四服务全部静态检查（Static Check）与单元测试（Unit Test）的有效完整证明。发布核对准确交付物及真实平台差异，不另造第五类测试。

本页解释产品自身执行方式；[项目声明](../../../verification.yml)公开少量稳定入口，[准备声明](../../../preparation.yml)记录真实准备命令。四服务是 `buildr`、`buildr-web`、`buildr-agent` 与 `dsh-plugin`，成员发现、类型和相关选择由[实际执行登记](../../../services/buildr/test/verification/registry.ts)与项目程序负责，不在说明和地图各复制一份文件清单。

## 四类检查

| 类型 | 证明边界 |
| --- | --- |
| 静态检查（Static Check） | 类型、源码依赖、声明、资源及交付结构，不执行业务流程。 |
| 单元测试（Unit Test） | 真实内部逻辑或完整内部功能，外部协作者被替换，不验证真实数据库、网络、文件存储、Git 或外部程序。 |
| 集成测试（Integration Test） | 代码与真实技术设施或协议配合，只准备本次需要的边界。 |
| 端到端测试（End-to-End Test，E2E） | 从实际命令行或页面入口贯穿应用链路并核对最终结果。 |

单元测试（Unit Test）不限定一函数或一类，完整集合须低成本、易准备。真实 SQL 的内存数据库仍是数据库边界，普通内存仓储替身不是。测试运行器读取源码、创建工作进程不等于被测业务经过外部协议。旧目录、工具名和执行阶段不决定类型；混合检查按实际证明拆分，保留断言。操作系统差异和准确交付物分别说明运行条件与被测对象。

## 公开入口

在 `services/buildr` 使用 `tools/development/run-development-npm` 调用下列入口；其他服务独立运行沿用自身项目包装方式。所有入口都提供 `--plan` 查看选择，`--check <id>` 显式指定检查；计划和选择成功均不能代替真实执行。

| 需求 | 入口 |
| --- | --- |
| 四服务全量单元测试（Unit Test） | `npm test` |
| 推送前四服务全部静态检查（Static Check）与单元测试（Unit Test） | `npm run check` |
| 四服务全量静态检查（Static Check） | `npm run test:static` |
| 全量集成测试（Integration Test） | `npm run test:integration` |
| 全量端到端测试（End-to-End Test，E2E） | `npm run test:e2e` |
| 按用户请求、实际文件或改动选择相关四类检查 | `npm run test:related` |

用户可指定具体检查、类型、全量或相关范围，不要求先创建正式任务或先提供 Git 基线。已知检查直接执行；需要比较才使用明确来源。相关选择须依据实际公共行为、调用方、依赖及交付边界补足自动路径选择，零匹配不能冒充目标已验证。

`--list` 列出检查标识，`--plan` 或 `--json` 只查看计划。`test:related -- --base <ref> --check <id>` 在相关集合中追加显式检查；只有 `--check` 时直接执行指定集合。`check` 始终包含全部源码静态检查（Static Check）与单元测试（Unit Test），添加 `--check` 不会缩小推送前范围。

静态检查（Static Check）同时检查四服务测试及辅助脚本：JavaScript 做语法解析，TypeScript 做严格类型检查。`test-typecheck` 检查主体、网页和智能体测试；`plugin-test-typecheck` 使用准确的软件开发工具包（SDK）与已生成的协议声明，按入口分别检查插件宿主端和客户端，避免两端同名类型相互干扰。两项都自动包含在 `npm run check` 中。

## 测试内容与并行

分类落实到实际断言。来源选择、迟到响应、状态合并、筛选和尺寸计算直接调用生产逻辑，以替身隔离外部协作者；真实 Git、文件写盘、HTTP 与冲突边界由集成测试（Integration Test）验证；浏览器端到端测试（E2E Test）保留必要完整使用流程。删除重复高层组合前核对已有低层证明并补齐缺口，不能以改名或单纯删断言降低耗时。

`e2e-browser:code-explorer` 与 `e2e-browser:code` 是文件浏览和源代码管理两个独立检查。源码浏览器检查最多并行两个，仍受全局进程、工作线程和工作空间读写额度约束；它们共享不可变前端产物，各自使用临时工作空间、随机端口、浏览器和清理责任。其他共享可变资源的检查继续互斥。开始结束时间必须证明实际并行，准备去重不能被误算为测试通过。

## 环境准备入口

智能体（Agent）根据实际缺项准备环境，检查命令不隐式下载厂商依赖或激活真实桌面。以下命令均从 `services/buildr` 调用；完整参数和输入校验由对应程序维护。

| 缺项 | 实际准备入口及输出 |
| --- | --- |
| 配套浏览器 | `tools/development/run-development-npm run browser:prepare`，复用同版本缓存。 |
| 插件软件开发工具包（SDK） | `tools/development/run-development-node ../dsh-plugin/tools/prepare-release-sdk.ts --node <Node绝对路径> --pnpm <pnpm脚本绝对路径>`；返回的 `sdk` 通过 `BUILDR_DSH_SOURCE_SDK_ROOT` 提供给检查。工具校验锁定版本与完整性。 |
| 插件构建、对端与宿主组合 | `tools/development/run-development-node ../dsh-plugin/tools/prepare-check-environment.ts --source-sdk <sdk> --buildr-peer <准确原字节清单> --output <准备回执>`；检查消费回执中的 `env`，准备自身不执行测试、不激活桌面。 |

准确对端观察与准备的可执行示例见[持续集成定义](../../../../../.github/workflows/verify.yml)。源码检查与准确原包检查的对象、排除原因及其他系统的缺口会在计划和执行报告中分别列出；准备成功不代表这些检查通过。

## 执行和成本

准备依实际缺项完成，已有锁定依赖、构建输入和浏览器可以复用，不在每条检查前重装或重复生成。单元测试（Unit Test）不自动准备浏览器、真实账号、付费模型、准确双包或完整厂商软件开发工具包（SDK）。类型检查（Type Check）只证明真实编译范围，不把转译成功或 `noCheck` 声称为严格类型验证。

实际工作进程数量和资源必须有界，完整集合的耗时与资源成本需观察并优化，不设统一三十秒门槛，不借无限并发掩盖消耗。发现慢检查先判断范围与实现效率，不仅因慢而改名，也不为达到预算删掉必要断言。

运行中不改被测源码，一轮收集无依赖的失败，修复后补失败及受影响项。复用须核对内容、配方、依赖、工具和必要环境仍适用，保留实际来源；推送前完整集合的证明不可由仅执行相关部分替代。缺少测试、环境不可用、未执行、失败及待授权分别报告。

## 发布与真实环境

发布仍由 `buildr-release` 冻结准确来源与交付物，验证程序消费同一原包并按实际系统补齐平台差异。源码检查成功不证明原包可安装或跨平台成功；同一原包的成功证据不因阶段改变重复生产。插件对端、软件开发工具包（SDK）及真实宿主按目标按需准备，不把模块逻辑验证扩大为每轮真实桌面安装和卸载。

真实账号、外部写入、付费模型与公开发布保持原授权边界。验证环境就绪不证明业务结果，浏览器自动化成功不等于人工视觉审查（Visual Review）。只在确有授权或业务取舍缺口时，把具体对象、影响、已完成工作及待决定事项反馈用户；缺一个环境不阻断其他安全检查。

## 智能体职责

[测试建设（project-testing）](../../../services/buildr/resources/workspace/skills/buildr/project-testing/SKILL.md)统一维护测试代码、项目入口、发现与选择映射和 `verification.yml`；[项目验证（project-verification）](../../../services/buildr/resources/workspace/skills/buildr/project-verification/SKILL.md)依据请求选择、实际执行、交付证据并按需记录已有任务报告。准备声明维护归 `buildr` 的[准备指引](../../../services/buildr/resources/runtime/skills/buildr/references/preparation-declarations.md)，不再设置声明中转技能。

正式报告仍使用 `task verification inspect|record` 和原内容摘要冲突保护；没有任务时直接交付真实证据，不补造任务或报告。推送前检查不授予 Git 写入授权，发布验证不授予公开发布授权。
