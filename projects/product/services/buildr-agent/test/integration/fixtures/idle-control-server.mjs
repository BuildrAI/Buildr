import {createServer} from 'node:http';
let writes=0;
const server=createServer((req,res)=>{
 if(req.method==='POST')writes++;
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({writes}));
});
server.keepAliveTimeout=5000;server.keepAliveTimeoutBuffer=0;
server.listen(0,'127.0.0.1',()=>process.send(server.address().port));
process.on('message',()=>server.close(()=>process.exit()));
