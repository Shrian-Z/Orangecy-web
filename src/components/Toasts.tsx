import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { usePlayerStore } from '@/store';

export function Toasts() {
  const toasts = usePlayerStore((state) => state.toasts);
  const dismiss = usePlayerStore((state) => state.dismissToast);

  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.button
            type="button"
            key={toast.id}
            className={`toast is-${toast.tone}`}
            onClick={() => dismiss(toast.id)}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            {toast.tone === 'success' ? (
              <CheckCircle2 size={16} />
            ) : toast.tone === 'error' ? (
              <AlertCircle size={16} />
            ) : (
              <Info size={16} />
            )}
            <span>{toast.text}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
