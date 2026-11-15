import { Transform, type TransformCallback } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

/** The CLI documents cancel_queued on its interrupt control request, while the
 * SDK's convenience interrupt() currently omits it. Adapt only that documented
 * field through the SDK's supported custom-spawn surface; IDs stay SDK-owned. */
export class ClaudeControlInput extends Transform {
  private readonly decoder=new StringDecoder('utf8');
  private buffer='';
  private readonly cancelQueued:()=>boolean;
  constructor(cancelQueued:()=>boolean){super();this.cancelQueued=cancelQueued;}
  override _transform(chunk:Buffer,_encoding:BufferEncoding,callback:TransformCallback){
    try{
      this.buffer+=this.decoder.write(chunk);
      if(Buffer.byteLength(this.buffer)>64*1024*1024)throw new Error('agent_native_frame_too_large');
      let end:number;
      while((end=this.buffer.indexOf('\n'))>=0){
        let line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);
        if(this.cancelQueued()&&line.length<65536){
          const value=JSON.parse(line);
          if(value.type==='control_request'&&value.request?.subtype==='interrupt'){
            value.request.cancel_queued=true;line=JSON.stringify(value);
          }
        }
        this.push(line+'\n');
      }
      callback();
    }catch(error){callback(error as Error);}
  }
  override _flush(callback:TransformCallback){
    this.buffer+=this.decoder.end();
    if(this.buffer)this.push(this.buffer);
    this.buffer='';callback();
  }
}
