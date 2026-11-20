import { Button, Tooltip } from 'antd';
import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';

type Props = { expanded:boolean; onToggle():void; className?:string; expandLabel?:string; iconOnly?:boolean };
/** One reading action shared by ordinary split panes and the code workspace. */
export function ReadingToggle({expanded,onToggle,className,expandLabel='展开阅读',iconOnly=false}:Props) {
  const label=expanded?'恢复分屏':expandLabel;
  const button=<Button className={className} size="small" type="text" icon={expanded?<FullscreenExitOutlined />:<FullscreenOutlined />} onClick={onToggle} aria-label={label}>{iconOnly?null:label}</Button>;
  return iconOnly?<Tooltip title={label}>{button}</Tooltip>:button;
}
