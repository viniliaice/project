interface ToastProps {
  visible: boolean;
  title?: string;
  message?: string;
  onClose: () => void;
}

export function OrderToast({ visible, title = 'New Order', message = '', onClose }: ToastProps) {
  if (!visible) return null;

  return (
    <div className="fixed right-4 bottom-24 z-60 max-w-sm w-full">
      <div className="bg-white border shadow-md rounded-lg p-4 flex items-start gap-3">
        <div className="text-2xl">🔔</div>
        <div className="flex-1">
          <div className="font-semibold">{title}</div>
          <div className="text-sm text-gray-600">{message}</div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700">×</button>
      </div>
    </div>
  );
}
