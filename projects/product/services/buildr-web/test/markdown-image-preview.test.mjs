import assert from 'node:assert/strict';
import test from 'node:test';
import { bindMarkdownImagePreviews } from '../src/lib/markdownImagePreviews.ts';

function image(attributes = {}) {
  const listeners = new Map(), values = { ...attributes }, classes = new Set();
  return {
    values, classes, listeners,
    classList: { add: name => classes.add(name) },
    setAttribute: (name, value) => { values[name] = value; },
    getAttribute: name => (name in values ? values[name] : null),
    addEventListener: (type, listener) => { listeners.set(type, listener); },
    fire(type, event = {}) {
      event.prevented = false; event.stopped = false;
      listeners.get(type)?.({ preventDefault() { event.prevented = true; }, stopPropagation() { event.stopped = true; }, ...event });
      return event;
    },
  };
}

const rootOf = images => ({ querySelectorAll: selector => { assert.equal(selector, 'img'); return images; } });
const source = '/api/v1/conversation-image?path=%2Ftmp%2Fshot.png';

test('内联图片获得放大操作语义，并携带原始引用', () => {
  const target = image({ src: source, alt: '验收截图', 'data-markdown-href': '.buildr/local/shot.png' });
  const received = [];
  bindMarkdownImagePreviews(rootOf([target]), () => value => received.push(value));
  assert.equal(target.values.role, 'button');
  assert.equal(target.values.tabindex, '0');
  assert.equal(target.values.title, '点击查看大图');
  assert.equal(target.values['aria-label'], '查看大图：验收截图');
  assert.equal(target.classes.has('markdown-zoomable-image'), true);
  const event = target.fire('click');
  assert.deepEqual(received, [{ src: source, alt: '验收截图', reference: '.buildr/local/shot.png' }]);
  assert.equal(event.prevented, true, '图片位于链接内时不让外层导航同时触发');
  assert.equal(event.stopped, true);
});

test('键盘可触发放大，其他按键不触发，缺少原始引用时回退到已解析来源', () => {
  const target = image({ src: source, alt: '' });
  const received = [];
  bindMarkdownImagePreviews(rootOf([target]), () => value => received.push(value));
  target.fire('keydown', { key: 'a' });
  assert.equal(received.length, 0);
  target.fire('keydown', { key: 'Enter' });
  target.fire('keydown', { key: ' ' });
  assert.equal(received.length, 2);
  assert.equal(received[0].reference, source);
  assert.equal(target.values['aria-label'], '查看大图：图片');
});

test('触发时读取最新处理函数', () => {
  const target = image({ src: source, alt: '图' });
  const first = [], second = [];
  let handler = value => first.push(value);
  bindMarkdownImagePreviews(rootOf([target]), () => handler);
  handler = value => second.push(value);
  target.fire('click');
  assert.equal(first.length, 0);
  assert.equal(second.length, 1);
});
