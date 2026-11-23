'use client';

// L'USCITA DALLA SCHEDA PORTA DOVE SI È ENTRATI.
//
// La scheda azienda si apre da più punti: l'elenco Aziende, la griglia delle
// iconografie, la verifica amministrativa. Un'uscita fissa a `/aziende`
// costringeva chi era entrato da altrove a ricominciare il giro da un menù che
// non era quello da cui veniva.
//
// Chi entra porta con sé la sua origine (`?ritorno=…`), come già fanno i
// rimandi ai Parametri. Qui si legge e si valida con le stesse regole: solo
// percorsi dello spazio di chi naviga, niente catene. L'etichetta dice dove si
// torna; senza origine riconoscibile si esce dall'elenco Aziende, che è la
// porta delle posizioni.

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  PARAMETRO_RITORNO,
  etichettaUscitaScheda,
  percorsoRitornoAziende,
} from '@/lib/navigazione/ritorno';

const CLASSI =
  'inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider';

export function UscitaSchedaAzienda({ codice }: { codice: string }) {
  const parametri = useSearchParams();
  const destinazione = percorsoRitornoAziende(parametri.get(PARAMETRO_RITORNO), codice);

  return (
    <Link href={destinazione} className={CLASSI}>
      <ArrowLeft className="w-3.5 h-3.5" /> {etichettaUscitaScheda(destinazione, codice)}
    </Link>
  );
}
