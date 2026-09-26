# 任务原型内容格式

普通旧 HTML 继续凭 `<!-- buildr:ui-prototype -->` 和标题发现。需要页面目录、状态和说明联动时，在自包含 HTML 的 head 中放置一个非执行数据块：

```html
<script id="buildr-prototype" type="application/json">
{"version":1,"pages":[{"id":"overview","title":"工作空间总览","notes":[{"id":"scope","title":"本次变化","text":"查看整体组成，点击进入具体对象。","position":"composition"}],"states":[{"id":"empty","title":"空白","notes":[{"id":"empty-note","title":"尚无内容","text":"显示可开始登记的入口。"}]}]}]}
</script>
```

纯文本说明不执行 HTML 或任意链接。数据块上限 64 KiB；最多 20 个关键页面，每页最多 20 个状态，每组最多 30 条说明；标题 160 字符、说明 4000 字符。局部标识最多 64 字符，以字母或数字起始，余下只用字母、数字、下划线或连字符，同组不重复。JSON 中的 `<` 转义为 `\u003c`，避免提前关闭 script。非法元信息只显示局部诊断，页面仍可隔离阅读。

单文件仍遵循现有 2 MiB 限制，扫描最多展示 20 个文件；先缩小实际构建依赖，不默认放大限制。一个文件可包含多个关键画面；无法在单文件可靠表达时生成多个独立文件。

消息联动优先复用随技能分发的 [功能说明组件](feature-notes.md)，而不是在每个原型重新实现。

## 最小阅读消息

功能说明来自提案目标与设计中的交互结果，只覆盖当前画面上与本次任务相关的功能；无需覆盖所有提案需求，也不承载实现或制作日志。每条说明的 `position` 可选，对应画面区域的 `data-prototype-position`。没有位置的说明仍可作为普通文本阅读。

隔离页面安装消息监听后发送 `{type:"buildr:prototype:ready"}`。宿主检查发送窗口后下发 `{type:"buildr:prototype:select",nonce,page,state}`；只接受 `event.source === parent`，检查本文件已声明的页面、状态，记录本次装载的 nonce。默认状态为空字符串；宿主主动选择从明确初始数据开始。应用选择并呈现后回报 `{type:"buildr:prototype:rendered",nonce,page,state}`，宿主校验当前画面后恢复仍在悬停的区域提示，避免初始装载覆盖先到的高亮。

页面内关键操作改变画面时，向 parent 发送 `{type:"buildr:prototype:state",nonce,page,state}`。关闭最后一个对象详情时也应回报实际保留的主画面。只回报已声明的标识，不发送业务数据或请求宿主执行动作。宿主同时检查当前框架窗口、装载 nonce 和允许的标识集合；不透明来源的 `null` 不能作为信任凭据。单独打开文件时保留明确默认画面及本地交互。

悬停、聚焦与定位使用独立消息 `{type:"buildr:prototype:highlight",nonce,page,state,position,reveal?}`。位置为当前页面或状态已声明的标识，`null` 表示清除，缺失位置无效；仅 `reveal:true` 时滚动定位。消息必须匹配当前画面、状态与装载 nonce，只改变已有区域高亮，不切换页面、不重置数据、不导航或请求接口。卡片移开、失焦或面板关闭时清除；画面变化也清除旧高亮。原型内区域悬停可以用同种消息回报宿主以强调对应卡片。不得绘制卡片到画面的连接线。

两种阅读入口均在 `sandbox="allow-scripts"` 中加载内容，不添加 `allow-same-origin`；保持现有离线内容安全策略（CSP）。来源观察及未验证范围可放在 HTML 注释和随任务交付的说明里，不能将过程日志叠在产品画面上。
