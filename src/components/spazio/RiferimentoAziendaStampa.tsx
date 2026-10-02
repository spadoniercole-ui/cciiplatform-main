'use client';

// Imposta, finché la pagina è aperta, il riferimento dell'azienda che ogni
// stampa riporta sotto il titolo (identificativi presso l'ente in evidenza).

import { useEffect } from 'react';
import {
  impostaRiferimentoAziendaStampa,
  type RiferimentoAziendaStampa as Riferimento,
} from '@/lib/stampaTesto';

export function RiferimentoAziendaStampa(props: Riferimento) {
  const chiave = JSON.stringify(props);
  useEffect(() => {
    impostaRiferimentoAziendaStampa(JSON.parse(chiave) as Riferimento);
    return () => impostaRiferimentoAziendaStampa(null);
  }, [chiave]);
  return null;
}
