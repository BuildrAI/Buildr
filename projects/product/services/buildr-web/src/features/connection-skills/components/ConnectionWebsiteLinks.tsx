import { Button, Dropdown } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import type { ConnectionInstance } from '../connection-skill-types';
import { connectionWebsiteLinks, websiteHref } from '../connection-skill-form';

export function ConnectionWebsiteLinks({ instance }: { instance: ConnectionInstance }) {
  const links = connectionWebsiteLinks(instance);
  const named = instance.definition?.definition.presentation?.websites !== undefined || Boolean(instance.websiteLinks?.length);
  if (named) {
    if (!links.length) return null;
    return <Dropdown trigger={['click']} menu={{ items: links.map(link => ({
      key: link.id, label: <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>,
    })) }}>
      <Button type="text" data-connection-websites={instance.id}>打开网站 <DownOutlined /></Button>
    </Dropdown>;
  }
  const website = websiteHref(instance.websiteUrl);
  return website ? <a href={website} target="_blank" rel="noopener noreferrer">打开网站</a> : null;
}
