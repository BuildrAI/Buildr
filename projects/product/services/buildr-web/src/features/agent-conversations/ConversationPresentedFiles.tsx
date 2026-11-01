import {useEffect,useRef,useState} from 'react';
import {Alert,Button,Modal,Spin} from 'antd';
import {FileTextOutlined} from '@ant-design/icons';
import {CopyButton} from '../../components/CopyButton';
import {MarkdownReader} from '../../components/MarkdownReader';
import type {ConversationEntry} from './types';
import './conversation-presented-files.css';

type FileContent={kind:string;content:string;message?:string;truncated:boolean};
type File={key:string;path:string;description?:string};
type Props={entries:ConversationEntry[];read:(path:string,signal:AbortSignal)=>Promise<FileContent>;onOpen:(path:string)=>void};

/** Output files remain visible outside the collapsed tool transcript. Reads are on demand. */
export function ConversationPresentedFiles({entries,read,onOpen}:Props){
  const files:File[]=entries.filter(entry=>entry.status==='completed'&&!entry.parentToolId).flatMap(entry=>(entry.presentedFiles??[]).map((file,index)=>({...file,key:entry.id+':'+index})));
  const [selected,setSelected]=useState<File|null>(null),[content,setContent]=useState<FileContent|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const pending=useRef<AbortController|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  const preview=async(file:File)=>{
    pending.current?.abort();const controller=new AbortController();pending.current=controller;
    setSelected(file);setContent(null);setError('');setLoading(true);
    try{const value=await read(file.path,controller.signal);if(!controller.signal.aborted)setContent(value);}
    catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:'文件暂不可读取。');}
    finally{if(!controller.signal.aborted)setLoading(false);}
  };
  const close=()=>{pending.current?.abort();setSelected(null);setLoading(false);};
  return <>
    {files.length>0&&<div className="ac-presented-files" aria-label="已提供的文件">{files.map(file=><section className="ac-presented-file" data-presented-file={file.path} key={file.key}>
      <FileTextOutlined aria-hidden/>
      <div className="ac-presented-file-body"><strong title={file.path}>{file.path.split(/[\\/]/).at(-1)}</strong>{file.description&&<p title={file.description}>{file.description}</p>}<code title={file.path}>{file.path}</code></div>
      <div className="ac-presented-file-actions"><Button size="small" autoInsertSpace={false} onClick={()=>void preview(file)}>预览</Button><Button size="small" type="link" autoInsertSpace={false} onClick={()=>onOpen(file.path)}>打开</Button><CopyButton type="text" text={file.path} ariaLabel="复制文件路径" failureMessage="复制失败，请手动复制文件路径。"/></div>
    </section>)}</div>}
    <Modal open={Boolean(selected)} onCancel={close} footer={null} title={selected?.path.split(/[\\/]/).at(-1)} width="min(900px, calc(100vw - 32px))" rootClassName="ac-panel-popup ac-file-preview" destroyOnHidden>
      {selected&&<><p className="ac-file-preview-path">{selected.path}</p><div className="ac-file-preview-controls"><Button size="small" onClick={()=>{const file=selected;close();onOpen(file.path);}}>打开文件</Button>{error&&<Button size="small" onClick={()=>void preview(selected)}>重新读取</Button>}</div>
      {loading?<Spin aria-label="正在读取文件"/>:error?<Alert type="warning" showIcon message={error}/>:content&&<div className="ac-file-preview-content">{content.message&&<Alert type="info" showIcon message={content.message}/>} {content.kind==='markdown'?<MarkdownReader path={selected.path} content={content.content}/>:content.kind==='image'?<img src={content.content} alt={selected.path.split(/[\\/]/).at(-1)}/>:content.kind!=='unsupported'?<pre>{content.content}</pre>:null}</div>}</>}
    </Modal>
  </>;
}
