/** Auxiliary title/handoff requests ask for a single JSON object. Gateway models
 * may wrap it in Markdown fences or surrounding prose because cross-protocol
 * conversion cannot enforce structured output. Extract a JSON object tolerantly
 * while still rejecting non-object or malformed content; callers keep their own
 * field, length and isolation checks. */
export function parseTitleJsonObject(text:string):Record<string,unknown>|undefined {
  const trimmed=text.trim();
  const candidates=[trimmed];
  for(const match of trimmed.matchAll(/```[^\n`]*\n?([\s\S]*?)```/g))candidates.push(match[1]!.trim());
  const start=trimmed.indexOf('{');
  if(start>=0){
    let depth=0,inString=false,escaped=false;
    for(let index=start;index<trimmed.length;index++){
      const character=trimmed[index]!;
      if(inString){
        if(escaped)escaped=false;
        else if(character==='\\')escaped=true;
        else if(character==='"')inString=false;
      }else if(character==='"')inString=true;
      else if(character==='{')depth++;
      else if(character==='}'&&--depth===0){candidates.push(trimmed.slice(start,index+1));break;}
    }
  }
  for(const candidate of candidates){
    try{
      const value:unknown=JSON.parse(candidate);
      if(value&&typeof value==='object'&&!Array.isArray(value))return value as Record<string,unknown>;
    }catch{/* try the next candidate */}
  }
  return undefined;
}
