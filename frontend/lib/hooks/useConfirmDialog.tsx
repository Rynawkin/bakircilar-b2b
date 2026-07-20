'use client';

import { useState, useCallback, useRef } from 'react';

interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'danger' | 'warning' | 'success' | 'info';
  onError?: (error: unknown) => void;
}

interface ConfirmDialogState extends ConfirmDialogOptions {
  isOpen: boolean;
  onConfirm: () => void | Promise<void>;
}

export function useConfirmDialog() {
  const [dialogState, setDialogState] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [isLoading, setIsLoading] = useState(false);
  const pendingResolutionRef = useRef<{
    id: symbol;
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const confirmingDialogIdRef = useRef<symbol | null>(null);

  const showConfirmDialog = useCallback(
    (
      options: ConfirmDialogOptions,
      onConfirm: () => void | Promise<void>
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        pendingResolutionRef.current?.resolve(false);
        const dialogId = Symbol('confirm-dialog');
        pendingResolutionRef.current = { id: dialogId, resolve };
        confirmingDialogIdRef.current = null;
        setIsLoading(false);
        setDialogState({
          ...options,
          isOpen: true,
          onConfirm: async () => {
            if (confirmingDialogIdRef.current === dialogId) return;
            confirmingDialogIdRef.current = dialogId;
            setIsLoading(true);
            try {
              await onConfirm();
              if (pendingResolutionRef.current?.id === dialogId) {
                pendingResolutionRef.current.resolve(true);
                pendingResolutionRef.current = null;
              }
            } catch (error) {
              options.onError?.(error);
              if (pendingResolutionRef.current?.id === dialogId) {
                pendingResolutionRef.current.resolve(false);
                pendingResolutionRef.current = null;
              }
            } finally {
              if (!pendingResolutionRef.current || pendingResolutionRef.current.id === dialogId) {
                setIsLoading(false);
                setDialogState((prev) => ({ ...prev, isOpen: false }));
              }
              if (confirmingDialogIdRef.current === dialogId) {
                confirmingDialogIdRef.current = null;
              }
            }
          },
        });
      });
    },
    []
  );

  const closeDialog = useCallback(() => {
    if (!isLoading) {
      pendingResolutionRef.current?.resolve(false);
      pendingResolutionRef.current = null;
      confirmingDialogIdRef.current = null;
      setDialogState((prev) => ({ ...prev, isOpen: false }));
    }
  }, [isLoading]);

  return {
    dialogState,
    isLoading,
    showConfirmDialog,
    closeDialog,
  };
}
