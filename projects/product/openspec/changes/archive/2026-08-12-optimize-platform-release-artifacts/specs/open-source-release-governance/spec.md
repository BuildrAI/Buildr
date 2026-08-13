## ADDED Requirements

### Requirement: 正式分发位置必须按渠道唯一
Buildr npm tarball MUST 只发布到 npm Registry；macOS/Windows installers、release manifest、checksums 与必要签名材料 MUST 只发布到对应不可变 `v<version>` GitHub Release Assets。GitHub Actions artifact MUST 只作为临时冻结候选与验证 evidence，不得作为官网、README、安装脚本或其他公共入口的下载 authority。

#### Scenario: 生成公共下载链接
- **WHEN** README、官网或安装脚本需要解析平台下载地址
- **THEN** 它 MUST 绑定 `https://github.com/BuildrAI/Buildr/releases/tag/v<version>` 中 manifest 声明的不可变 asset
- **AND** MUST NOT 复制二进制到第二个存储位置或指向 GitHub Actions artifact URL

#### Scenario: npm 分发
- **WHEN** 用户通过 npm 安装 `@buildr-ai/buildr`
- **THEN** package bytes MUST 来自 npm Registry 的目标 version/integrity
- **AND** GitHub Release MUST NOT 额外发布 npm tarball 作为替代 registry 渠道

### Requirement: GitHub Release 与 Assets 必须可恢复且不可覆盖
Release workflow MUST 对对应 tag 的 GitHub Release 和每个声明 asset 使用 ensure semantics。Release identity MUST 核对 tag、target commit、notes 与 prerelease/Latest；asset identity MUST 核对 filename、size 与公共下载 SHA-256。Missing MUST create/upload，identical MUST reuse，drift MUST fail closed，partial success rerun MUST only fill missing facts。

#### Scenario: Ensure 契约测试
- **WHEN** verifier 分别模拟 Release/asset 缺失、完全相同、identity 漂移和部分成功重跑
- **THEN** ensure MUST 返回稳定 create/upload、reuse、blocked 和 fill-missing plan
- **AND** drift case MUST NOT 调用 delete、overwrite、rename 或重新签名

#### Scenario: 公开 readback
- **WHEN** 全部 GitHub Release Assets 已 ensure
- **THEN** workflow MUST 从公开 asset URL 重新下载 installer、manifest 与 checksums 并核对最终 bytes
- **AND** 平台原生 job MUST 安装下载的 installer，在没有 system Node 的环境完成 CLI/Web smoke

### Requirement: 平台升级必须绑定上一代公开发布 lineage
Release contract MUST 使用版本控制中的 closed authority 明确声明上一代平台发布，包含 generation、version/tag、source commit、release manifest filename/size/SHA-256、application payload digest 与每个支持 target 的 installer filename/size/SHA-256。首代平台发布 MAY 声明空 lineage，但 MUST 先只读证明 GitHub Releases 不存在任何既有正式平台 manifest；后续 generation MUST 从上一 tag 的公共 GitHub Release 下载并逐字节核对 manifest 与对应 installer，且 MUST 把该 installer 作为原生升级/回滚 verifier 的唯一 previous input。

#### Scenario: 首代平台发布
- **WHEN** release contract 声明 generation 1 且 previous platform release 为 null
- **THEN** mutation 前的 history preflight MUST 遍历现有 Releases 并证明没有既有正式平台 manifest
- **AND** 发现任一既有正式平台资产时 MUST fail closed，不得重置 generation

#### Scenario: 后续平台发布
- **WHEN** release contract 声明 generation 2 或更高
- **THEN** workflow MUST 从 authority 指定的上一 tag 公共 Release 下载 manifest 与当前 target installer，并核对全部 lineage identity 和 bytes
- **AND** 缺失、generation 不连续、manifest/installer size 或 digest 漂移 MUST 在当前 installer 正式验证和公开写入前停止

## MODIFIED Requirements

