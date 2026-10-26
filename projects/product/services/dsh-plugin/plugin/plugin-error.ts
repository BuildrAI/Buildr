export class DesktopFault extends Error {
  readonly code:string;
  constructor(code:string,message:string){super(message);this.code='agent_dsh_'+code;}
}
export function desktopFault(code:string,message:string){return new DesktopFault(code,message);}
