import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceControlRowDensity} from '../src/features/code/components/source-control-row-density.ts';
const measure={fixed:40,nameWidth:100,shortcutWidth:30,naturalBranchWidth:120,copyGap:8};
for(const [width,layout,branchWidth] of [[298,'full',120],[297,'branch-clipped',119],[226,'branch-clipped',48],[225,'name-status',24],[170,'name-status',24],[169,'name',24]])test('progressive row fitting at width '+width,()=>assert.deepEqual(sourceControlRowDensity({...measure,width}),{layout,branchWidth}));
test('a short branch fits completely and an absent branch consumes no gap',()=>{
 assert.deepEqual(sourceControlRowDensity({...measure,width:202,naturalBranchWidth:24}),{layout:'full',branchWidth:24});
 assert.deepEqual(sourceControlRowDensity({...measure,width:170,naturalBranchWidth:0}),{layout:'full',branchWidth:24});
 assert.equal(sourceControlRowDensity({...measure,width:169,naturalBranchWidth:0}).layout,'name');
});
test('fractional natural measurements cannot claim a fit by rounding down required content',()=>{
 assert.equal(sourceControlRowDensity({...measure,width:170,nameWidth:100.1,naturalBranchWidth:0}).layout,'name');
 assert.equal(sourceControlRowDensity({...measure,width:225.9}).layout,'name-status');
});

test('all intermediate widths preserve progressive stages without unbounded allocation',()=>{
 const order=['name','name-status','branch-clipped','full'];let previous=-1;
 for(let width=100;width<=400;width++){
  const next=sourceControlRowDensity({...measure,width});const stage=order.indexOf(next.layout);assert.ok(stage>=previous);previous=stage;
  if(stage>=2)assert.ok(next.branchWidth>=48&&next.branchWidth<=measure.naturalBranchWidth);
 }
});
