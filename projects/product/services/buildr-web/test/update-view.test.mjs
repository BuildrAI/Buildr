import assert from 'node:assert/strict';
import test from 'node:test';
import { availableUpdateTargets, buildUpdateView, updateEntryVisible } from '../src/features/installation/lib/update-view.ts';
const track = (name,version,available=true) => ({track:name,version,available,installable:available});
const awareness = {mode:'npm',current:{version:'0.1.0-rc.47'},freshness:{status:'fresh'},tracks:{stable:track('stable','0.1.0'),candidate:track('candidate','0.1.0-rc.48')}};
const view = (overrides={}) => buildUpdateView({awareness,job:null,checking:false,checkError:'',selectedTrack:'',connection:'connected',...overrides});
const job = {id:'job',track:'stable',version:'0.1.0',status:'partial',stage:'launcher',runningVersion:'0.1.0',installedVersion:'0.1.0',steps:{install:'done',launcher:'failed',restart:'done',verify:'done'},launcherError:{message:'入口需修复'}};

test('候选版发现正式版，默认优先正式版，可保留候选版选择',()=>{
  assert.deepEqual(availableUpdateTargets(awareness).map(item=>item.track),['stable','candidate']);
  assert.equal(view().target.version,'0.1.0'); assert.equal(view().title,'正式版已发布');
  assert.equal(view({selectedTrack:'candidate'}).target.version,'0.1.0-rc.48');
});
test('无更新不显示顶部入口，手动检查开发模拟不产生常驻提示',()=>{
  const latest={...awareness,tracks:{stable:track('stable','0.1.0',false),candidate:track('candidate','0.1.0-rc.48',false)}};
  assert.equal(updateEntryVisible(latest,null,'connected'),false);
  assert.equal(updateEntryVisible({...awareness,mode:'development'},null,'connected'),false);
  assert.equal(updateEntryVisible(awareness,null,'connected'),true);
  assert.equal(updateEntryVisible(latest,job,'connected'),true);
});
test('启动器、重连和旧版连接分别呈现，保留已安装事实',()=>{
  assert.equal(view({job}).phase,'launcher-error');
  assert.equal(view({job:{...job,stage:'verify',steps:{...job.steps,verify:'failed'}}}).title,'目标安装尚未核实');
  assert.equal(view({job:{...job,runningVersion:'0.1.0-rc.47'}}).phase,'combined-error');
  assert.equal(view({job:{...job,runningVersion:'0.1.0-rc.47',steps:{...job.steps,launcher:'done'},stage:'verify'}}).phase,'verification-error');
  assert.equal(view({job,connection:'timed-out'}).phase,'combined-error');
  assert.equal(view({job,connection:'watching'}).phase,'restarting');
});
test('完成后主动检查读取发布事实，模拟完成不虚构安装版本',()=>{
  assert.equal(view({job:{...job,status:'completed'},showCompleted:false}).phase,'available');
  const simulated=view({awareness:{...awareness,mode:'development'},job:{...job,status:'completed',simulated:true,installedVersion:null,runningVersion:'0.1.0-rc.47'}});
  assert.equal(simulated.title,'模拟更新完成'); assert.equal(simulated.currentVersion,'0.1.0-rc.47'); assert.equal(simulated.installedVersion,null);
});
