import { useEffect, useRef } from 'react';

// All overlays share this stack so Escape never closes an underlying window.
const escapeLayers = [];

export function useEscapeClose(isOpen, onClose) {
  const closeRef = useRef(onClose);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const layer = {};
    escapeLayers.push(layer);
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || escapeLayers.at(-1) !== layer) return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current?.(event);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const index = escapeLayers.lastIndexOf(layer);
      if (index !== -1) escapeLayers.splice(index, 1);
    };
  }, [isOpen]);
}
