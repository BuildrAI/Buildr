# 项目、服务与代码库关系图的依据

范围是引用模型示意，不是当前工作空间登记清单或部署拓扑。

- `project-a`、`project-b` 与 `shared-service`，以及 `a-service`、`b-service`：依据项目服务多对多规范；两个项目可以指向同一服务身份。
- `repository` 与 `service-repo`：依据服务只引用一个代码库实例的规则，多个服务可复用同一实例。
- `module-files` 与 `repo-code`：依据模块路径限定及当前资料解析应用；代码位置由已登记实例目录与模块路径确定。

[关系规范](../../../openspec/specs/workspace-asset-relationships/spec.md)、[代码库规范](../../../openspec/specs/repository-instance-registry/spec.md)、[实现地图](../../code-map/project-service-repositories.md)。不把业务引用解释为服务运行调用，也不暗示写入声明会克隆或切换分支。