### Requirement: Release workflow 必须按版本和渠道受控发布
Buildr MUST 提供 tag 驱动、GitHub-hosted、Environment 审批且 OIDC-ready 的 release workflow。Workflow MUST 先解析唯一 release contract，构建一次公共 application payload 与 npm tarball，并在平台原生 job 对每个声明 installer 各构建一次；全部可逆 build、inventory、最终 installer、签名、公证和 smoke gate 通过后，才允许 `npm publish`、GitHub Release/Asset mutation 等不可逆动作。发布成功后的远端 release task 分支清理 MUST 以稳定发布事实和用户明确授权为前提。

#### Scenario: 发布 prerelease tag
- **WHEN** `v<version>` tag 对应的 package version 包含 prerelease 标识
- **THEN** workflow MUST 使用 `next` dist-tag，并为同版本 GitHub Release 标记 prerelease 且不标记 Latest
- **AND** workflow MUST 在受保护 production Environment 中完成 npm、macOS 与 Windows 正式门禁后才允许 publish/upload

#### Scenario: 发布稳定 tag
- **WHEN** `v<version>` tag 对应稳定 package version
- **THEN** workflow MUST 使用 `latest` dist-tag，GitHub Release MUST 不标记 prerelease
- **AND** tag、package、payload、installer filename 与 manifest version MUST 完全一致
- **AND** workflow MUST NOT 从长期 npm publish token 或未受保护平台签名 secret 获得默认写权限

#### Scenario: 第一阶段只准备发布能力
- **WHEN** 本 change 完成并集成内部 `dev`
- **THEN** Buildr MUST NOT 因此自动推送公开 GitHub、创建 release tag、执行 npm publish、创建/修改 GitHub Release 或上传正式 assets
- **AND** 外部发布 MUST 等待后续显式授权、Environment approval 与账号侧 signing/OIDC 配置完成

#### Scenario: 候选必须来自最新 dev
- **WHEN** 维护者准备目标版本 release candidate
- **THEN** release task MUST 记录准备时的 `origin/dev` commit，并从该基线形成唯一 release contract、payload 与 artifact set
- **AND** 版本与发布材料提交 MUST 先通过 task finish 集成并推送到 `dev`
- **AND** 如需排除已有 dev 内容，维护者 MUST 先通过独立 change 在 dev 撤销，不得从旧 ancestor 直接发布

#### Scenario: main 合入前验证 dev 候选
- **WHEN** release task 准备创建 `dev` 到 `main` 的发布 PR
- **THEN** convergence gate MUST 证明 `origin/dev` 的 package version、tree、payload input 与已验证候选相同
- **AND** release task branch 无法 fast-forward 集成 dev 时 MUST 停止发布准备

#### Scenario: main 合入后验证历史收敛
- **WHEN** 发布 PR 已 squash merge 到 `main`
- **THEN** convergence gate MUST 证明 `origin/main` 与 `origin/dev` tree 等于已验证候选，并 MUST 重新确认 release contract source commit
- **AND** history bridge 后 `origin/main` MUST 是 `origin/dev` 的 ancestor
- **AND** 任一 ref、tree、version、payload input 或 release task 状态不一致时 MUST 在创建 tag 前停止

#### Scenario: 缺少生产签名条件
- **WHEN** 正式 tag workflow 缺少 macOS executable/installer signing、notarization 或 Windows executable/MSI signing 的任一 required condition
- **THEN** workflow MUST 在任何 npm publish、GitHub Release create 或 asset upload 前 fail closed
- **AND** ad-hoc/unsigned candidate MUST NOT 被改名、记录或上传为正式平台发行物

#### Scenario: 发布完成后清理 release task 分支
- **WHEN** 目标 tag、npm version/dist-tag、GitHub Release/Assets、manifest/checksums 与公共安装 smoke 均已验证成功，且远端存在 `tasks/release-<version>`
- **THEN** Agent MUST 展示待删除 ref、commit 和稳定发布证据
- **AND** Agent MUST 在用户明确授权后才删除该远端分支
- **AND** 删除后 MUST 重新查询远端并确认 ref 不存在

#### Scenario: 未授权或清理失败
- **WHEN** 用户未授权删除、远端查询不可用或分支删除失败
- **THEN** Agent MUST 保留该远端分支并报告清理 follow-up
- **AND** Agent MUST NOT 把清理失败解释为目标版本发布失败或重做 tag、npm publish、GitHub Release/Assets 的理由
