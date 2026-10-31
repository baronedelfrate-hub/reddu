import { useState, useEffect } from 'react';

const STORAGE_KEY = 'labelDimensions';
const DEFAULT_DIMENSIONS = { width: 55, height: 38 }; // Atualizado para Elgin L42DT com margem de segurança

export function useEtiquetaDimensions() {
  const [dimensions, setDimensions] = useState(DEFAULT_DIMENSIONS);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setDimensions(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse label dimensions from local storage', e);
      }
    }
  }, []);

  const saveDimensions = (width, height) => {
    const newDims = { width: Number(width), height: Number(height) };
    setDimensions(newDims);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newDims));
  };

  const resetDimensions = () => {
    setDimensions(DEFAULT_DIMENSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DIMENSIONS));
  };

  return { dimensions, saveDimensions, resetDimensions };
}