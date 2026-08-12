import { App } from 'antd';
import { bindConfirmModal } from './confirm';

/** Mount once under Antd App so confirmModal uses contextual modal API. */
export function ConfirmModalHost() {
  const { modal } = App.useApp();
  bindConfirmModal(modal);
  return null;
}
