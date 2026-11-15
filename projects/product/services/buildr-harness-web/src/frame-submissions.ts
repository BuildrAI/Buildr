/** A live page never submits the same engineering handoff twice. This is not a retry queue. */
export class FrameSubmissions<T> {
  private readonly requests=new Map<string,{input:string;result:Promise<T>}>();
  once(id:string,input:unknown,submit:()=>Promise<T>):Promise<T>{
    if(!/^[a-f0-9-]{36}$/i.test(id))return Promise.reject(new Error('工程交接请求身份无效。'));
    const binding=JSON.stringify(input),existing=this.requests.get(id);
    if(existing)return existing.input===binding?existing.result:Promise.reject(new Error('工程交接请求身份与内容不匹配。'));
    if(this.requests.size>=128)return Promise.reject(new Error('本页交接请求已达上限，请先核对原操作。'));
    const result=Promise.resolve().then(submit);this.requests.set(id,{input:binding,result});return result;
  }
}
