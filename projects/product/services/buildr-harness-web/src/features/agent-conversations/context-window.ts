export const contextWindowText=(value:number|undefined)=>value===undefined?'':value>=1000?`${Math.floor(value/1000)}K`:String(value);
export function parseContextWindow(text:string):number|null|undefined {
 const trimmed=text.trim();if(!trimmed)return null;
 if(!/^\d+(?:\.\d+)?[kK]?$/.test(trimmed))return undefined;
 const result=Number(trimmed.replace(/[kK]$/,''))*(/[kK]$/.test(trimmed)?1000:1);
 return Number.isSafeInteger(result)&&result>0?result:undefined;
}
