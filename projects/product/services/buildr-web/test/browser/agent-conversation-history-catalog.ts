/** Stable history identities and labels; safe for source-only planning. */
export const HISTORY_SCENARIO_CATALOG = [
  {
    "id": "history/switch-loading",
    "name": "切换慢请求保留不可交互的原消息，首订阅不重复读取且旧响应不串会话"
  },
  {
    "id": "history/workspace-switch",
    "name": "切换工作空间只更新工作区，对话节点和草稿保留，列表默认全部空间"
  },
  {
    "id": "history/handoff-source",
    "name": "交接按轮引用读取，折叠不取正文，工具展开才读详情"
  },
  {
    "id": "history/seen-summary",
    "name": "待查看点击后立即同步列表与统计，不等待轮询"
  },
  {
    "id": "history/hidden-observer",
    "name": "隐藏对话释放观察连接，恢复核对且附件仍可上传"
  },
  {
    "id": "history/workspace-order",
    "name": "列表调整空间顺序立即同步活动浮窗"
  },
  {
    "id": "history/participation-hidden",
    "name": "Buildr 参与两个入口暂时隐藏且不请求参与数据"
  },
  {
    "id": "history/ownership-grouping",
    "name": "交错执行按归属合组，旧问题存档和子报告不打断主线"
  },
  {
    "id": "history/supplement-grouping",
    "name": "同轮补充在原展示行下按序展开，完成后与过程一起折叠"
  },
  {
    "id": "history/send-latest",
    "name": "发送后始终展示最新信息，布局滚动不误加载更早记录"
  },
  {
    "id": "history/initial-page-alignment",
    "name": "补页期间短内容顶对齐，溢出后首帧跟随最新位置"
  },
  {
    "id": "history/short-page-alignment",
    "name": "补完不足一屏的历史后保持顶对齐，不撑高信息流"
  },
  {
    "id": "history/send-reflow",
    "name": "发送重排钳制仍贴底，阅读过程在完成后保留且可见答复确认查看"
  },
  {
    "id": "history/hidden-child-seen",
    "name": "主答复后的隐藏子消息不阻止真实已读确认"
  },
  {
    "id": "history/scroll-anchor",
    "name": "刷新布局跟随最新，滚动条接管后不被延迟锚点拉回"
  },
  {
    "id": "history/tool-detail-cache",
    "name": "大工具记录仅在展开明细时读取完整内容并按内容版本复用"
  },
  {
    "id": "history/attention-priority",
    "name": "较旧的待决策与待查看始终排在最新输入的执行中之前"
  },
  {
    "id": "history/fork-conversation",
    "name": "指定答复分叉为独立对话，刷新保留来源并可返回原对话"
  },
  {
    "id": "history/responsive-width",
    "name": "顶部正文输入与列表共用最大宽度，宽屏居中且窄屏自适应"
  },
  {
    "id": "history/focus-mode-drawer",
    "name": "专注模式列表左侧临时栏不替换对话，分屏模式保持面板内替换"
  },
  {
    "id": "history/history-pagination",
    "name": "列表手动从末条加载，整行折叠与拖动互不干扰"
  },
  {
    "id": "history/search",
    "name": "搜索只匹配标题与用户/助手消息，展示片段且统计读取不随关键词重发"
  },
  {
    "id": "history/model-filter",
    "name": "完整列表的模型统计项可点击筛选并恢复"
  },
  {
    "id": "history/historical-model",
    "name": "首个回复前使用本轮实际智能体和模型，切换草稿或刷新不改写历史"
  },
  {
    "id": "history/history-identity",
    "name": "历史两行展示完整标识，标题可复制同一标识且保留导航"
  },
  {
    "id": "history/historical-tool-failure",
    "name": "历史工具失败不改变当前执行图形的状态"
  },
  {
    "id": "history/turn-timing",
    "name": "整轮计时包含最后答复，过程折叠向右、展开向下"
  },
  {
    "id": "history/tool-folding",
    "name": "连续工具默认汇总折叠，明确展开在追加时保持，结束折叠且展开后失败提醒靠右"
  },
  {
    "id": "history/new-input-with-question",
    "name": "有待回答问题时输入新指令始终发送新轮，卡片不被当作回答"
  },
  {
    "id": "history/failed-new-input",
    "name": "新轮尚未原生受理或启动失败时旧问题卡片保持可操作"
  },
  {
    "id": "history/running-supplement",
    "name": "执行中图文普通发送、固定上下文和长输入，失败未知与独立停止"
  },
  {
    "id": "history/flow-controls",
    "name": "历史无卡片且自然滚动，智能体标识可展开折叠，长过程可就近收起"
  },
  {
    "id": "history/running-header",
    "name": "仅当前运行段悬浮，历史无嵌套卡片，结束失败停止和待回应立即恢复自然排版"
  },
  {
    "id": "history/reading-position",
    "name": "刷新异步排版与输入框增高始终贴底，主动上翻保留阅读位置"
  },
  {
    "id": "history/fill-viewport",
    "name": "打开和刷新时补足首屏，折叠过程不占高度也能继续补页，填满即停止"
  },
  {
    "id": "history/earlier-pagination",
    "name": "向上接近历史自动单批加载，阅读定位与展开保持，键盘触摸及失败重试隔离"
  },
  {
    "id": "history/pagination-budget",
    "name": "首屏补页预算耗尽后，滚轮触摸与键盘仍可自然向上续读"
  },
  {
    "id": "history/screenshot-links",
    "name": "临时截图链接使用认证预览，文件错误提示不跨对话或草稿残留"
  },
  {
    "id": "history/file-citations",
    "name": "file citations render labels and open the observed source with its line number"
  }
] as const;

export type HistoryScenarioId = typeof HISTORY_SCENARIO_CATALOG[number]['id'];
