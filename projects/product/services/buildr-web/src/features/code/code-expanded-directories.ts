/** Ant Tree retains descendant expansion keys when an ancestor is collapsed. */
export function visibleCodeDirectoryKeys(keys:readonly string[]):string[] {
  const expanded=new Set(keys);
  return keys.filter(key=>{
    const separator=key.indexOf('::');if(separator<0)return false;
    const root=key.slice(0,separator+2),path=key.slice(separator+2);
    if(!path)return true;
    const parts=path.split('/');
    return expanded.has(root)&&parts.every((_,index)=>index===0||expanded.has(root+parts.slice(0,index).join('/')));
  }).sort((a,b)=>depth(a)-depth(b));
}
function depth(key:string){const path=key.slice(key.indexOf('::')+2);return path?path.split('/').length:0;}
