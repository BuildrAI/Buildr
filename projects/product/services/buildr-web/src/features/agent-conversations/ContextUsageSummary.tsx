import type { ConversationContextReport } from './conversation-state';

const windowTokensLabel = (tokens: number | undefined) => tokens === undefined ? '未知' : Math.floor(tokens / 1000) + 'K';

/** Popover body: the configured window stays with the current selection; usage always comes from the retained real report. */
export function ContextUsageSummary({configuredWindow, report, reportWindow, reportLabel}: {configuredWindow?: number; report: ConversationContextReport | null; reportWindow?: number; reportLabel?: string}) {
  const usedPercent = report && reportWindow ? Math.min(100, Math.floor(report.usedTokens / reportWindow * 100)) : undefined;
  return <div className="ac-context-summary"><strong>上下文窗口</strong><div>配置窗口：{windowTokensLabel(configuredWindow)}</div>
    {report ? <>
      <div>已用：{windowTokensLabel(report.usedTokens)}{usedPercent !== undefined ? ` · ${usedPercent}%（剩余 ${100 - usedPercent}%）` : ''}</div>
      {reportWindow !== undefined && <div>运行窗口：{windowTokensLabel(reportWindow)}</div>}
      <small>{reportLabel ? `${reportLabel} 最近一次报告` : '执行智能体最近一次报告'}，非累计计费用量</small>
    </> : <div>已用：尚未收到执行智能体报告</div>}
  </div>;
}
