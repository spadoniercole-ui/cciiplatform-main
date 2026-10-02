// Identificativi dell'azienda presso l'ente (matricola, posizioni…), da
// mostrare IN EVIDENZA ovunque si lavori sull'azienda: una volta salvati,
// sono il riferimento con cui l'ente la ritrova nei propri archivi. I dati
// camerali (P.IVA, C.F.) seguono, in secondo piano.
//
// Componente senza stato: si usa sia nei Server sia nei Client Component.

import React from 'react';

export interface IdentificativoVisibile {
  etichetta: string;
  valore: string;
}

export function IdentificativiEnte({
  identificativi,
  partitaIva,
  codiceFiscale,
  compatto = false,
}: {
  identificativi: IdentificativoVisibile[];
  partitaIva?: string | null;
  codiceFiscale?: string | null;
  compatto?: boolean;
}) {
  const camerali = [
    partitaIva ? `P.IVA ${partitaIva}` : null,
    codiceFiscale && codiceFiscale !== partitaIva ? `C.F. ${codiceFiscale}` : null,
  ].filter(Boolean) as string[];
  const testoPiccolo = compatto ? 'text-[10px]' : 'text-[11px]';
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      {identificativi.map((x) => (
        <span key={x.etichetta} className={compatto ? 'text-[11px]' : 'text-xs'}>
          <span className="text-slate-500">{x.etichetta}</span>{' '}
          <span className="font-bold text-slate-900">{x.valore}</span>
        </span>
      ))}
      {camerali.length > 0 && (
        <span className={`${testoPiccolo} text-slate-400`}>{camerali.join(' · ')}</span>
      )}
    </span>
  );
}
