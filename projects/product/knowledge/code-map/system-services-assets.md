# 服务与工程目录树

[返回项目总树](README.md)。两个服务目前属于同一 Git 仓库，各自维护依赖锁、构建配置和代码；服务责任不由仓库数量决定。

## 后端服务（Backend Service）

```text
services/buildr/
├── bin/buildr.mjs                         薄启动入口，不实现业务
├── src/                                  手工维护的产品源码
│   ├── bootstrap/                        唯一启动与全产品装配
│   │   ├── runtime.ts                    createRuntime / runtimeProvide
│   │   ├── module-registry.ts            install / provide / contributions
│   │   └── cli/                          顶层分发、帮助、错误与版本
│   ├── modules/                          按业务或稳定能力组织
│   │   ├── workspace/                    工作空间、项目、服务身份与登记
│   │   ├── task/                         任务、关系、专业结果与工作树
│   │   │   ├── change/                   任务关联规范变更的读取组合
│   │   │   └── daily-progress/           Git 提交主导的每日演进
│   │   ├── agent-assets/                 命令、规则、技能、组件及投射
│   │   ├── openspec/                     规范变更读取、收敛和恢复
│   │   ├── project-testing/              用户项目测试声明，非执行引擎
│   │   ├── installation/                 安装、更新、启动器和版本感知
│   │   ├── diagnostics/                  聚合必要读取结果，形成诊断
│   │   └── publication/                  文章与附件读取
│   ├── web/                              本机网页技术宿主
│   │   ├── module.ts                     注入工作空间解析等依赖
│   │   ├── application/                  实例与预览生命周期
│   │   ├── http/                         会话、分发、静态托管、读取进程
│   │   ├── infrastructure/               进程、端口、目录选择机制
│   │   └── interfaces/cli/web.ts          web 命令适配
│   └── infrastructure/                   通用技术，不接管业务规则
│       ├── filesystem/                   路径、原子文件、锁、变更日志
│       ├── sqlite/                       连接、历史迁移和事务管理
│       ├── git/                          通用仓库身份与观察
│       ├── network/                      网络请求与验证网络策略
│       ├── contracts/                    通用协议与诊断数据形状
│       ├── product-resources/            运行资源定位与完整性
│       ├── product-invocation/           产品再调用机制
│       └── testing/context-runtime/      对外测试库运行实现
│           ├── public.ts                 闭合的公开值与类型入口
│           ├── definition.ts             定义、身份与输入规则
│           ├── runtime.ts                创建、复用、隔离、释放资源
│           ├── node-test.ts              Node 测试适配
│           └── node-runner.ts            测试宿主运行
├── resources/                            手工维护、随产品交付的文件资产
│   ├── manifest.yml                      文件映射与发布边界
│   ├── workspace/                        同步到用户工作空间的源
│   ├── runtime/                          安装到智能体运行环境的源
│   ├── contracts/                        文件型契约
│   └── installation/                     安装资源
├── tools/                                工程程序源码，进入 Git
│   ├── build/                            生成物集合、前端、启动器构建
│   ├── codegen/contracts/                从模块协议生成前后端类型
│   ├── development/                      固定 Node、依赖、启动、安装
│   ├── testing/test-context-build.ts      编译公开测试库
│   ├── verification/
│   │   ├── candidate-environment.ts      准备候选验证输入
│   │   ├── package-check.ts              Buildr 自身包检查编排
│   │   └── package-check/                静态检查、场景检查、选择登记
│   ├── performance/                      独立性能基准，不默认执行
│   └── release/                          冻结、打包、发布与失败恢复
├── test/                                 测试源码与执行支撑
│   ├── unit/、component/、contract/       低成本规则、组装和结构检查
│   ├── integration/、system/             真实技术边界与产品流程
│   ├── integration-candidate-release/    候选发布组合验证
│   ├── browser-smoke/                    真实前后端组合浏览器测试
│   ├── context/                          Buildr 自测上下文与资源提供者
│   ├── helpers/、fixtures/               仅测试使用的支撑
│   └── verification/                     测试选择、执行、证据与清理
├── build/                                生成结果，Git 忽略
│   ├── generated/                        五类协议派生类型
│   └── test-context/                     公开测试库 ESM 与声明
├── web-dist/                             前端生成的构建兼托管产物
├── docs/                                 服务使用与维护说明
├── package.json、package-lock.json        依赖、命令和公开导出
└── tsconfig*.json                        源码检查与测试库编译配置
```

