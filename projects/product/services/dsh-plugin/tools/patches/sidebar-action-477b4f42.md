# DSH 侧栏独立动作席位补丁

## 当前状态

隔离源码中的侧栏行为测试、真实文档对象模型快照（DOM Snapshot）、侧栏类型检查与客户端产物构建已通过。精确补丁可从干净基线应用。尚未执行真实浏览器组装验证，也没有在用户当前 DSH 生效；本结果不表示整套 DSH 构建通过。

## 精确基线

- 官方仓库：`https://github.com/deepseek-ai/deepseek-harness.git`
- 发布标签（Release Tag）：`dsh-v0.1.7-rc.2`，已核实为直接指向提交的轻量标签。
- 补丁基线提交：`477b4f420553e8a52c2fbccc464d7561b239c443`。
- 本机已安装应用：`0.1.7-rc.2`，构建提交 `c1275515b6b97551ec358c926c479ab750c687c0`。
- 两个提交不等价。公开远端拒绝获取安装版提交，错误为 `upload-pack: not our ref`。正式发布标签的侧栏仍采用相同的 `SidebarRoot`、`sidebar.panellist` 图标导航、`SlotMap` 与父级声明机制；没有把同版本号当作字节级或全产品兼容证明。
- 本补丁仅针对上述正式发布标签，不承诺可直接应用于安装版内部构建。

## 最小公开接口

```ts
'sidebar.action': {
  kind: 'list'
  scope: 'root'
  owner: SidebarActionOwnerProps
}

export interface SidebarActionOwnerProps {
  wide: boolean
}
```

原侧栏在“新会话”之后、全局面板列表之前渲染该席位。侧栏继续拥有间距、折叠动画、减少动态效果偏好以及平台可见性。占位插件通过 `slots.inject('sidebar.action', ...)` 注册唯一 `id` 与可选 `order`，提供完整按钮、可访问名称、图标和自己的动作回调；不要求注册 `main` 面板，不自动调用 `selectPanel`。按钮复用现有基础组件（Primitive）及主题标记（Theme Token）。空列表不增加垂直空间。

没有新增业务服务（Service）、共享存储（Store）、组件工厂（Component Factory）、渲染包装框架、运行时组件导出、私有组件访问、文档对象模型扫描（DOM Scanning）或安装包改写。工作区、会话、设置、页脚与 macOS 隐藏侧栏的头部控件继续由原侧栏及其原有插件负责。

## 变更范围

```text
packages/client/ui-sidebar/src/client/contract/slots.ts
packages/client/ui-sidebar/src/client/index.ts
packages/client/ui-sidebar/src/client/SidebarRoot.tsx
packages/client/ui-sidebar/src/client/SidebarRoot.module.css
packages/client/ui-sidebar/tests/apply.client.spec.tsx
packages/client/ui-sidebar/tests/panel-list.client.spec.tsx
packages/client/ui-sidebar/tests/sidebar-root.client.spec.tsx
packages/client/ui-sidebar/tests/__snapshots__/sidebar-snapshot.client.spec.tsx.snap
packages/client/ui-sidebar/README.md
packages/client/ui-sidebar/README.zh.md
packages/client/ui-sidebar/README.i18n.yaml
docs/subsystems/slots.md
docs/subsystems/slots.zh.md
packages/extensions/cordis-client-runner/src/client/slot-catalog.ts
```

生成的插槽目录通过上游生成器更新，未手工改写。双语说明配对记录通过上游配对工具更新。

## 已执行验证

本轮使用普通 Node `v24.15.0`，仅为子命令设置其 `bin` 目录为 `PATH`。先前签名 Node 引发的 Rolldown Team ID 拒绝未再出现；没有修改签名或系统安全策略。

```sh
TEST_NODE=/Users/chenjun/.local/opt/node-v24.15.0/bin/node
TEST_PNPM=/Users/chenjun/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.mjs
export PATH=/Users/chenjun/.local/opt/node-v24.15.0/bin
```

以下命令均在隔离上游源码根执行，侧栏产物构建一项除外。

