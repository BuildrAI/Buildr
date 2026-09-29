# 设计：开发 Node 守卫改为声明版本锚定的范围接受

## Context

当前开发入口通过 `projects/product/.node-version`（24.15.0）做精确匹配，守卫链为 `projects/product/buildr` → `tools/development/run-development-cli` → `tools/development/resolve-development-node`（.sh/.cmd 各一份逻辑等价实现）。发现顺序为 `BUILDR_NODE` → `$NVM_DIR/versions/node/v<required>/bin/node` → PATH 扫描（`<entry>/node` 与 `<entry>/../../node/bin/node` 两轮）。正式 npm 包 `engines.node` 与 Development launcher 安装检查（`tools/build/launcher/manage.ts`）已使用 `>=24.15.0 <25`。Candidate 环境准备（`tools/verification/candidate-environment.ts`）读取 `.node-version` 作为 `expectedVersion` 传给 `createExactNodeExecutionEnvironment`（host 档位除外）。开发入口行为由 `test/integration/development-entry.test.ts`（10 个用例）约束。规格侧有三个能力把精确匹配写成 MUST（见 proposal Capabilities）。

精确固定是 rc.18（2026-08-16）推翻 2026-08-11 范围方案后的刻意决定，理由是原生类型擦除行为随 minor 有差异。本次推翻依据：24.15.0 与 24.21.0 对照实测同一 checkout 单元 274/274、契约 211/212（唯一失败与版本无关）逐项一致，且 `erasableSyntaxOnly` 约束使类型擦除面足够窄。

## Goals / Non-Goals

**Goals:**

- 开发入口接受与声明版本同主版本且不低于声明版本的 Node（当前 `>=24.15.0 <25`），消除"启动器接受、CLI 拒绝"的政策矛盾。
- 声明版本（`.node-version`）继续作为受控供给的锚点：Candidate 非 host 准备、CI development jobs 供给行为不变。
- 身份与审计链不放松：实际选中的可执行文件与版本继续进入 development CLI 身份 JSON 与 Candidate audit，漂移以诊断呈现。

**Non-Goals:**

- 不改 `package.json` `engines.node`、Development launcher 安装检查、`candidate-environment.ts` 的锚定行为、hosted Host Node tuple 语义。
- 不引入版本管理器安装、自动下载 runtime 或新的用户目录扫描。
- 不放宽上界到 Node 25+，不改变 Task Environment、self-bootstrap 的供给方式。

## Decisions

1. **接受规则由声明版本推导，不新增范围文件。** 接受条件 = 与 `.node-version` 同主版本且 `>=` 声明版本；上界 `<25` 由"同主版本"推出。备选：新增独立的范围声明文件（多一个事实来源，漂移风险高）或在解析器硬编码 `24.15`（升级声明版本时需改代码）。推导方案只维护 `.node-version` 一个文件，前移声明版本即同步收紧接受下界。
2. **发现顺序保持"供给优先"，仅把匹配从精确改为范围。** `BUILDR_NODE`（须满足范围，否则 fail fast）→ `NVM_DIR` 声明版本精确命中 → PATH 首个满足范围候选。声明版本命中优先于 PATH，保证已配置声明版本的机器（CI、自举）行为与现状完全一致；范围接受只在声明版本缺席时生效。备选：改为"声明版本与 PATH 候选中择新"——引入不确定性，放弃。
3. **身份记录实际对象，版本漂移是诊断不是错误。** development CLI 身份 JSON 与 launcher identity 继续绑定实际 executable + version；`development.node_version_mismatch` 类诊断按现状以建议形式呈现。备选：非声明版本告警阻断——会把新的本地兼容路径变回事实精确固定，放弃。
4. **三个能力分别做最小 delta。** `npm-cli-package` 承担 resolver 选择语义（含改名），`buildr-service-typescript-execution` 承担原生加载的 Node 要求措辞，`product-verification-quality` 承担 CI 供给与 Agent wrapper 措辞及 hostile PATH 场景改写。hosted tuple 与最低版本表述两处规格经核对无需 delta。
5. **测试改写沿用现有结构。** `development-entry.test.ts` 的 10 个用例逐一映射到新语义（范围接受、声明优先、fail-fast 边界、身份记录），不新建平行测试文件。

## Risks / Trade-offs

- [未来 24.x minor 引入原生加载或运行时回归，表现为跨机器测试结果差异] → 声明版本前移 + `.node-version` 单文件收紧下界；必要时恢复精确匹配（本变更的可逆路径），CI 与 Candidate 供给始终锚定声明版本，正式验证结果不受本机漂移影响。
- [范围内 Node 的 npm 依赖解析差异] → 与正式包用户已暴露的 `engines.node` 范围一致，不引入新差异面；依赖锁定由 lockfile 承担。
- [Windows .cmd 与 .sh 行为漂移] → 两份实现按同一规则同改，`development-entry.test.ts` 现有 win32 skip 结构保持，语义在两平台由相同规则约束。
- [外部脚本依赖"非精确版本失败"行为] → 提案标注 BREAKING；失败消息说明所需范围与声明版本，恢复动作清晰。

## Migration Plan

实现合入后无数据迁移。回滚策略：还原解析器两份实现与测试即可恢复精确匹配；规格文本随 OpenSpec 归档保留历史。声明版本若需收紧，前移 `.node-version` 并同步 `package.json` `engines.node` 下限（现有测试已核对两者关系）。

## Open Questions

（无）
