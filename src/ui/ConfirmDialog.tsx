// A destructive action's last stop.
//
// Deleting a network takes its nodes with it and there is no undo, so the thing
// being deleted is named in the dialog rather than described in the abstract.

import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { t } from '@i18n/index';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What is about to be lost, named. */
  body: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, onOpenChange, title, body, confirmLabel, onConfirm } = props;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="card fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 p-4">
          <Dialog.Title className="text-lg">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <p className="field-help mt-2">{body}</p>
          </Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close className="btn btn-quiet">{t('cancel')}</Dialog.Close>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel ?? t('delete')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
