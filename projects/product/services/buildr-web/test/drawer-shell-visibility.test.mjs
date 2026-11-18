import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const ViewActive = React.createContext(true);
const EnvironmentVisible = React.createContext(true);
globalThis.__drawerVisibility = {ViewActive, EnvironmentVisible, props: null};
const facade = source => ({url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true});
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/components/DrawerShell.tsx')) {
      if (specifier === 'antd') return facade('export const Button="button";export const Drawer=props=>{globalThis.__drawerVisibility.props=props;return null;};');
      if (specifier === '@ant-design/icons') return facade('export const CloseOutlined=()=>null;');
      if (specifier.endsWith('/pageTabs')) return facade('export const WorkspaceViewActiveContext=globalThis.__drawerVisibility.ViewActive;');
      if (specifier.endsWith('/work-environment-visibility')) return facade('export const WorkEnvironmentVisibleContext=globalThis.__drawerVisibility.EnvironmentVisible;');
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/components/DrawerShell.tsx')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: {jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
      }).outputText,
    };
    return next(url, context);
  },
});
const {DrawerShell} = await import('../src/components/DrawerShell.tsx');
const render = ({view = true, environment = true, ...props} = {}) => {
  renderToStaticMarkup(React.createElement(ViewActive.Provider, {value: view},
    React.createElement(EnvironmentVisible.Provider, {value: environment},
      React.createElement(DrawerShell, {title: '编辑任务', open: true, onClose() {}, ...props}, '草稿内容'))));
  return globalThis.__drawerVisibility.props;
};

test('cached page or hidden environment conceals portal surfaces without destroying an open draft', () => {
  for (const scope of [{view: false}, {environment: false}, {active: false}]) {
    let observed = 0;
    const props = render({...scope, afterOpenChange: () => observed++});
    assert.equal(props.open, false);
    assert.equal(props.destroyOnClose, false);
    props.afterOpenChange(false);
    assert.equal(observed, 0, 'presentation hiding does not report a domain close');
  }
});
test('visible surfaces restore the open draft; an explicit close still cleans up and notifies', () => {
  assert.equal(render().open, true);
  let observed = 0;
  const props = render({environment: false, open: false, afterOpenChange: () => observed++});
  assert.equal(props.open, false);
  assert.equal(props.destroyOnClose, true);
  props.afterOpenChange(false);
  assert.equal(observed, 1);
});
