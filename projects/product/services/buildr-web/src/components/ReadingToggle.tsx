import { Button } from 'antd';
import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';

type Props = { expanded:boolean; onToggle():void; className?:string; expandLabel?:string };
/** One reading action shared by ordinary split panes and the code workspace. */
export function ReadingToggle({expanded,onToggle,className,expandLabel='展开阅读'}:Props) {
  const label=expanded?'恢复分屏':expandLabel;
  return <Button className={className} size="small" type="text" icon={expanded?<FullscreenExitOutlined />:<FullscreenOutlined />} onClick={onToggle} aria-label={label}>{label}</Button>;
}
