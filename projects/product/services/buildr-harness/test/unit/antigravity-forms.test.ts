import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentServiceError } from '../../src/domain/agent-state.ts';
import { antigravityForm } from '../../src/executors/antigravity/forms.ts';

function assertInvalidQuestionAnswer(fn: () => unknown): void {
  assert.throws(
    fn,
    error => error instanceof AgentServiceError && error.code === 'agent_question_answer_invalid',
  );
}

test('merges native Antigravity single-select q1 + q1_other into one allowOther question and hides default English title', () => {
  const form = antigravityForm(
    {
      mode: 'form',
      message: 'The agent has a question.',
      requestedSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          q1: {
            type: 'string',
            title: '当前环境的 lark-cli 尚未配置，请选择获取方式：',
            oneOf: [
              { const: '1', title: '(Recommended) 在当前环境扫码配置' },
              { const: '2', title: '直接发截图到对话中' },
            ],
          },
          q1_other: {
            type: 'string',
            title: 'Other',
            description: 'Optional free-form answer to: 当前环境的 lark-cli 尚未配置，请选择获取方式：',
          },
        },
        required: [],
      },
    },
    'ask-1',
  );

  assert.equal(form.request.title, '需要你的回复');
  assert.deepEqual(form.request.questions, [
    {
      id: 'q1',
      label: '当前环境的 lark-cli 尚未配置，请选择获取方式：',
      options: [
        { id: '1', label: '(Recommended) 在当前环境扫码配置' },
        { id: '2', label: '直接发截图到对话中' },
      ],
      multiple: false,
      allowOther: true,
    },
  ]);

  assert.deepEqual(form.answer({ q1: '1' }), { action: 'accept', content: { q1: '1' } });
  assert.deepEqual(form.answer({ q1: ['2'] }), { action: 'accept', content: { q1: '2' } });
  assert.deepEqual(form.answer({ q1: '直接发截图' }), {
    action: 'accept',
    content: { q1_other: '直接发截图' },
  });

  for (const invalid of [{}, { q1: '' }, { q1: '   ' }, { q1: ['1', '2'] }, { q1: '1', extra: 'x' }, null, '1']) {
    assertInvalidQuestionAnswer(() => form.answer(invalid));
  }
});

