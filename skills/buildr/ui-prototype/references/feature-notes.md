# 可复用的功能说明组件

技能（Skill）随安装提供 `assets/feature-notes.js` 与 `assets/feature-notes.css`。组件（Component）使用原生浏览器能力，不依赖 React、Buildr 接口或外部资源。不要为每次原型重新实现卡片与高亮；沿用组件，只提供本次任务的说明、区域位置和画面切换接入。

## 说明内容

综合提案目标与设计交互，只写当前画面中与本次任务相关的功能及操作结果。保留作上下文的既有功能无需逐一解释；提案中不需要画面的功能也无需强配一张原型。组件复用、制作经过和验证记录不属于功能卡片。

每项说明使用 `{id,title,text,position?}`。在目标区域添加 `data-prototype-position="project-filter"`，卡片的 `position` 使用同一标识。优先指向一个有意义的局部区域；没有对应位置时省略字段。标题及正文以纯文本呈现，不执行 HTML。

## 独立原型内使用

以下为有构建步骤的源代码示例；路径相对于此技能目录，接入实际项目时以已安装技能位置解析。原型产物必须把脚本及样式内联，不能保留这些相对路径或机器绝对路径。

```js
import { mountFeatureNotes, createRegionHighlighter } from './assets/feature-notes.js';
import './assets/feature-notes.css';

const paint = createRegionHighlighter(document);
const featureNotes = mountFeatureNotes(document.querySelector('#feature-notes'), {
  notes: [{id:'filter', title:'搜索项目', text:'输入名称后显示匹配项目，清除后恢复全部。', position:'project-filter'}],
  onHighlight: (position, reveal) => paint(position, reveal),
});
// 切换关键画面时更新说明并清除上一个高亮。
paint(null);
featureNotes.update({notes: nextPageNotes, activePosition: undefined});
// 入口卸载时释放。
featureNotes.destroy();
```

`mountFeatureNotes` 提供卡片渲染、悬停、键盘聚焦、离开清除和点击定位。`update` 在说明不变时保留节点与焦点；`activePosition` 可用于原型区域向说明卡片的反向强调。`createRegionHighlighter` 只为已有标记区域添加轮廓，只有点击定位时滚动；不画说明连线，不改变业务状态。

使用现有主题时可提供 `--soft-primary`、`--soft-ink`、`--soft-muted`、`--soft-line`、`--soft-surface`；没有这些变量时使用组件的默认值。不要借此替换产品的页面主题、导航或业务组件。

## 接入 Buildr 任务阅读

任务阅读器负责外侧的页面列表与功能卡片，不要在原型里再叠一套说明面板。原型端复用同一文件中的联动组件：

```js
import { connectPrototype } from './assets/feature-notes.js';
import './assets/feature-notes.css';

let current = {page:'overview',state:''};
const bridge = connectPrototype({
  pages: metadata.pages,
  getSelection: () => current,
  onSelect: (page,state) => {
    current = {page,state};
    renderSceneWithMockData(page,state);
  },
});
// 原型内部操作切换页面时，只回报当前画面，不再初始化数据。
current = {page:'details',state:''};
bridge.report(current.page,current.state);
// 入口卸载时执行 bridge.destroy()。
```

联动组件处理装载确认、消息来源和已声明位置校验、高亮与清除；高亮不会调用 `onSelect`。关闭最后一个详情时也回报实际保留的主画面。React 等框架仅包装挂载、更新、销毁与状态回报，不复制组件内部逻辑。当前 Buildr Web 和本次总览原型已经直接导入这份来源。

只需同页卡片时使用 `mountFeatureNotes` 和 `createRegionHighlighter`；接入任务阅读时使用 `connectPrototype`。不要自行创建另一套消息格式。数据范围及阅读协议见 [内容格式](content-format.md)。

## 构建后验证

在实际阅读入口验证：卡片悬停和键盘聚焦对应正确区域，移开清除，点击可定位，切页后说明同步；正在输入的搜索和已完成的模拟操作不因高亮而重置。保留对普通旧原型的阅读兼容。
