import { useRef, type ComponentProps, type ReactNode } from 'react';
import { Button, Input } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ConversationImageInput, type DraftImage } from './ConversationImageInput';
import { conversationAttachmentAccept } from './conversation-images';

type Props = {
  images: DraftImage[];
  materialDisabled: boolean;
  addDisabled: boolean;
  uploading?: boolean;
  input: ComponentProps<typeof Input.TextArea>;
  access: ReactNode;
  execution: ReactNode;
  onAdd(files: File[]): Promise<void>;
  onRemove(id: string): void;
  onBlocked(): void;
};

/** Shared composition surface; its caller owns upload, submission and execution effects. */
export function ConversationComposer({ images, materialDisabled, addDisabled, uploading, input, access, execution, onAdd, onRemove, onBlocked }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  return <ConversationImageInput images={images} disabled={materialDisabled} onAdd={onAdd} onRemove={onRemove} onBlocked={onBlocked}>
    <Input.TextArea {...input} />
    <div className="ac-compose-toolbar">
      <div className="ac-compose-access">
        <input ref={fileInput} type="file" accept={conversationAttachmentAccept} multiple hidden onChange={event => {
          const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void onAdd(files);
        }} />
        <Button type="text" icon={<PlusOutlined />} aria-label="添加图片或视频" title="添加图片或视频，也可粘贴或拖入；视频最多32 MiB" loading={uploading} disabled={addDisabled} onClick={() => fileInput.current?.click()} />
        {access}
      </div>
      <div className="ac-compose-execution">{execution}</div>
    </div>
  </ConversationImageInput>;
}
