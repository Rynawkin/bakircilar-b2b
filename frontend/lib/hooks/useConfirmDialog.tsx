'use client';

import { useState, useCallback } from 'react';

interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'danger' | 'warning' | 'success' | 'info';
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

  const showConfirmDialog = useCallback(
    (
      options: ConfirmDialogOptions,
      onConfirm: () => void | Promise<void>
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        setDialogState({
          ...options,
          isOpen: true,
          onConfirm: async () => {
            setIsLoading(true);
            try {
              await onConfirm();
              resolve(true);
            } catch (error) {
              resolve(false);
            } finally {
              setIsLoading(false);
              setDialogState((prev) => ({ ...prev, isOpen: false }));
            }
          },
        });
      });
    },
    []
  );

  const closeDialog = useCallback(() => {
    if (!isLoading) {
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
