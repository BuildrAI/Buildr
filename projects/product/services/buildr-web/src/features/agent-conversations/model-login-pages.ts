import type {ModelAccount} from './types';

type LoginPage = Pick<Window,'closed'|'close'|'location'|'opener'|'document'>;
/** Reserve during the click, not after an asynchronous CLI/network response. */
export class ModelLoginPages {
 private pending=new Map<string,{page:LoginPage|null;attemptId?:string}>();
 private opened=new Set<string>();
 private open:()=>LoginPage|null;
 constructor(open:()=>LoginPage|null){this.open=open;}
 reserve(accountId:string){
  this.pending.get(accountId)?.page?.close();
  const popup=this.open();
  if(popup){popup.opener=null;popup.document.title='官方账号登录';popup.document.body.textContent='正在准备官方登录页，请稍候。您可在 Buildr 中查看进度或取消登录。';}
  const entry={page:popup,attemptId:undefined as string|undefined};this.pending.set(accountId,entry);
  return {bind:(attemptId?:string)=>{entry.attemptId=attemptId;},close:()=>{entry.page?.close();if(this.pending.get(accountId)===entry)this.pending.delete(accountId);}};
 }
 observe(accounts:ModelAccount[]){
  for(const account of accounts){
   if(account.connectionId)continue;
   const attempt=account.loginAttempt,entry=this.pending.get(account.id);
   if(!attempt||entry&&!entry.attemptId)continue;
   if(entry&&entry.attemptId!==attempt.id){entry.page?.close();this.pending.delete(account.id);continue;}
   if(!['initializing','waiting-browser','checking'].includes(attempt.state)){
    entry?.page?.close();this.pending.delete(account.id);continue;
   }
   if(attempt.state!=='waiting-browser'||!attempt.url?.startsWith('https://')||this.opened.has(attempt.id))continue;
   this.opened.add(attempt.id);
   const popup=entry?.page&&!entry.page.closed?entry.page:this.open();
   if(popup){popup.opener=null;popup.location.href=attempt.url;}
   this.pending.delete(account.id);
  }
 }
 close(){for(const entry of this.pending.values())entry.page?.close();this.pending.clear();}
}
