# 变更提案：开发 checkout Node 守卫放宽为声明版本同主版本下限范围

## Why

开发命令入口（`resolve-development-node`，.sh 与 .cmd）当前要求 Node 与 `projects/product/.node-version` 精确相等，而正式 npm 包 `engines.node` 与 Development launcher 安装检查早已接受 `>=24.15.0 <25`。同一台机器上满足产品范围（如 24.21.0）的 Node 被启动器接受、却被开发入口拒绝，产生不必要的安装摩擦：本机曾因此无法运行任何开发命令，只能额外下载精确版本。经 24.15.0 与 24.21.0（相差 6 个 minor，横跨提议范围两端）对照实测，同一 checkout 的单元测试 274/274、契约测试 211/212（唯一失败为本地 `build/dsh-*` 产物干扰的既有问题，两版一致，与 Node 版本无关）结果逐项相同，表明在 `erasableSyntaxOnly` 约束下的原生类型擦除（type stripping）在当前 24.x minor 区间内行为稳定。

## What Changes

- 开发入口 Node 接受规则从"精确等于 `.node-version`"改为"与声明版本同主版本且不低于声明版本"（即 `>=24.15.0 <25`；上界由主版本推出，单一事实来源仍是 `.node-version`）。**BREAKING**：依赖"非精确版本必须失败"行为的外部脚本或文档指引需要相应更新。
- `.node-version` 保留为声明/供给（declared/supply）版本：`BUILDR_NODE` 与 `NVM_DIR` 中的声明版本在发现顺序中继续优先；候选验证环境准备（`candidate-environment.ts` 非 host 档位）继续锚定声明版本；CI development checkout jobs 继续使用声明版本。
- 身份与审计链不放松：development CLI 身份 JSON、Candidate Host Node audit 继续记录实际使用的可执行文件与版本，漂移以诊断呈现。
- 同步修改三个能力中把精确匹配写成 MUST 的需求文本与场景，以及 `development-entry` 集成测试与两份解析器实现（.sh/.cmd）。
- 本变更推翻 rc.18（2026-08-16）确立、rc.20 复核的精确固定决定；推翻依据（版本对照实测数据与产品内范围/精确政策并存的矛盾）记录于本提案与 design。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `buildr-service-typescript-execution`：Development checkout 原生执行 `.ts` 的 Node 要求从"声明的 Node 24.15.0"改为"开发 Node 范围内选定/供给的 Node"。
- `npm-cli-package`：开发入口 Node resolver 的精确匹配要求改为"范围内接受、声明版本优先"，"MUST NOT 接受仅满足 engines.node 的其他版本"的禁令相应解除。
- `product-verification-quality`：development hostile PATH 场景与 Agent wrapper 入口的"精确 development Node"措辞改为范围接受 + 实际版本绑定；CI development jobs 使用声明版本的供给要求保留。

## Impact

- 代码：`services/buildr/tools/development/resolve-development-node`（.sh/.cmd）、`services/buildr/test/integration/development-entry.test.ts`（10 个用例改写为范围语义）。
- 规格：上述三个能力的 Requirement/Scenario 文本。
- 不变：`package.json` `engines.node`（`>=24.15.0 <25`）、Development launcher 安装检查（已是范围）、`candidate-environment.ts` 非 host 档位的 `expectedVersion` 锚定、`open-source-release-governance` 的 hosted tuple 语义（其前提"hosted Node ≠ 声明版本"在新政策下仍成立）、`workspace-structured-data-store` 的最低版本表述（已是"或更高"语义）。
- 声明（declaration）核对：`preparation.yml`/`verification.yml` 未引用具体 Node 版本，wrapper argv 不变，预期无声明缺口；实现时按 declaration-intake 做只读复核。
- 风险：未来 24.x minor 若引入回归，可能出现跨机器测试结果差异；缓解为前移 `.node-version` 声明版本并按需恢复精确匹配（可逆、成本低），声明版本优先的发现顺序保证供给环境默认不受影响。
