import { useRef, type ComponentProps, type ReactNode } from 'react';
import { Button, Input } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ConversationImageInput, type DraftImage } from './ConversationImageInput.tsx';
import { conversationAttachmentAccept } from './conversation-images.ts';

type Props = {
  images: DraftImage[];
  attachmentAccept?: string;
  addLabel?: string;
  showAdd?: boolean;
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
export function ConversationComposer({ images, attachmentAccept=conversationAttachmentAccept, addLabel, showAdd=true, materialDisabled, addDisabled, uploading, input, access, execution, onAdd, onRemove, onBlocked }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const showToolbar = showAdd || Boolean(access) || Boolean(execution);
  const showAccess = showAdd || Boolean(access);
  return <ConversationImageInput images={images} disabled={materialDisabled} onAdd={onAdd} onRemove={onRemove} onBlocked={onBlocked}>
    <Input.TextArea {...input} />
    {showToolbar && <div className="ac-compose-toolbar">
      {showAccess && <div className="ac-compose-access">
        {showAdd && <>
          <input ref={fileInput} type="file" accept={attachmentAccept} multiple hidden onChange={event => {
            const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void onAdd(files);
          }} />
          <Button type="text" icon={<PlusOutlined />} aria-label={addLabel??"添加图片、视频或文档"} title={addLabel??"添加图片、视频或文档，也可粘贴或拖入；文档和视频最多32 MiB，图片最多8 MiB"} loading={uploading} disabled={addDisabled} onClick={() => fileInput.current?.click()} />
        </>}
        {access}
      </div>}
      {execution && <div className="ac-compose-execution">{execution}</div>}
    </div>}
  </ConversationImageInput>;
}
