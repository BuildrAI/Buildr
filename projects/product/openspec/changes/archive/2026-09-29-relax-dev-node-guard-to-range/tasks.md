## 1. 解析器实现

- [x] 1.1 修改 `services/buildr/tools/development/resolve-development-node`（.sh）：接受规则改为与 `.node-version` 同主版本且不低于声明版本，发现顺序保持 `BUILDR_NODE`（范围校验，fail fast）→ `NVM_DIR` 声明版本精确命中 → PATH 首个满足范围候选；失败消息说明所需范围与声明版本。验证：`BUILDR_NODE` 分别指向 24.15.0 与 24.21.0 时开发入口均可用，指向 23.x/25.x 时非零失败且消息含范围。
- [x] 1.2 按同一规则修改 `services/buildr/tools/development/resolve-development-node.cmd`。验证：静态核对与 .sh 的选择顺序、范围规则、失败语义一致，版本比较逻辑覆盖两位 minor 号。

## 2. 集成测试改写

- [x] 2.1 改写 `services/buildr/test/integration/development-entry.test.ts` 全部 10 个用例到范围语义：PATH 范围接受并记录实际版本、NVM 声明版本优先于 PATH、`BUILDR_NODE` 范围外 fail fast、范围外候选不命中、身份 JSON 保留实际 executable 与版本。验证：以声明版本 24.15.0 运行该 integration 测试全部通过；以 24.21.0 构造 PATH 候选场景验证接受与身份记录。
- [x] 2.2 调整"开发启动器读取 Product 精确版本且 package engines 保留发布兼容范围"用例：核对 `engines.node` 下限与 `.node-version` 一致、上界为下一主版本。验证：该用例通过且人为改动 `.node-version` 时用例失败。

## 3. 文档与声明核对

- [x] 3.1 全库检索面向用户的"精确 24.15.0/精确 Node"指引（README、getting-started、开发环境说明等；历史归档与 patch 记录不改），改为范围 + 声明版本供给表述。验证：`grep -rn "24\.15\.0"` 除规格归档、变更材料与历史记录外无残留精确表述。
- [x] 3.2 按 declaration-intake 做只读差异复核：`preparation.yml`/`verification.yml` 未引用具体 Node 版本、wrapper argv 不变，确认无声明缺口。验证：复核结论（含检查过的文件清单）写入任务说明。

## 4. 当前认知维护

- [x] 4.1 按 brief.md 知识影响清单逐项核对并校准：`knowledge/docs/flows/open-source-release.md`（"精确 Node"改为范围接受 + 声明供给）、`knowledge/code-map/README.md`（"固定开发 Node 版本"措辞）、`knowledge/docs/architecture/technical.md`、`knowledge/code-map/product-verification-tools.md`、`knowledge/docs/architecture/verification-framework.md`、`knowledge/index.yml`。验证：逐项给出 `aligned|updated|not-applicable` 结论，无未处理漂移。

## 5. 直接验证

- [x] 5.1 以声明版本 24.15.0 与 24.21.0 各运行单元 + 契约 + 开发入口 integration 测试，确认两版结果一致（已知本地 `build/dsh-*` 产物干扰项除外并注明）。验证：两版 pass/fail 计数一致且无新增失败。
- [x] 5.2 `openspec validate relax-dev-node-guard-to-range --strict` 与 `buildr openspec convergence preflight` 通过。验证：两条命令零错误输出。
