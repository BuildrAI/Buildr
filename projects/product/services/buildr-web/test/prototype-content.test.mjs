import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/features/task/components/prototype-content.ts',import.meta.url),'utf8');
const {prototypeEntries,validPrototypeMessage}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{module:ts.ModuleKind.ESNext})).toString('base64'));
const file={id:'a',title:'旧页面',metadata:{version:1,pages:[{id:'home',title:'首页',notes:[{id:'n',title:'位置',text:'说明',position:'main'}],states:[{id:'empty',title:'空白',notes:[]}]}]}};
test('目录用文件与局部标识联合定位；旧文件兼容',()=>{const entries=prototypeEntries({prototypes:[file,{...file,id:'b'}]});assert.deepEqual(entries.map(e=>e.key),['a:home','b:home']);assert.equal(prototypeEntries({prototypes:[{id:'old',title:'旧页面'}]})[0].scene.title,'旧页面');});
test('消息只接受已声明页面状态位置和当前装载标识',()=>{const entries=prototypeEntries({prototypes:[file]});const message={type:'buildr:prototype:state',nonce:'current',page:'home',state:'empty'};assert.ok(validPrototypeMessage(message,'current',entries));for(const patch of [{nonce:'old'},{page:'elsewhere'},{state:'missing'},{position:'unlisted'},{type:'navigate',url:'https://example.com'},{state:undefined}])assert.equal(validPrototypeMessage({...message,...patch},'current',entries),null);});

test('悬停消息独立于页面选择，允许清除但拒绝未声明位置和缺失字段',()=>{
  const entries=prototypeEntries({prototypes:[file]});
  const message={type:'buildr:prototype:highlight',nonce:'current',page:'home',state:'',position:'main'};
  assert.equal(validPrototypeMessage(message,'current',entries).kind,'highlight');
  assert.equal(validPrototypeMessage({...message,position:null},'current',entries).position,undefined);
  for(const patch of [{position:undefined},{position:'missing'},{position:42},{nonce:'old'},{state:undefined},{page:'other'}])assert.equal(validPrototypeMessage({...message,...patch},'current',entries),null);
  assert.equal(validPrototypeMessage({...message,type:'buildr:prototype:state'},'current',entries).kind,'selection');
});

test('呈现确认只接受当前装载及声明的画面，不充当页面选择',()=>{
  const entries=prototypeEntries({prototypes:[file]});
  const message={type:'buildr:prototype:rendered',nonce:'current',page:'home',state:''};
  assert.equal(validPrototypeMessage(message,'current',entries).kind,'rendered');
  for(const patch of [{nonce:'old'},{page:'missing'},{state:'missing'}])assert.equal(validPrototypeMessage({...message,...patch},'current',entries),null);
});