test('sorts multi-question native forms numerically up to 12 questions and splits multi-select, free-form, and other answers', () => {
  const properties: Record<string, unknown> = {
    q1: {
      type: 'string',
      title: '第 1 题',
      oneOf: [{ const: 'a', title: '选项 A' }],
    },
    q10: {
      type: 'string',
      title: '第 10 题',
      oneOf: [{ const: 'z', title: '选项 Z' }],
    },
    q10_other: {
      type: 'string',
      title: 'Other',
      description: 'Optional free-form answer to: 第 10 题',
    },
    q1_other: {
      type: 'string',
      title: 'Other',
      description: 'Optional free-form answer to: 第 1 题',
    },
    q2: {
      type: 'array',
      title: '第 2 题（多选）',
      items: {
        type: 'string',
        oneOf: [
          { const: 'unit', title: '单元测试' },
          { const: 'e2e', title: '端到端测试' },
        ],
      },
    },
    q2_other: {
      type: 'string',
      title: 'Other',
      description: 'Optional free-form answer to: 第 2 题（多选）',
    },
    q3_other: {
      type: 'string',
      title: '第 3 题（纯自由输入）',
    },
  };
  for (let i = 4; i <= 9; i += 1) {
    properties[`q${i}`] = {
      type: 'string',
      title: `第 ${i} 题`,
      oneOf: [{ const: `opt${i}`, title: `选项 ${i}` }],
    };
    properties[`q${i}_other`] = {
      type: 'string',
      title: 'Other',
      description: `Optional free-form answer to: 第 ${i} 题`,
    };
  }

  const form = antigravityForm(
    {
      mode: 'form',
      message: 'The agent has 10 questions.',
      requestedSchema: {
        type: 'object',
        additionalProperties: false,
        properties,
      },
    },
    'ask-10',
  );

  assert.equal(form.request.title, '需要你的回复');
  assert.deepEqual(
    form.request.questions?.map(question => question.id),
    ['q1', 'q2', 'q3_other', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'],
  );
  assert.equal(form.request.questions?.[1]?.multiple, true);
  assert.equal(form.request.questions?.[1]?.allowOther, true);
  assert.equal(form.request.questions?.[2]?.options, undefined);
  assert.equal(form.request.questions?.[2]?.allowOther, true);

  const baseAnswers = {
    q1: 'a',
    q3_other: '补充路径',
    q4: 'opt4',
    q5: 'opt5',
    q6: 'opt6',
    q7: 'opt7',
    q8: 'opt8',
    q9: 'opt9',
    q10: '自定义第 10 题',
  };

  assert.deepEqual(form.answer({ ...baseAnswers, q2: ['unit'] }), {
    action: 'accept',
    content: {
      q1: 'a',
      q2: ['unit'],
      q3_other: '补充路径',
      q4: 'opt4',
      q5: 'opt5',
      q6: 'opt6',
      q7: 'opt7',
      q8: 'opt8',
      q9: 'opt9',
      q10_other: '自定义第 10 题',
    },
  });

  assert.deepEqual(form.answer({ ...baseAnswers, q2: ['手工核对'] }), {
    action: 'accept',
    content: {
      q1: 'a',
      q2_other: '手工核对',
      q3_other: '补充路径',
      q4: 'opt4',
      q5: 'opt5',
      q6: 'opt6',
      q7: 'opt7',
      q8: 'opt8',
      q9: 'opt9',
      q10_other: '自定义第 10 题',
    },
  });

  assert.deepEqual(form.answer({ ...baseAnswers, q2: ['unit', '补充手工核对'] }), {
    action: 'accept',
    content: {
      q1: 'a',
      q2: ['unit'],
      q2_other: '补充手工核对',
      q3_other: '补充路径',
      q4: 'opt4',
      q5: 'opt5',
      q6: 'opt6',
      q7: 'opt7',
      q8: 'opt8',
      q9: 'opt9',
      q10_other: '自定义第 10 题',
    },
  });

  for (const badMulti of ['unit', [], ['unit', '   ']]) {
    assertInvalidQuestionAnswer(() => form.answer({ ...baseAnswers, q2: badMulti }));
  }
});

test('preserves strict validation for generic ACP forms and rejects unsupported schemas', () => {
  const generic = antigravityForm(
    {
      message: '请选择目标环境与验证策略',
      requestedSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          env: { type: 'string', oneOf: [{ const: 'staging', title: '预发' }, { const: 'prod', title: '生产' }] },
          checks: { type: 'array', items: { type: 'string', anyOf: [{ const: 'unit' }, { const: 'e2e' }] }, minItems: 1 },
          count: { type: 'integer', minimum: 1 },
          confirm: { type: 'boolean' },
        },
        required: ['env', 'checks', 'count', 'confirm'],
      },
    },
    'generic-1',
  );
  assert.equal(generic.request.title, '请选择目标环境与验证策略');
  assert.equal(generic.request.questions?.[0]?.allowOther, false);
  assert.deepEqual(generic.answer({ env: 'staging', checks: ['unit'], count: '2', confirm: 'true' }), {
    action: 'accept',
    content: { env: 'staging', checks: ['unit'], count: 2, confirm: true },
  });
  assertInvalidQuestionAnswer(() => generic.answer({ env: 'other', checks: ['unit'], count: '2', confirm: 'true' }));
  assertInvalidQuestionAnswer(() => generic.answer({ env: 'staging', checks: ['unit'], count: '0', confirm: 'true' }));

  const askUser = antigravityForm(
    {
      message: 'Answer Questions',
      _meta: { antigravity: { toolName: 'AskUserQuestion' } },
      requestedSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          choice: { type: 'string', title: '环境', oneOf: [{ const: 'dev', title: '开发' }] },
        },
        required: ['choice'],
      },
    },
    'ask-user',
  );
  assert.equal(askUser.request.title, '需要你的回复');
  assert.equal(askUser.request.questions?.[0]?.allowOther, true);
  assert.deepEqual(askUser.answer({ choice: '预发' }), { action: 'accept', content: { choice: '预发' } });

  assert.throws(() => antigravityForm({ mode: 'url' }, 'url'), /unsupported/);
  assert.throws(() => antigravityForm({ requestedSchema: { type: 'object', properties: { email: { type: 'string', format: 'email' } } } }, 'fmt'), /unsupported/);
  assert.throws(() => antigravityForm({ requestedSchema: { type: 'object', properties: { nested: { type: 'object' } } } }, 'obj'), /unsupported/);
  const tooManyGeneric = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`f${i}`, { type: 'string' }]));
  assert.throws(() => antigravityForm({ requestedSchema: { type: 'object', properties: tooManyGeneric } }, 'many'), /unsupported/);
});
