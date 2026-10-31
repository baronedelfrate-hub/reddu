import { useEffect } from 'react';

const EVENT_NAME = 'lote-updated-sync';

export const emitLoteUpdated = () => {
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
};

export function useEditLoteSync(callback) {
  useEffect(() => {
    const handleUpdate = () => {
      if (typeof callback === 'function') {
        callback();
      }
    };
    
    window.addEventListener(EVENT_NAME, handleUpdate);
    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate);
    };
  }, [callback]);
}