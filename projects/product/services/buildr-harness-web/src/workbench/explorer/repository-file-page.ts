export type RepositoryFilePage = {index:number;total:number;offset:number;endOffset:number;startLine:number;endLine:number;startsMidLine:boolean;endsMidLine:boolean;matchOffset?:number;matchEndOffset?:number};
export type RepositoryMatchRange = {start:number;end:number};

/** Convert observed UTF-8 bytes only; never infer a match from a partial search term. */
export function visibleRepositoryMatch(content:string,page:RepositoryFilePage): (RepositoryMatchRange & {continuesBefore:boolean;continuesAfter:boolean}) | null {
  if(page.matchOffset===undefined||page.matchEndOffset===undefined)return null;
  const start=Math.max(page.offset,page.matchOffset),end=Math.min(page.endOffset,page.matchEndOffset);
  if(start>=end)return null;
  const bytes=new TextEncoder().encode(content);
  if(bytes.length!==page.endOffset-page.offset)return null;
  try {
    const decoder=new TextDecoder('utf-8',{fatal:true});
    return {start:decoder.decode(bytes.subarray(0,start-page.offset)).length,end:decoder.decode(bytes.subarray(0,end-page.offset)).length,continuesBefore:page.matchOffset<page.offset,continuesAfter:page.matchEndOffset>page.endOffset};
  }catch{return null;}
}

/** Keep source line numbers and observed match offsets aligned across a page. */
export function repositorySourceLines(content:string,startLine=1,match?:RepositoryMatchRange,omitTrailingEmpty=false) {
  let offset=0;
  const lines=content.split('\n');
  // A nonfinal page's terminating LF introduces the next page's line, not another row here.
  if(omitTrailingEmpty&&content.endsWith('\n'))lines.pop();
  return lines.map((text,index)=>{
    const start=match?Math.max(0,match.start-offset):0,end=match?Math.min(text.length,match.end-offset):0;
    offset+=text.length+1;
    return {text,line:startLine+index,match:match&&start<end?{start,end}:undefined};
  });
}
