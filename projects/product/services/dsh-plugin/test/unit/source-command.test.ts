import assert from 'node:assert/strict';
import test from 'node:test';
import { simpleCommandWords, describeBoundSourceCommand } from '../../plugin/src/source-command.ts';
test('one literal argv accepts quoted exact paths without executing or expanding shell text',()=>{
 assert.deepEqual(simpleCommandWords('"/bound product/buildr" task inspect demo --json'),['/bound product/buildr','task','inspect','demo','--json']);
 assert.deepEqual(simpleCommandWords("/node '/product/buildr.mjs' --help"),['/node','/product/buildr.mjs','--help']);
 for(const command of ['buildr && git status','buildr;git status','buildr $USER','buildr `id`','buildr > out','VAR=x buildr | cat','buildr *','buildr task\ninspect','buildr "unterminated','buildr\\ task']) assert.equal(simpleCommandWords(command),undefined,command);
});
test('operation names are independent of JSON output and never include target or user parameters',()=>{
 for(const suffix of [[],['--json']]) assert.deepEqual(describeBoundSourceCommand(['task','materials','inspect','demo',...suffix]),{operation:'task materials inspect'});
 assert.deepEqual(describeBoundSourceCommand(['task','review','record','demo','--finding','PRIVATE BODY']),{operation:'task review record'});
 assert.deepEqual(describeBoundSourceCommand(['agent-assets','source','inspect','--input','PRIVATE BODY']),{operation:'agent-assets source inspect'});
 assert.deepEqual(describeBoundSourceCommand(['future-operation','PRIVATE BODY']),{operation:'future-operation'});
 assert.deepEqual(describeBoundSourceCommand(['--help']),{operation:'help'});
 assert.deepEqual(describeBoundSourceCommand([]),{operation:'Buildr CLI'});
 assert.equal(JSON.stringify(describeBoundSourceCommand(['task','inspect','PRIVATE BODY'])).includes('PRIVATE'),false);
});
