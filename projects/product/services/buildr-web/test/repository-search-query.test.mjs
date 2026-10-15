import assert from 'node:assert/strict';
import test from 'node:test';
import { repositorySearchQuery } from '../src/features/workspace/components/repository-search-query.ts';

test('repository UI search starts at two non-whitespace Unicode characters', () => {
  for (const query of ['', ' ', 'a', ' 好 ', '😀', 'a \t']) assert.equal(repositorySearchQuery(query), '', query);
  for (const query of ['ab', '你好', '😀好', '😀😀']) assert.equal(repositorySearchQuery(query), query, query);
});

test('repository UI search trims outer whitespace and preserves literal inner spaces', () => {
  assert.equal(repositorySearchQuery(' \t alpha beta \n'), 'alpha beta');
  assert.equal(repositorySearchQuery(' a  b '), 'a  b');
});
