import assert from 'node:assert/strict';
import test from 'node:test';
import { knowledgeDiagramPreviewHeight } from '../src/features/knowledge/knowledge-diagram-layout.ts';

test('不同图形按当前容器宽度完整呈现，消除固定比例的留白和裁切', () => {
  // At this width the old 1.6 ratio used 650px for every diagram.
  assert.equal(knowledgeDiagramPreviewHeight(1040, { width: 1550, height: 760 }), 519);
  assert.equal(knowledgeDiagramPreviewHeight(1040, { width: 1080, height: 688 }), 669);
  // The same artifact follows the narrower secondary reading pane.
  assert.equal(knowledgeDiagramPreviewHeight(524.5, { width: 1550, height: 760 }), 266);
  assert.equal(knowledgeDiagramPreviewHeight(320, { width: 1550, height: 760 }), 166);
});

test('旧响应、未知尺寸及尚未获得宽度时保留原有回退', () => {
  assert.equal(knowledgeDiagramPreviewHeight(1040), null);
  assert.equal(knowledgeDiagramPreviewHeight(1040, null), null);
  assert.equal(knowledgeDiagramPreviewHeight(0, { width: 1550, height: 760 }), null);
  for (const size of [{ width: 0, height: 760 }, { width: 1550, height: -1 }, { width: Infinity, height: 760 }]) {
    assert.equal(knowledgeDiagramPreviewHeight(1040, size), null);
  }
});
