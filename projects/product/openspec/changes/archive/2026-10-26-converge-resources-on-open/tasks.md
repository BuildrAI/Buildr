# Tasks

## 1. 收敛降级

- [x] 1.1 `syncPackageBuiltins` 中对 `existing.resource` 的 `resolveSharedResource` 调用包裹降级：解析失败按无本地快照处理并交给既有状态判定；用单元或集成测试覆盖"清单引用已不在共享集的资源时 sync 不中断"。验证：`services/buildr` 相关测试通过，含旧引用场景的 fixture 不再抛 `Shared resource is not declared` 中断整次收敛。

## 2. 共享技能资源两段式退役

- [x] 2.1 在包资源清单/内置清单中支持 `replaces` 与显式 `retired` 声明的退役语义，供发布与解析消费；验证：声明可解析且旧消费路径不受影响。
- [x] 2.2 将 `preserved-archify.ts` 泛化为 `local/preserved-skills/<id>/` 退役封存：`publishPackageResources` 在替换共享集时封存声明退役的来源，`resolveSharedResource` 对登记过的退役来源返回封存文件；验证：集成测试模拟删除/改名技能后旧 `resource:` 引用仍可解析到封存副本。
- [x] 2.3 `package-check`/`static-validation` 增加门禁：包源中删除的技能资源目录若无 `replaces`/`retired` 声明则报错；验证：构造"裸删技能"夹具的检查用例失败并报告可接受声明方式。

## 3. 打开时自动收敛

- [x] 3.1 `prepareWorkspaceForOpen`/`refreshResourceProjection`：`refresh` 返回 `failed` 时自动转入 `select → start` 完整准备；`adopted` 落后或 refresh 成功仍保持现有快路径；自举空间分支语义不变；验证：集成测试模拟"adopted.ready 且清单过期"的工作空间，`POST /workspaces/open` 自动收敛清单并完成投射与采用，不再返回 `resourceRefresh: failed`。
- [x] 3.2 Buildr Web `WorkspacePreparationNotice` 适配：自动收敛路径无独立确认，准备进度与失败提示沿用现有组件；验证：打开持旧清单空间时不再出现"重试准备"循环，页面按真实进度显示。

## 4. 知识影响

- [x] 4.1 校准 `knowledge/code-map/skill-projection.md` 中 `resolveSharedResource` 解析与恢复叙述（退役封存来源、打开时自动收敛）；更新 `.buildr/knowledge-impact.yml` 记录本变更对代码地图的影响条目。