`tools/build/` 是构建程序；服务根 `build/` 是构建结果。`package/` 已无源码或输出职责。根目录不再维护 `test-context.mjs`；`@buildr-ai/buildr/test-context` 直接映射 `build/test-context/public.js` 和对应声明。正式打包可生成旧根文件的兼容转发，不把它作为源码维护。

## 前端服务（Frontend Service）

```text
services/buildr-web/
├── src/
│   ├── main.tsx                         启动 React
│   ├── App.tsx                          只装配路由
│   ├── app/                             跨页面应用壳
│   │   ├── AppLayout.tsx                 导航、工作空间选择、全局操作
│   │   ├── AppShellContext.tsx           真正跨页共享的壳状态
│   │   ├── AgentActionDrawer.tsx         组合完整领域表单
│   │   └── api/runtime-system-api.ts     退出本机应用等宿主请求
│   ├── features/                        功能拥有业务请求和完整交互
│   │   ├── workspace/                   工作空间列表、设置、操作、客户端
│   │   ├── project/                     项目列表、文档、编辑、客户端
│   │   ├── service/                     服务列表、文档、编辑、客户端
│   │   ├── task/                        任务页面、表单、状态、客户端
│   │   ├── project-daily-progress/       演进展示、动作及读取客户端
│   │   ├── agent-assets/api/            资产专用请求，无占位页面
│   │   ├── publication/                 文章列表、详情与客户端
│   │   └── installation/                版本提示与安装相关请求
│   ├── api/                             公共请求机制，不装配业务客户端
│   │   ├── client.ts                    HTTP、错误、通用文档结果类型
│   │   ├── LocalSessionAdapter.ts        会话凭据与请求头
│   │   ├── workspaceState.ts             当前请求的工作空间身份
│   │   └── index.ts                      装配共享传输实例
│   ├── components/                      跨功能展示，例如 Markdown
│   ├── lib/                             共享纯逻辑、文档导航和布局机制
│   ├── markdown.ts                      Markdown 渲染与内容安全
│   ├── theme.ts                         主题配置
│   └── styles.css                       全局与壳层样式
├── build/generated/                     协议生成类型，Git 忽略
├── test/                                前端自身渲染、交互和纯逻辑测试
├── index.html                           文档壳与本机会话注入位置
├── vite.config.ts                       输出到 ../buildr/web-dist/
├── tsconfig*.json                       前端静态检查
└── package.json、package-lock.json        前端依赖与构建命令
```

每个功能只建立确有用途的 `pages/`、`components/`、`hooks/`、`api/`，不要求四种目录对称出现。跨功能协作使用对方客户端或明确的组合组件，不直接访问对方私有状态。

## 构建与消费

```text
后端模块 HTTP Schema
  → tools/codegen/contracts/              工程源码
  → 两个服务的 build/generated/           派生类型
  → 源码类型检查和前端编译

src/infrastructure/testing/context-runtime/public.ts
  → tools/testing/test-context-build.ts
  → build/test-context/public.js + public.d.ts
  → package.json exports                 对外稳定子路径

buildr-web/src/
  → Vite                                 前端服务负责构建
  → buildr/web-dist/                      后端服务负责托管与打包

后端源码 + resources + web-dist + 公开测试库
  → tools/release/                        冻结输入并检查完整性
  → npm 包与应用负载（Application Payload）
```

浏览器和候选构建使用各自隔离的暂存目录，逻辑产物名称不变。测试辅助适配器可用于准备夹具，真实网页宿主采用生产装配。
