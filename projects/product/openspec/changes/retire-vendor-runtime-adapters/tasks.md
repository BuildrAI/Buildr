# 任务

## 1 适配器注册收敛

- [x] 1.1 从 `adapter-contract.ts` 删除 `cursor`、`qoder`、`trae`、`trae-work`、`workbuddy` 的 descriptor
- [x] 1.2 收敛运行时映射：退役品牌不再需要显式条目，按 `standard-default` 保留身份并解析到 `agents-standard`
- [x] 1.3 删除失去调用方的 `vendor-rule-files` 规则组装实现、品牌格式常量与相关 trait 校验分支
- [x] 1.4 把 `render-claude-code-rules.ts` 改名为不绑定品牌的共享模块名，并更新全部引用（只改名，不删共享实现）

## 2 用户可见面收敛

- [x] 2.1 `--adapter` 取值收紧为 `{agents-standard, claude-code}`；其他值明确失败并报告当前支持取值
- [x] 2.2 `runtime list` schema 升为 `buildr.runtime-list/v3`，`supportedAdapters` 只包含标准与例外
- [x] 2.3 删除 `installationProbe` 与 `versionProbe` 机制、品牌专属 checker 输出与 macOS bundle、`defaults`、command 探测
- [x] 2.4 清理 `init`、`sync`、`render`、`doctor`、组件修复命令串与诊断建议中的品牌专属命令

## 3 退役既有投射

- [x] 3.1 声明退役适配器的投射清单：品牌规则桥、技能镜像根与状态命名空间
- [x] 3.2 在受管操作中实现按所有权证明的幂等退役处理：可证权删除、不可证权保留并报告、无法安全分离时整组零写入
- [x] 3.3 doctor 报告仍未清理的退役投射、具体路径与原因

## 4 测试

- [x] 4.1 删除五个品牌的 descriptor fixture、capability evidence 与品牌专属 contract tests
- [x] 4.2 更新用例：退役品牌身份解析到标准、`--adapter` 无效值失败、`runtime list` v3、标准与例外 parity、幂等
- [x] 4.3 新增退役处理用例：可证权删除、不可证权只报告、重复执行幂等、冲突整组零写入

## 5 当前知识与文档

- [x] 5.1 更新 `services/buildr/docs/agent-runtime-adapters.md`，只描述标准适配器与已注册例外
- [x] 5.2 更新 `knowledge/docs/reference/agent-runtime-adapter-contribution.md`：注册专有例外必须附可审计的宿主原生能力缺口证据
- [x] 5.3 维护受影响的代码地图与当前知识解释，并同步 `.buildr/knowledge-impact.yml`
- [x] 5.4 CHANGELOG 逐条说明已移除的规则桥、技能镜像与宿主需要满足的原生读取前提

## 6 直接验证

- [x] 6.1 `openspec validate retire-vendor-runtime-adapters --strict` 通过
- [x] 6.2 运行受影响的既有项目检查：runtime projection、adapter contract、CLI 选择、doctor、共享投射所有权
- [x] 6.3 在隔离工作根实测退役处理的可证权与不可证权两条路径

## 7 验证记录

执行环境：`projects/product/services/buildr`，Environment retained Node（`BUILDR_NODE` 指向 24.15.0），`tools/development/run-development-npm`，并设 `BUILDR_NPM_ENTRY_PATH=$PWD/bin/buildr.mjs`（缺少时任一经 `initBuildr` 的用例都会报无法推断 Node test entry）。

| 检查 | 结果 |
|---|---|
| `buildr-fast` 声明的 `npm run test:fast` | unit 274/274、component 6/6、contract 212/212、CLI architecture、openspec-strict（99 spec）全部通过；仅 `typecheck` 步骤失败 |
| `npm run test:integration` | 569/572 通过、2 跳过、1 失败 |
| `test/verification/runtime/adapter-contract.ts` | passed |
| `test/verification/runtime/adapter-parity.ts` | passed（families：`native-recursive=agents-standard`、`per-source-reference=claude-code`） |
| `test/verification/cli/architecture.ts`、`cli/compatibility.ts` | passed |
| `tsc --project tsconfig.json`、`tsc --project tsconfig.test.json` | 除 dsh 路径外 0 错误 |
| `test/integration/retired-adapter-teardown.test.ts` | 4/4 通过（可证权删除、不可证权保留并报告、冲突整组零写入、幂等） |

两项失败均与本次改动无关，已在基线主 checkout 的 `dev` HEAD 上复现同一条错误：

- `typecheck`：`resources/runtime/dsh/delivery.ts`、`tools/dsh/build-plugin.ts`、`tools/dsh/verify-plugin.ts` 共 5 条类型错误，属在途 `add-dsh-desktop-plugin` 变更范围，本次未触碰这些路径。
- `test/integration/application-payload-release.test.ts` 的 `npm package uses only its compatible host Node…`：`payload/product/docs/cli-reference.md` ENOENT，基线同样 ENOENT。

未纳入本次的既有缺陷：共享分派器 `src/bootstrap/cli/registry.ts` 按固定下标取运行时身份，`buildr skills render --target <dir>` 会把 `--target` 读成身份。已在 `test/integration/runtime-command-selection.test.ts` 用用例钉住真实行为并在 `design.md` 记录，待独立变更修复。

