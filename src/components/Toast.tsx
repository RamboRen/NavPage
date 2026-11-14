import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import styles from './Toast.module.css';

type Notify = (message: string) => void;

const ToastContext = createContext<Notify>(() => {});

/** 任意组件里拿一个 notify('提示文案') 即可弹提示 */
export function useToast(): Notify {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const timers = useRef<number[]>([]);

  const notify = useCallback<Notify>((text) => {
    timers.current.forEach((id) => window.clearTimeout(id));
    setMessage(text);
    setVisible(true);
    timers.current = [
      window.setTimeout(() => setVisible(false), 1600),
      window.setTimeout(() => setMessage(null), 1950)
    ];
  }, []);

  useEffect(
    () => () => timers.current.forEach((id) => window.clearTimeout(id)),
    []
  );

  return (
    <ToastContext.Provider value={notify}>
      {children}
      {message !== null && (
        <div
          className={`${styles.toast} ${visible ? styles.show : ''}`}
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
