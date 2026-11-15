#!/usr/bin/env node
try{
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major<24||major===24&&minor<15)throw Object.assign(new Error('Buildr Harness requires Node >=24.15.0; it will not download or select another Node.'),{code:'harness_host_node_unsupported'});
  const {main}=await import('../build/cli.js');
  await main(process.argv.slice(2));
}catch(error){console.error(JSON.stringify({status:'failed',code:typeof error?.code==='string'?error.code:'harness_failed',message:error instanceof Error?error.message:'Harness 未完成请求。'}));process.exitCode=1;}
