'use client';

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Button } from './Button';
import { Trash2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'danger' | 'warning' | 'success' | 'info';
  isLoading?: boolean;
}

const typeConfig = {
  danger: {
    icon: Trash2,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
    confirmClass: 'bg-yellow-600 hover:bg-yellow-700 text-white',
  },
  success: {
    icon: CheckCircle2,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    confirmClass: 'bg-green-600 hover:bg-green-700 text-white',
  },
  info: {
    icon: Info,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    confirmClass: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Onayla',
  cancelLabel = 'İptal',
  type = 'info',
  isLoading = false,
}: ConfirmDialogProps) {
  const config = typeConfig[type];

  const handleConfirm = () => {
    onConfirm();
    if (!isLoading) {
      onClose();
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`flex-shrink-0 ${config.iconBg} rounded-full w-12 h-12 flex items-center justify-center`}>
                    <config.icon className={`w-6 h-6 ${config.iconColor}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-bold text-gray-900 leading-6 mb-2"
                    >
                      {title}
                    </Dialog.Title>
                    <Dialog.Description className="text-sm text-gray-600 leading-relaxed">
                      {message}
                    </Dialog.Description>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex gap-3 justify-end">
                  <Button
                    variant="secondary"
                    onClick={onClose}
                    disabled={isLoading}
                    className="border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50"
                  >
                    {cancelLabel}
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={isLoading}
                    isLoading={isLoading}
                    className={config.confirmClass}
                  >
                    {confirmLabel}
                  </Button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
