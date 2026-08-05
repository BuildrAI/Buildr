## 1. Command metadata authority

- [x] 1.1 扩展唯一 CLI command registry，使每个 executable descriptor 同时声明 canonical key、`primary|agent-machine|maintenance|legacy` surface、summary、canonical help、match 与 run adapter，并为 legacy entry 声明 replacement。
- [x] 1.2 让 dispatch、unknown-command candidates、根帮助分区、leaf/aggregate topic 共同消费 command catalog，补齐 `task finish` aggregate help，删除独立 leaf help key switch/map。
- [x] 1.3 将 CLI 架构验证从固定 supported key 清单改为 descriptor schema、唯一 key、surface、route/help/aggregate 可达性和根帮助分区关系验证。

## 2. Legacy OpenSpec surface retirement

- [x] 2.1 删除 `openspec sync-plan` 与 `openspec sync-apply` command descriptors、专属 Application handlers 和公开 JSON schema identity，同时保留 `converge` 使用的 deterministic planning/apply primitives。
- [x] 2.2 添加 focused CLI/contract tests，证明删除项返回标准 unknown-command 且零写入，并证明 retained `baseline create`、proposal `check`、`converge` 与 `audit` 继续可用且分类正确。

## 3. Documentation and current knowledge

- [x] 3.1 更新 `docs/buildr-product.md`、CLI Reference、CLI architecture、CHANGELOG 及相关 package 文档，明确四层 surface、必要 Agent 机器接口和两项 breaking removal。
- [x] 3.2 按 `.buildr/knowledge-impact.yml` 更新 Project glossary，核对 Brief 与最终实现/specs，并将全部 impact 状态收敛为 `aligned|updated|not-applicable`、无 unresolved terminology。

## 4. Direct feedback and archive readiness

- [x] 4.1 运行 command catalog/help focused tests、CLI architecture、public JSON contracts 和 OpenSpec convergence affected tests，修复失败并记录实际覆盖范围。
- [x] 4.2 运行 `openspec validate simplify-cli-product-surface --strict`、current knowledge `inspect` 和最终 Change checklist 核对，确保 artifacts、实现、文档与 canonical authority 一致并可进入单一 convergence transaction。
