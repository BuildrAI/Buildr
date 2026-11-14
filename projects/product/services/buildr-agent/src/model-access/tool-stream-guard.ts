import {ModelAccessError, type ModelProtocol} from './contracts.ts';
import {modelFailure} from './errors.ts';

export const MAX_TOOL_ARGUMENT_BYTES=1024*1024;
export const MAX_TOOL_ARGUMENT_WHITESPACE=32*1024;
const MAX_EVENT_BYTES=8*1024*1024;
type Counter={bytes:number;whitespace:number};
const object=(value:unknown):Record<string,any>=>value!==null&&typeof value==='object'?value as Record<string,any>:{};

/** Inspect fragments without parsing the growing arguments or retaining their text. */
export class ToolArgumentGuard {
  private calls=new Map<string,Counter>();
  private argument(key:string,value:unknown,replace=false):void {
    if(typeof value!=='string')return;
    const count=replace?{bytes:0,whitespace:0}:this.calls.get(key)??{bytes:0,whitespace:0};
    count.bytes+=Buffer.byteLength(value);
    if(count.bytes>MAX_TOOL_ARGUMENT_BYTES)throw new ModelAccessError('model_tool_arguments_too_large','模型工具参数超过本次限制，已停止该模型请求；已完成结果保留。',502);
    for(const char of value){
      count.whitespace=/[ \t\r\n]/.test(char)?count.whitespace+1:0;
      if(count.whitespace>MAX_TOOL_ARGUMENT_WHITESPACE)throw new ModelAccessError('model_tool_arguments_stalled','模型工具参数持续输出异常空白，已停止该模型请求；已完成结果保留。',502);
    }
    this.calls.set(key,count);
  }
  accept(value:unknown,protocol:ModelProtocol):void {
    const event=object(value);
    if(protocol==='responses'){
      const key=String(event.item_id??event.output_index??'default');
      if(event.type==='response.function_call_arguments.delta')this.argument(key,event.delta);
      if(event.type==='response.function_call_arguments.done')this.argument(key,event.arguments,true);
      if(['response.output_item.added','response.output_item.done'].includes(event.type)&&event.item?.type==='function_call')this.argument(String(event.item.id??event.output_index??'default'),event.item.arguments,true);
    }else if(protocol==='anthropic-messages'){
      if(event.type==='content_block_delta'&&event.delta?.type==='input_json_delta')this.argument(String(event.index??0),event.delta.partial_json);
    }else if(protocol==='gemini'){
      for(const candidate of Array.isArray(event.candidates)?event.candidates:[]){
        const parts=object(candidate).content?.parts;
        for(const [index,part] of (Array.isArray(parts)?parts:[]).entries()){
          const call=object(part).functionCall;
          if(call!==undefined)this.argument(String(index),JSON.stringify(object(call).args??{}),true);
        }
      }
    }else{
      for(const choice of Array.isArray(event.choices)?event.choices:[]){
        const delta=object(choice.delta);
        for(const tool of Array.isArray(delta.tool_calls)?delta.tool_calls:[])this.argument(`${choice.index??0}:${tool.index??0}`,tool.function?.arguments);
        if(delta.function_call)this.argument(`${choice.index??0}:legacy`,delta.function_call.arguments);
      }
    }
  }
}

/** Preserve ordinary wire bytes; emit a real protocol error, never a success end. */
export function guardToolArgumentStream(response:Response,protocol:ModelProtocol,onFailure:(error:ModelAccessError)=>void):Response {
  if(!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))return response;
  const reader=response.body.getReader(),decoder=new TextDecoder(),encoder=new TextEncoder(),guard=new ToolArgumentGuard();
  const cloudCodeEnvelope = protocol === 'gemini' && response.headers.get('x-buildr-gemini-envelope') === 'cloud-code';
  let buffer='',ended=false;
  const close=()=>{void reader.cancel().catch(()=>{}).finally(()=>reader.releaseLock());};
  const body=new ReadableStream<Uint8Array>({
    async pull(controller){
      if(ended)return;
      try{
        const chunk=await reader.read();buffer+=decoder.decode(chunk.value,{stream:!chunk.done});
        let boundary:RegExpExecArray|null;
        while((boundary=/\r?\n\r?\n/.exec(buffer))){
          const frame=buffer.slice(0,boundary.index);buffer=buffer.slice(boundary.index+boundary[0].length);
          if(Buffer.byteLength(frame)>MAX_EVENT_BYTES)throw new ModelAccessError('model_stream_too_large','模型单个流事件超过限制。',502);
          const data=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
          if(data&&data!=='[DONE]'){let event:unknown;try{event=JSON.parse(data);}catch{throw new ModelAccessError('model_stream_invalid','模型流返回了无效数据。',502);}guard.accept(cloudCodeEnvelope ? object(event).response ?? event : event,protocol);}
        }
        if(Buffer.byteLength(buffer)>MAX_EVENT_BYTES)throw new ModelAccessError('model_stream_too_large','模型单个流事件超过限制。',502);
        if(chunk.done){ended=true;reader.releaseLock();controller.close();}else controller.enqueue(chunk.value);
      }catch(error){
        ended=true;close();
        if(!(error instanceof ModelAccessError)){controller.error(error);return;}
        onFailure(error);
        const failure=modelFailure(error);
        const event=protocol==='responses'?{type:'error',...failure}:protocol==='anthropic-messages'?{type:'error',error:{type:'api_error',...failure}}:{error:failure};
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(event)}\n\n`));controller.close();
      }
    },
    cancel(){if(!ended){ended=true;close();}},
  },{highWaterMark:0});
  return new Response(body,{status:response.status,headers:response.headers});
}
