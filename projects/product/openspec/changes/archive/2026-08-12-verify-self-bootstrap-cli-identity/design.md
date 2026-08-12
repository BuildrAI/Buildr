## Context

`buildr-self-bootstrap-sync` 已是 Buildr 自举 Workspace 唯一的 post-Finish activation orchestrator。它会按冻结的 Task Contribution 去重执行 package sync、development CLI 安装、development Local App 安装，并在 complete 模式补一次 Doctor，或在 doctor-blocked 模式恢复同一 Finish run。

当前 CLI 安装把用户级 `buildr` 链接到 retained checkout 的 `scripts/run-development-cli`，但 runner 后续仍直接调用 retained checkout 的 `bin/buildr.mjs`。因此“安装命令成功”和“源码 CLI 可运行”之间缺少默认入口 identity gate：PATH 可能先命中其他命令，链接可能仍指向旧 checkout，launcher 也可能不再计算出预期的 CLI entry。

约束如下：

- self-bootstrap runner 继续是唯一流程与唯一报告者。
- 通用 Task Finish、Finish Result、Environment Receipt 与 SQLite authority 不改变。
- `version --json` 的公共输出契约不为 checkout identity 扩字段。
- complete 与 doctor-blocked 继续只产生各自既有的一个最终 Doctor 结论。

## Goals / Non-Goals

**Goals:**

- 只有默认 PATH `buildr` 可证明绑定本次 delivered retained checkout 时，self-bootstrap activation 才能成功。
- 让后续 Doctor 或 Finish resume 真实经过已经验证的默认入口。
- 对 PATH shadowing、旧链接、launcher/CLI entry 漂移、版本不一致和启动失败提供结构化、可恢复的 fail-closed evidence。
- 将 `AGENTS.md` 收敛为结果约束，把所有正式操作留给 Skill 和 runner。

**Non-Goals:**

- 不改变通用 Task Finish 的阶段、delivered gate 或 Doctor 语义。
- 不新增数据库、Receipt、Task 字段、capability、后台服务或第二个 activation runner。
- 不把 checkout path 加入公共 `buildr version --json` schema。
- 不改变稳定版 CLI、npm 用户安装或稳定版 Local App 的交付流程。

## Decisions

### 1. 在 runner 中设置单一 CLI identity gate

runner 在 package sync、development CLI 安装和 Local App 安装完成后、finalize 之前执行一次 `verify-cli-identity`。只要本次 self-bootstrap plan 适用，就必须经过该 gate；这确保 package-only 或 Local-App-only activation 也不会在默认 CLI 仍指向旧 checkout 时成功。

备选方案是只在 `install-cli` 动作后验证。该方案不能覆盖未触发 CLI 重装但仍要求默认入口属于 delivered retained checkout 的 activation，因此不采用。

### 2. 以运行时链路而非命令名证明 identity

gate 按当前进程 PATH 顺序解析实际可执行的 `buildr`，并记录命中路径。它要求该入口的最终真实路径等于本次 retained checkout 的 `scripts/run-development-cli`。launcher 提供仅供内部验证使用的 identity inspection 输出，报告自身真实路径、按实际脚本位置计算的 `bin/buildr.mjs` 和所选 Node；runner 再将 launcher 与 CLI entry 的真实路径同 retained checkout 预期路径比较。

仅使用 `command -v` 不能证明链接目标，仅使用 `buildr --help` 不能证明 checkout identity；直接解析 shell 文本又会把实现细节变成脆弱的 runner parser，因此采用 launcher 运行时 inspection。

### 3. 公共版本契约保持不变

入口链验证通过后，runner 通过 PATH 实际命中的默认入口执行 `version --json`，并将返回的 package/version 与 retained checkout 的 `package.json` 比较。checkout identity 由文件链证据证明，产品 identity 由既有版本 JSON 证明，两者共同形成 gate；不向公共版本 schema 增加路径字段。

### 4. finalize 复用已验证默认入口

complete 模式使用该入口运行最终指定 Agent Doctor。doctor-blocked 模式使用同一入口和既有 resume token 恢复同一 Finish run，最终 Doctor 仍只存在于 resume 内。runner 不再使用源码 CLI 绕过默认入口。

### 5. evidence 只存在于当前 runner Result

Result 增加 CLI identity evidence，至少包含 PATH 命中、launcher、CLI entry、Node、预期 package/version、观测 package/version与检查结果。它与现有 phase/operation evidence 一同返回，不写入任何正式 store，也不成为 Finish delivered authority。

## Risks / Trade-offs

- [PATH 在安装后仍未包含安装目录] → gate 明确失败并返回实际命中或未命中事实，不把 installer 的提示误判为成功。
- [PATH 命中同名稳定版或旧 checkout] → realpath 与 retained checkout 不一致即停止，不继续 Doctor 或 resume。
- [launcher inspection 被误当公共 API] → 使用明确的内部环境信号，仅由 runner 设置；正常 CLI 参数与公共 `version --json` 保持不变。
- [跨平台可执行名和 PATH 规则不同] → PATH resolver 按平台处理可执行扩展，并由隔离 fixture 覆盖；当前 POSIX development installer 的既有行为保持不变。
- [identity gate 发生在已完成 Formal Finish 之后] → 失败只报告 self-bootstrap activation 未完成及恢复事实，不改写已完成的研发或交付事实。

## Migration Plan

1. 先增加 launcher identity inspection 与隔离测试。
2. 在 runner 中增加 PATH resolver、identity gate、Result evidence，并改用验证入口完成 finalize。
3. 更新 Skill、Contribution、Rule 结果约束和 current-state knowledge。
4. 运行定向 integration/contract/system tests、OpenSpec validation 与正式 Task Verification。

回滚时可整体回退本 Change；没有数据迁移、持久化 schema 或外部状态需要恢复。

## Open Questions

无。
