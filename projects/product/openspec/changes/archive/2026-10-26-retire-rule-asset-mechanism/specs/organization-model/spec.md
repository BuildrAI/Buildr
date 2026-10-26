## MODIFIED Requirements

### Requirement: Buildr root 承载默认 Organization 资产路径
Buildr MUST 将 Buildr root 作为默认 Organization 资产路径，并在根目录通过 `AGENTS.md` 维护组织级 Rules，通过 `skills/`、`components/` 和 `commands/` 维护其他组织资产与项目入口。

#### Scenario: 组织级资产路径
- **WHEN** Buildr 表示当前 Organization 上下文的 Rules、Skills、Components 或 Commands
- **THEN** Rules MUST 位于 Buildr root 的 `AGENTS.md`
- **AND** Skills、Components 与 Commands MUST 分别位于 Buildr root 的 `skills/`、`components/` 和 `commands/` 下
- **AND** Buildr MUST NOT 将 `rules/` 或 `rules/manifest.yml` 表示为当前 Organization 规则资产路径
- **AND** Buildr MUST NOT 将 `practices/` 表示为独立 Organization 资产类型

#### Scenario: 项目级资产路径
- **WHEN** Buildr 表示当前 Organization 上下文下的项目
- **THEN** 项目资产 MUST 位于 `projects/<project>/` 下

#### Scenario: 共享服务路径
- **WHEN** Buildr 表示当前 Organization 上下文下的共享、基础或平台服务
- **THEN** 这些服务 MUST 归属某个 Project，并位于 `projects/<project>/services/` 下
