import type { ReactNode } from 'react';
import { Button, Drawer } from 'antd';
import { CloseOutlined } from '@ant-design/icons';

type Props = {
  open: boolean;
  /** 标识行（eyebrow），如「AGENT ACTION」「编辑项目」。 */
  eyebrow?: string;
  title: string;
  /** 副标题，通常为对象上下文，如「项目 › Buildr 产品」。 */
  sub?: ReactNode;
  onClose: () => void;
  /** 底部区域：状态文案 + 主按钮，由调用方组合。 */
  footer?: ReactNode;
  width?: number | string;
  children: ReactNode;
  maskClosable?: boolean;
  keyboard?: boolean;
  closeAriaLabel?: string;
  closeDisabled?: boolean;
  /** 头部额外动作（在关闭按钮左侧），如「展开阅读」。 */
  extra?: ReactNode;
  rootClassName?: string;
  /** 透传给 antd Drawer 根节点的 id（供既有测试与锚点引用）。 */
  id?: string;
  closeButtonId?: string;
  titleId?: string;
  /** 透传 antd Drawer 的动画结束回调（用于清理草稿等）。 */
  afterOpenChange?: (visible: boolean) => void;
};

/**
 * 统一抽屉壳：eyebrow + 标题 + 副标题 + 关闭 + 可滚动正文 + 底部状态/主按钮。
 * 所有动作与编辑抽屉共用，保证交互与视觉一致。
 */
export function DrawerShell({
  open,
  eyebrow,
  title,
  sub,
  onClose,
  footer,
  width = 560,
  children,
  maskClosable = true,
  keyboard = true,
  closeAriaLabel = '关闭',
  closeDisabled = false,
  extra,
  rootClassName,
  afterOpenChange,
  id,
  closeButtonId,
  titleId,
}: Props) {
  return (
    <Drawer
      id={id}
      open={open}
      placement="right"
      width={width}
      rootClassName={['drawer-shell', rootClassName].filter(Boolean).join(' ')}
      onClose={onClose}
      maskClosable={maskClosable}
      keyboard={keyboard}
      closable={false}
      destroyOnClose
      afterOpenChange={afterOpenChange}
      title={(
        <div className="drawer-shell-heading">
          {eyebrow ? <span className="drawer-shell-eyebrow">{eyebrow}</span> : null}
          <span className="drawer-shell-title" id={titleId}>{title}</span>
          {sub ? <span className="drawer-shell-sub">{sub}</span> : null}
        </div>
      )}
      extra={(
        <div className="drawer-shell-extra">
          {extra}
          <Button
            type="text"
            id={closeButtonId}
            className="drawer-shell-close"
            aria-label={closeAriaLabel}
            icon={<CloseOutlined />}
            disabled={closeDisabled}
            onClick={onClose}
          />
        </div>
      )}
      footer={footer ?? null}
    >
      {children}
    </Drawer>
  );
}
