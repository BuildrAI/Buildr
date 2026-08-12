## ADDED Requirements

### Requirement: Project 必须显式声明 Task Environment Service 依赖
Buildr MUST 只从 canonical Project `task-environment.yml` 的 closed `buildr.project-task-environment/v1` schema解析Task Environment Service dependency roots与同Project source-build依赖边；Task Record scope MUST作为Service闭包入口，package script、目录结构和递归lockfile扫描 MUST NOT成为依赖routing authority。

#### Scenario: Buildr source build需要 sibling Web Service
- **WHEN** Product声明`buildr` Service requires `buildr-web`，且Task scope包含`product/buildr`
- **THEN** Task Environment MUST将两个Service已声明的required npm roots纳入准备计划
- **AND** MUST不把`buildr-web`写入Task Record scope或Buildr npm package runtime dependencies

#### Scenario: Task scope不含无关Service
- **WHEN** Task scope与显式requires闭包均不包含另一个已声明Service
- **THEN** Task Environment MUST不观察、安装或返回该Service的dependency roots
- **AND** MUST不扫描Project或Workspace寻找其他package-lock.json

#### Scenario: Service没有依赖声明
- **WHEN** scoped Service在可选Project声明中没有dependency roots且不被任何requires边纳入
- **THEN** 该Service的dependency readiness MUST明确聚合为`not-applicable`
- **AND** MUST不按文件存在猜测npm root

#### Scenario: required声明无效
- **WHEN** required root越出Service source、缺少manifest/lockfile、使用不受支持manager或requires未知Service
- **THEN** Task Environment MUST在执行安装前返回blocked并指出Project、Service与字段
- **AND** MUST不拼装任意安装命令或扩大Task scope
