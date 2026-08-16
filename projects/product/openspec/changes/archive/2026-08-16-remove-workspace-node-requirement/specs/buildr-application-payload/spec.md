## MODIFIED Requirements

### Requirement: Host Node 产品重入与 Workspace Node 执行必须显式分类
Buildr runtime MUST NOT 将 `process.execPath` 无条件视为任意安装来源。npm 产品重入 MUST 使用已登记 Host Node 与 package entry 的受控 invocation；Project verification、Preparation Step与其他Workspace命令 MUST按自身声明和当前受控执行环境运行，MUST NOT通过Organization Workspace Node resolver改写。

#### Scenario: npm 产品重入
- **WHEN** npm runtime 需要启动 Buildr-owned worker 或重新进入某个产品动作
- **THEN** 它 MUST 使用当前 installation identity 绑定的 Host Node 与 package entry 或进程内 API
- **AND** MUST NOT 从 PATH 查找 `node`、`npm` 或 `buildr`

#### Scenario: Workspace-owned subprocess
- **WHEN** Buildr为Workspace执行verification capability或Preparation Step
- **THEN** executor MUST使用声明argv/executable与当前受控执行环境
- **AND** MUST NOT要求、下载或记录Workspace Node identity
