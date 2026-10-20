import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleCodeDirectoryKeys} from '../src/features/code/code-expanded-directories.ts';
test('收起父目录时，其保留的展开后代不属于可见刷新范围',()=>{
  assert.deepEqual(visibleCodeDirectoryKeys(['repo::','repo::src/deep','other::src','repo::lib','other::']),['repo::','other::','other::src','repo::lib']);
  assert.deepEqual(visibleCodeDirectoryKeys(['repo::src','repo::src/deep']),[]);
  assert.deepEqual(visibleCodeDirectoryKeys(['repo::src/deep','repo::src','repo::']),['repo::','repo::src','repo::src/deep']);
});
