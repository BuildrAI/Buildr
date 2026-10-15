import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readDshPageId, readDshTaskPage, startDshPageObservation } from '../src/app/dsh-page-observation.ts';

const pageId = randomUUID(), workspaceId = randomUUID(), origin = 'http://127.0.0.1:38123';
const task = `${origin}/workspaces/${workspaceId}/tasks/first-task`;

test('page nonce comes only from one initial query value and receipts normalize the actual current Task location', () => {
  assert.equal(readDshPageId(task + '?buildrDshPage=' + pageId), pageId);
  for (const href of [task, task + '?buildrDshPage=bad', task + `?buildrDshPage=${pageId}&buildrDshPage=${pageId}`]) assert.equal(readDshPageId(href), null);
  assert.equal(readDshTaskPage(task + '?buildrDshPage=' + pageId + '#draft', origin), task);
  for (const href of [task + '/document', task.replace('/tasks/first-task', '/overview'), task.replace(origin, 'http://127.0.0.1:38124'), task.replace('first-task', 'trailing-'), task.replace('first-task', '%66irst-task')]) assert.equal(readDshTaskPage(href, origin), null);
});

test('watch reads live location after navigation, retains the document nonce, and aborts on pagehide', async () => {
  const events = new EventTarget(), location = { href: task + '?buildrDshPage=' + pageId, origin };
  const browser = { location, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
  const watchers = [], acknowledgements = [];
  let onWatch, onAck;
  const waitWatch = () => new Promise(resolve => { onWatch = resolve; });
  const waitAck = () => new Promise(resolve => { onAck = resolve; });
  const api = (resource, init) => {
    if (resource.includes('/watch?')) {
      assert.equal(resource, '/api/v1/app/dsh/pages/watch?pageId=' + pageId);
      return new Promise((resolve, reject) => {
        watchers.push({ resolve, signal: init.signal }); onWatch?.();
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }
    assert.equal(resource, '/api/v1/app/dsh/pages/ack'); assert.equal(init.method, 'POST');
    acknowledgements.push(JSON.parse(init.body)); onAck?.(); return Promise.resolve({ accepted: true });
  };
  let watched = waitWatch(); const stop = startDshPageObservation(browser, api); await watched;
  location.href = task.replace('first-task', 'second-task');
  const firstChallenge = randomUUID(); let acknowledged = waitAck(); watched = waitWatch();
  watchers[0].resolve({ challengeId: firstChallenge }); await acknowledged; await watched;
  assert.deepEqual(acknowledgements[0], { pageId, challengeId: firstChallenge, taskUrl: task.replace('first-task', 'second-task') });
  location.href = `${origin}/workspaces/${workspaceId}/overview`;
  const secondChallenge = randomUUID(); acknowledged = waitAck(); watched = waitWatch();
  watchers[1].resolve({ challengeId: secondChallenge }); await acknowledged; await watched;
  assert.deepEqual(acknowledgements[1], { pageId, challengeId: secondChallenge, taskUrl: null });
  events.dispatchEvent(new Event('pagehide')); assert.equal(watchers[2].signal.aborted, true);
  stop();
  let touched = false; startDshPageObservation({ ...browser, location: { href: task, origin } }, async () => { touched = true; });
  assert.equal(touched, false, 'Normal Buildr pages never start this observer.');
});
