'use client';

// Carica i parametri di stampa dello spazio e li consegna a stampaTesto:
// montato nel layout dello spazio, cosi' ogni stampa li applica.

import { useEffect } from 'react';
import { ottieniParametriStampaAction } from '@/app/actions/parametriStampa';
import { impostaParametriStampa } from '@/lib/stampaTesto';

export function ParametriStampaLoader({ nomeSchema }: { nomeSchema: string }) {
  useEffect(() => {
    ottieniParametriStampaAction(nomeSchema).then((r) => {
      if (r.success) impostaParametriStampa(r.parametri);
    });
  }, [nomeSchema]);
  return null;
}
