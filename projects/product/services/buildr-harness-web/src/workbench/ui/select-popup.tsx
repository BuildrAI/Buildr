import type { ReactElement } from 'react';

/**
 * 包裹 Select 弹层内容，使弹层内的 mousedown 不再沿 React 树冒泡到 Select 容器。
 * rc-select 会为弹层内的任何 mousedown 安排一个延迟的「焦点还给选择器」定时器；
 * 该定时器可能在焦点已移交其他控件后才执行，把焦点抢回去并连带关闭刚打开的下拉。
 * 选项列表自身已阻止 mousedown 默认行为、输入框不会失焦，因此抑制该定时器不改变可见行为。
 */
export function selectPopupGuard(menu: ReactElement) {
  return <div onMouseDown={event => event.stopPropagation()}>{menu}</div>;
}
