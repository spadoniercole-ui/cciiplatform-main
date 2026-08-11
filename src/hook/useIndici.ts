import { useMemo } from 'react';
import { calcolaIndici } from '@/lib/calculators';

export const useIndici = (xbrlData: any) => {
  // useMemo garantisce che il calcolo avvenga SOLO se cambiano i dati
  const indiciCalcolati = useMemo(() => {
    if (!xbrlData) return null;
    return calcolaIndici(xbrlData);
  }, [xbrlData]);

  return indiciCalcolati;
};
