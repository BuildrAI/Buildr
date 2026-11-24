import test from 'node:test';import assert from 'node:assert/strict';import {contextWindowText,parseContextWindow,previewModelContext} from '../../src/features/agent-conversations/context-window.ts';
test('上下文按千截断显示，支持数字及K输入',()=>{assert.equal(contextWindowText(200999),'200K');assert.equal(contextWindowText(1048576),'1048K');assert.equal(contextWindowText(999),'999');assert.equal(parseContextWindow('200K'),200000);assert.equal(parseContextWindow('200000'),200000);assert.equal(parseContextWindow('1.5k'),1500);assert.equal(parseContextWindow(''),null);for(const input of ['bad','0','-1','1.5','Infinity'])assert.equal(parseContextWindow(input),undefined);});

test('窗口编辑保留未知上限、独立默认值及执行生效值',()=>{
 const model={defaultContextWindow:500000,contextWindow:500000,reportedContextWindow:null};
 assert.deepEqual(previewModelContext(model,800000),{contextWindowOverride:800000,contextWindow:800000});
 const clamped={...model,contextWindow:600000,reportedContextWindow:600000,contextWindowOverride:800000};
 assert.deepEqual(previewModelContext(clamped,750000),{contextWindowOverride:750000,contextWindow:600000});
 assert.deepEqual(previewModelContext(clamped,null),{contextWindowOverride:undefined,contextWindow:500000});
 assert.deepEqual(previewModelContext(clamped,undefined),{},'启停不能重算窗口');
 assert.equal(previewModelContext({contextWindow:400000},800000).contextWindow,400000,'旧来源仍兼容');
});
