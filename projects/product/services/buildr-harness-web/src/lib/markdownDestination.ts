/** Angle brackets delimit a Markdown destination; they are not filename bytes. */
export function markdownDestination(value:string):string|null {
  const raw=value.trim();
  if(!raw||/[\0\r\n]/.test(raw))return null;
  if(raw.startsWith('<')&&raw.endsWith('>')){
    const destination=raw.slice(1,-1);
    return destination&&!/[<>]/.test(destination)?destination:null;
  }
  return /[<>]/.test(raw)?null:raw;
}