| 命令／检查 | 退出码与结果 |
| --- | --- |
| `"$TEST_NODE" node_modules/vitest/vitest.mjs run packages/client/ui-sidebar --maxWorkers=2` | 首轮 1；此前缀同时选中相邻侧栏包，105 文件、1053 测试：1046 通过、2 跳过、5 失败。失败仅为旧夹具将新席位误作工作区，以及尚未更新的侧栏快照。 |
| `"$TEST_NODE" node_modules/vitest/vitest.mjs run packages/client/ui-sidebar/ --update --maxWorkers=2` | 0；修正夹具后，7 文件、55 测试通过，真实生成 5 份快照更新。 |
| `"$TEST_NODE" node_modules/vitest/vitest.mjs run packages/client/ui-sidebar/ --maxWorkers=2` | 0；同样 7 文件、55 测试通过，无跳过，已有快照只读重放通过。 |
| 上一命令追加 `--coverage --coverage.include=packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | 0；55 测试通过，指定侧栏组件的语句、分支、函数、行覆盖率均为 100%；不是整仓覆盖率声明。 |
| `"$TEST_NODE" --max-old-space-size=4096 node_modules/typescript/bin/tsc -b tsconfig.host.json` | 2；全宿主依赖尚不齐全，缺 Electron、ACP、OTel 等无关包及其派生诊断。未将此命令记为通过，未修改这些源码。 |
| 官方 `WorkspaceTypertGenerator`，仅选择声明 `./remote` 的宿主贡献，保持默认类型诊断启用 | 0；实际发现并生成 24 个贡献的宿主与远程调用描述（Remote Descriptor），产物仅在各包忽略的 `lib/` 中。 |
| `"$TEST_NODE" node_modules/typescript/bin/tsc -b packages/client/ui-sidebar/tsconfig.json` | 0；上述真实生成前置就绪后通过。 |
| 在侧栏包目录执行 `"$TEST_NODE" ../../../node_modules/tsdown/dist/run.mjs --env.DSH_BUILD_FACE client` | 0；从类型构建输出生成 Node 入口与客户端包，客户端 JavaScript 33.16 kB。未启动应用。 |
| `"$TEST_NODE" --import tsx/esm scripts/gen-client-catalog.ts --check` | 0；目录与源码一致。 |
| `git diff --check`、原始索引上的 `git apply --check --cached`、工作树上的 `git apply --check --reverse` | 均为 0。 |
| 独立临时索引：`git read-tree 477b4f420553e8a52c2fbccc464d7561b239c443`，然后 `git apply --cached --whitespace=error-all` | 0；实际应用后生成的完整差异与补丁逐字节一致。临时索引已删除，原索引未改动。 |

本轮依赖补充仅针对官方生成器，最终成功命令如下；未执行安装脚本。首次缺少既有 `--store-dir` 的尝试因非交互终端拒绝移除依赖目录而退出 1，没有强制清理。指定原依赖仓后成功退出 0；尽管使用 `--offline`，pnpm 的既有供应链策略检查仍访问了元数据注册表。

```sh
"$TEST_NODE" "$TEST_PNPM" --filter @deepseek-ai/dsh-typert-generator install \
  --ignore-scripts --ignore-pnpmfile --frozen-lockfile --offline \
  --store-dir /Users/chenjun/workspaces/BuildrAI/Buildr/.pnpm-store
```

生成前置的实际入口如下，没有关闭诊断或手工编写远程声明：

```sh
"$TEST_NODE" --max-old-space-size=4096 --import tsx/esm --input-type=module -e '
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WorkspaceTypertGenerator } from "./packages/typert/generator/src/workspace.ts";
const root = process.cwd();
const generator = new WorkspaceTypertGenerator(root);
const selected = generator.discover(["host"])
  .filter(p => JSON.parse(readFileSync(join(root, p.root, "package.json"), "utf8")).exports?.["./remote"])
  .map(p => p.package);
for (const artifact of generator.generate(selected, ["host"])) {
  const output = join(root, artifact.packageRoot, "lib");
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, `typert.${artifact.face}.js`), artifact.js);
  writeFileSync(join(output, `typert.${artifact.face}.d.ts`), artifact.dts);
  if (artifact.remote) {
    writeFileSync(join(output, "typert.remote-client.js"), artifact.remote.js);
    writeFileSync(join(output, "typert.remote-client.d.ts"), artifact.remote.dts);
    writeFileSync(join(output, "typert.remote-client.d.ts.map"), artifact.remote.dtsMap);
  }
}
'
```

交接中已完成且内容未再变动的检查继续有效：精确标签获取、显式忽略脚本的原依赖安装、两组双语文档配对、客户端本地化检查（920 源文件），均为退出码 0；本轮未重复执行这些检查。

## 覆盖、差异与剩余范围

- 新增动作与生命周期测试全部实际通过：升序和同序位置、位于新会话后／面板前、完整按钮及焦点、点击不改变面板、展开与折叠属性、动作独立卸载、侧栏声明消失后重建时重新安装，工作区、设置、页脚和主内容保留。
- 相对交接候选仅新增必要的旧夹具适配一行和 5 份真实快照更新。每份快照仅在原位置增加空 `sidebar.action` 容器，没有改写序列化规则或用硬编码结果替代执行。
- 最终补丁为 14 文件、274 行增加／7 行删除；生产实现仍保持原有 3 个 TypeScript 文件与 1 个样式文件，不含生成的构建产物。
- 上述快照来自真实插槽渲染器（Slot Renderer）的 jsdom 测试，不是浏览器截图或已安装应用的现场验收。真实浏览器组装及整套 DSH 构建仍未完成；用户禁止启动 DSH，本轮没有运行会启动实例的 `test:web`。
- 没有启动第二个 DSH、重启当前 DSH、安装插件、修改当前安装包、安全配置、提交或推送。下一步是由上游在完整依赖环境验证浏览器组装并接收补丁；当前安装版 `c1275515...` 仍不具备该扩展点。

## 远程调用参考

```text
Host 最小服务示例：
packages/host/plugin-inventory/src/index.ts:50-76
  extends TypertRemoteService
  super(ctx, 'pluginInventory')
  @Remote('list')

Client 贡献挂载：
packages/api/remotes/src/client/index.ts:166-194
  inject = ['remote']
  await ctx.remote.$mount(contribution)
  逆序释放挂载结果

Client 消费者：
packages/client/ui-settings-plugin-inventory/src/client/index.ts:29-43
  inject 包含 'remote' 与 'remote.pluginInventory'
  await ctx.remote.pluginInventory.list()
  检查 result.ok，读取 result.value
```

自定义命名空间（Namespace）不会因为宿主有一个方法而自动出现在客户端；必须挂载该命名空间生成的客户端贡献。以上仅提供源码参考，没有实现 Buildr 远程业务。
