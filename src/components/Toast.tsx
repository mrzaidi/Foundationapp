'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import Icon from './Icon';

type ToastKind = 'ok' | 'bad';
interface ToastState {
  msg: string;
  kind: ToastKind;
  show: boolean;
}

const Ctx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<ToastState>({ msg: '', kind: 'ok', show: false });

  const toast = useCallback((msg: string, kind: ToastKind = 'ok') => {
    setT({ msg, kind, show: true });
    window.setTimeout(() => setT((s) => ({ ...s, show: false })), 3200);
  }, []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className={`toast ${t.kind === 'bad' ? 'bad' : ''} ${t.show ? 'show' : ''}`} role="status">
        <Icon name={t.kind === 'bad' ? 'alert' : 'checkCircle'} />
        <span>{t.msg}</span>
      </div>
    </Ctx.Provider>
  );
}
