import { useEffect, useRef } from 'react';

/** All application dialogs share initial focus, native focus containment and restoration. */
export function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    element.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return ref;
}
