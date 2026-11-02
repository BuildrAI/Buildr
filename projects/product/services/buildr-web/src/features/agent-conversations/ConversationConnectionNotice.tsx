import { Button } from 'antd';
import type { ConnectionView } from './types';

export function ConversationConnectionNotice({ready,loading,error,connection,onSettings}:{
  ready?:boolean;loading?:boolean;error?:string;connection?:ConnectionView;onSettings:()=>void;
}){
  if(connection?.enabled)return null;
  if(error)return <small role="status">{error}</small>;
  if(ready===false||loading)return null;
  return <div className="ac-connect-notice"><span>{connection?'所选智能体尚未就绪':'请先接入智能体'}</span><Button type="link" size="small" onClick={onSettings}>智能体与模型</Button></div>;
}
