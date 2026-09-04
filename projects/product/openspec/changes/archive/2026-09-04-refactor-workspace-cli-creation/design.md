## Context

Workspace后端已经按领域和层边界完成第一步收敛。剩余最大问题是`interfaces/cli/workspace.ts`：729行文件不仅解析Project/Service命令，还直接执行Git clone、目录复制、Attached Root核验、Manifest兼容读写、Gitignore更新和declaration-intake输出。Project与Service Application当前体量不大，但接回完整创建用例后会超过合理边界，因此本切片根据新增后的实际职责和体量拆分，而不是预先为了Query/Command对称拆分。

## Goals / Non-Goals

**Goals:**

- Workspace、Project、Service拥有独立CLI Adapter。
- CLI只负责参数到Application输入的映射、文本/JSON输出和CLI语法错误。
- Project/Service创建、附接、物化、身份冲突和事务范围由所属Application负责。
- Manifest/YAML兼容解析和写入只由所属Repository负责。
- 保持全部公开命令行为和文件/Git副作用不变。

**Non-Goals:**

- 不改变命令名称、参数、help、输出JSON、错误码或next action。
- 不改变Project/Service Domain、Manifest schema、source语义、Git ownership或declaration-intake行为。
- 不整理Buildr Web前端。
- 不引入通用CLI框架、全局utils目录或第二套Git抽象。

## Decisions

### 1. CLI按独立领域拆分

建立`interfaces/cli/workspace.ts`、`project.ts`和`service.ts`。Workspace Adapter只承接初始化、bootstrap guide和mutation recovery入口；Project/Service Adapter分别解析本领域创建参数并调用所属Application。共享的基础CLI参数能力继续使用Bootstrap/Infrastructure现有端口，不复制解析器。

### 2. 创建/附接按独立副作用边界拆分

当前Project/Service Application体量合理，不拆Query/Command。CLI中的创建流程具有独立的Git clone/copy/attach、staging、失败清理、Gitignore和Manifest mutation生命周期，与普通详情、metadata更新和migration的变化原因不同，因此分别形成`project-creation-application.ts`和`service-creation-application.ts`。

module直接把创建API与原Application组合成现有`project.application`、`service.application` capability，不增加转发Facade或新的公开身份。如果未来原Application自身因读写职责和体量同时超界，再独立判断Query/Command拆分。

### 3. Repository拥有Manifest兼容映射

CLI中的`parseProjectsYaml`、`renderProjectsYaml`、`validateProjectsRegistry`、`parseServicesManifestYaml`、`renderServicesManifestYaml`等兼容逻辑迁入对应Repository。Application调用Repository的结构化读取和写入，不解析YAML；Interface也不导入YAML库。

### 4. Git与filesystem动作由Application编排现有Infrastructure

Project/Service Command Application决定clone/copy/attach的业务顺序、identity冲突和Workspace mutation范围；实际Git命令、filesystem、路径身份与原子写入继续使用现有Infrastructure能力。不会新建模块内Git Repository，因为这些动作不属于Manifest持久化。

### 5. module只组合Application与CLI

`workspace/module.ts`继续持有CLI contribution descriptor，但分别向Project/Service Adapter注入对应Application API。模块不依赖CLI向private composition登记业务方法；兼容runtime port只公开真正仍有消费者的方法。

## Risks / Trade-offs

- [CLI迁移后错误文本或输出顺序漂移] → 保留原命令fixtures和CLI compatibility测试，按真实stdout/stderr回归。
- [Git clone/copy失败留下stage目录] → 保持当前唯一staging目录与finally清理语义。
- [Manifest兼容逻辑迁移改变v1/v2行为] → 运行Project/Service round-trip、migration和Workspace lifecycle测试。
- [Query/Command拆分造成Facade] → module直接组合两个API为现有capability，不保留旧Application文件转发。
- [共享helper被提前抽象] → 只有Project与Service真实共同且语义相同的纯函数才进入具名协作者；否则留在所属领域。

## Migration Plan

1. 把Project/Service Manifest兼容读写收回Repository并保持现有测试。
2. 将Project/Service创建与附接迁入各自独立Creation Application，保持原Application文件不机械拆分。
3. 建立三个领域CLI Adapter，删除729行旧聚合实现。
4. 更新module、runtime port、生成/验证路径和全部消费者。
5. 更新当前认知并运行类型、CLI、Project/Service、Workspace生命周期和完整受影响验证。

本Change不迁移用户数据；回滚通过撤销源码、规范和文档完成。

## Open Questions

无。
