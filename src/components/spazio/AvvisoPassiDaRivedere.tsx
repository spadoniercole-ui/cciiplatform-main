// L'AVVISO DOVE SI CORREGGE IL DATO (0.190.0).
//
// La scheda dello scenario dice che la situazione è cambiata; qui l'avviso sta
// nella pagina Proposta, dove il dato si ricontrolla davvero. È un componente
// server: legge solo le props già calcolate dalla pagina, niente client.

import { AlertTriangle } from 'lucide-react';
import { dataItaliana } from '@/lib/scenari/situazione';

export function AvvisoPassiDaRivedere({
  cambiataIl,
  passi,
}: {
  cambiataIl: string | null;
  passi: string[];
}) {
  if (!cambiataIl) return null;
  return (
    <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
      <p className="font-bold flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" />
        Situazione cambiata il {dataItaliana(cambiataIl)}
      </p>
      <p className="mt-1">
        {passi.length > 0
          ? `Il lavoro fatto resta: rivedi ${passi.join('; ')} prima di chiudere lo scenario.`
          : 'Nessun passo compilato da rivedere: lo scenario riparte dalla situazione scelta.'}
      </p>
    </div>
  );
}
