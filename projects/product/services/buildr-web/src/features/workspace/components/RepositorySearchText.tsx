import { Fragment } from 'react';
import type { RepositoryMatchRange } from './repository-file-page';

type Segment = { start:number; end:number; matched:boolean };
/** Literal Unicode case-insensitive matching; offsets refer to the original text. */
export function repositorySearchSegments(text:string,query:string,observed?:RepositoryMatchRange):Segment[] {
  const matches:RepositoryMatchRange[]=[];
  if(query.trim()) {
    const pattern=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu');
    for(const match of text.matchAll(pattern))matches.push({start:match.index!,end:match.index!+match[0].length});
  }
  if(observed&&observed.start>=0&&observed.end<=text.length&&observed.start<observed.end)matches.push(observed);
  matches.sort((a,b)=>a.start-b.start);
  const merged:RepositoryMatchRange[]=[];
  for(const match of matches){const previous=merged.at(-1);if(previous&&match.start<previous.end)previous.end=Math.max(previous.end,match.end);else merged.push({...match});}
  const segments:Segment[]=[];let cursor=0;
  for(const {start,end} of merged) {
    if(start>cursor)segments.push({start:cursor,end:start,matched:false});
    segments.push({start,end,matched:true});cursor=end;
  }
  if(cursor<text.length)segments.push({start:cursor,end:text.length,matched:false});
  return segments;
}
const sourcePattern=/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*|\b(?:import|from|export|function|return|const|let|if|else|async|await|type|interface|null|true|false)\b)/g;
function tokens(text:string,source:boolean) {
  const values:Array<{start:number;end:number;className?:string}>=[];let cursor=0;
  if(source)for(const match of text.matchAll(sourcePattern)) {
    const start=match.index!,end=start+match[0].length;
    if(start>cursor)values.push({start:cursor,end:start});
    const value=match[0];values.push({start,end,className:/^["']/.test(value)?'source-token-string':value.startsWith('//')?'source-token-comment':'source-token-keyword'});cursor=end;
  }
  if(cursor<text.length)values.push({start:cursor,end:text.length});
  return values;
}
/** Match wrappers can span syntax tokens without losing their original colors. */
export function RepositorySearchText({text,query,source=false,observed}:{text:string;query:string;source?:boolean;observed?:RepositoryMatchRange}) {
  const parts=tokens(text,source);let tokenIndex=0;
  return <>{repositorySearchSegments(text,query,observed).map(segment=>{
    const children=[];
    while(tokenIndex<parts.length&&parts[tokenIndex].start<segment.end) {
      const token=parts[tokenIndex],start=Math.max(token.start,segment.start),end=Math.min(token.end,segment.end);
      if(end>start)children.push(<span key={start} className={token.className}>{text.slice(start,end)}</span>);
      if(token.end>segment.end)break;
      tokenIndex++;
    }
    return segment.matched?<mark key={segment.start} className="repository-search-hit">{children}</mark>:<Fragment key={segment.start}>{children}</Fragment>;
  })}</>;
}
