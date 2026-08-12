import { Modal } from 'antd';
import type { ModalFuncProps } from 'antd';

type ConfirmOptions = Pick<ModalFuncProps, 'title' | 'content' | 'okText' | 'cancelText' | 'okButtonProps'>;

type ModalApi = {
  confirm: (config: ModalFuncProps) => { destroy: () => void; update: (config: ModalFuncProps) => void };
};

let modalApi: ModalApi | null = null;

/** Register the App.useApp() modal API so confirmModal can consume ConfigProvider context. */
export function bindConfirmModal(api: ModalApi): void {
  modalApi = api;
}

/** Promise wrapper around Ant Design Modal.confirm (replaces window.confirm). */
export function confirmModal(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const api = modalApi || Modal;
    api.confirm({
      title: options.title ?? '确认',
      content: options.content,
      okText: options.okText ?? '确定',
      cancelText: options.cancelText ?? '取消',
      okButtonProps: options.okButtonProps,
      onOk: () => { finish(true); },
      onCancel: () => { finish(false); },
      afterClose: () => { finish(false); },
    });
  });
}
