## MODIFIED Requirements

### Requirement: npm tarball exposes buildr command
Buildr MUST在 Buildr Service root 提供 npm package metadata，使维护者能够创建以 `bin/buildr.mjs` 暴露 `buildr` executable command 的本地 npm tarball。

#### Scenario: Build local tarball
- **WHEN** a maintainer runs `npm pack` from the Buildr Service root
- **THEN** npm MUST create a tarball for the Buildr CLI package
- **AND** the tarball MUST declare `buildr` bin as `bin/buildr.mjs`
- **AND** the bin MUST delegate to the packaged `src/bootstrap/cli/main.ts` implementation

#### Scenario: Install tarball locally
- **WHEN** a user installs the tarball with `npm install -g ./<tarball>` or an equivalent temporary `--prefix`
- **THEN** the installed environment MUST provide an executable `buildr` command
- **AND** the executable MUST NOT require `tools/`, `test/` or active Change artifacts
