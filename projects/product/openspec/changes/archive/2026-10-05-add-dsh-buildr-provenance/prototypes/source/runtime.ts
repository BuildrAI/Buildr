import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as JSX from 'react/jsx-runtime';
import * as primitives from './vendor/primitives.js';
let prototype: any;
export async function initializeTrajectory() {
  const modules:Record<string,unknown>={'react':React,'react-dom':ReactDOM,'react/jsx-runtime':JSX,'@deepseek-ai/dsh-client-store':{},'@deepseek-ai/dsh-client-ui-primitives':primitives};
  (window as any).__ModuleLoader__={load(entry:any){prototype=entry.factory((name:string)=>{if(!(name in modules))throw Error('Unexpected isolated dependency: '+name);return modules[name];}).prototype;}};
  await import('./vendor/trajectory.js');
  return prototype;
}
