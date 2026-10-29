import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {WebSocketServer} from 'ws';
import {createDshTransport} from '../../../build/executors/dsh/client.js';

async function fixture() {
  const peers=new Set<string>(),accepted:string[]=[],sockets=new WebSocketServer({noServer:true});let exchanges=0,rejected=0,deny=false;
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url!,'http://local');
    if(url.pathname==='/connect'){
      assert.equal(url.searchParams.get('interactions'),'answer');
      if(url.searchParams.get('token')!=='private-launch-token'){res.writeHead(401).end();return;}
      const peer=String(++exchanges);peers.add(peer);res.writeHead(302,{'Set-Cookie':`operator=${peer}; Path=/; HttpOnly`,'Location':'/api/remote.mux'}).end();return;
    }
    const peer=req.headers.cookie?.split('=')[1];
    if(deny||!peer||!peers.has(peer)){rejected++;res.writeHead(401).end();return;}
    let body='';for await(const chunk of req)body+=chunk;
    accepted.push(body);res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true}));
  });
  server.on('upgrade',(req,socket,head)=>{
    const peer=req.headers.cookie?.split('=')[1];
    if(!peer||!peers.has(peer)){socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');return;}
    sockets.handleUpgrade(req,socket,head,ws=>{ws.once('close',()=>peers.delete(peer));sockets.emit('connection',ws,req);});
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');
  const origin=`http://127.0.0.1:${address.port}`;
  return {origin,peers,accepted,get exchanges(){return exchanges;},get rejected(){return rejected;},deny(){deny=true;},async close(){for(const socket of sockets.clients)socket.terminate();sockets.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
async function closedPeer(socket:any,peers:Set<string>,peer:string){
  const closed=once(socket,'close');socket.terminate();await closed;
  const deadline=Date.now()+2000;while(peers.has(peer)){assert.ok(Date.now()<deadline,'native operator was not released');await new Promise(resolve=>setTimeout(resolve,5));}
}

test('DSH replaces a socket-owned credential after a physical disconnect and shares HTTP recovery without replaying accepted requests',async()=>{
  const f=await fixture();let reconnects=0;
  try{
    const {transport}=await createDshTransport(f.origin+'/?token=private-launch-token',undefined,()=>{reconnects++;});
    const first=transport.createWebSocket('/api/remote.mux');await once(first,'open');assert.equal(f.exchanges,1);
    const firstResponse=await transport.fetch(f.origin+'/rpc',{method:'POST',body:'original'});assert.equal(firstResponse.status,200);await firstResponse.body?.cancel();
    await closedPeer(first,f.peers,'1');
    const second=transport.createWebSocket('/api/remote.mux');await once(second,'open');assert.equal(f.exchanges,2);
    await closedPeer(second,f.peers,'2');
    const results=await Promise.all(['a','b','c','d'].map(body=>transport.fetch(f.origin+'/rpc',{method:'POST',body})));
    assert.ok(results.every(result=>result.status===200));await Promise.all(results.map(result=>result.body?.cancel()));
    assert.equal(f.exchanges,3);assert.equal(reconnects,1);assert.equal(f.rejected,4);
    assert.deepEqual([...f.accepted].sort(),['a','b','c','d','original']);
    const third=transport.createWebSocket('/api/remote.mux');await once(third,'open');assert.equal(f.exchanges,3,'HTTP and the replacement carrier share one operator');
    await assert.rejects(transport.fetch('http://127.0.0.1:1/rpc',{}),/dsh_transport_origin_invalid/);
    assert.throws(()=>transport.createWebSocket('ws://127.0.0.1:1/api/remote.mux'),/dsh_transport_origin_invalid/);
    f.deny();const rejected=f.rejected;
    const denied=await transport.fetch(f.origin+'/rpc',{method:'POST',body:'never-dispatched'});assert.equal(denied.status,401);await denied.body?.cancel();
    assert.equal(f.rejected,rejected+2,'an authentication rejection is retried at most once');assert.equal(f.exchanges,4);assert.ok(!f.accepted.includes('never-dispatched'));
  }finally{await f.close();}
});

test('DSH authentication failure is bounded and never exposes the launch credential',async()=>{
  const f=await fixture();try{
    await assert.rejects(createDshTransport(f.origin+'/?token=other-secret'),error=>error instanceof Error&&error.message==='dsh_handshake_failed');
    assert.equal(f.exchanges,0);
    await assert.rejects(createDshTransport('https://example.com:443/?token=secret'),/dsh_host_origin_invalid/);
  }finally{await f.close();}
});
