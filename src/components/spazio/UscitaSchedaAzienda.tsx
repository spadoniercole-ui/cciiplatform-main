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
//
// PERCHÉ NON `useSearchParams`. In un componente client che legge i parametri
// di ricerca, Next sospende il render e mostra il ripiego del confine di
// sospensione finché l'idratazione non arriva: con un ripiego che non è un
// collegamento, l'uscita restava un `<span>` e chi apriva la scheda senza
// origine non aveva più una via d'uscita cliccabile. Il primo render quindi è
// già un link vero all'elenco — quello che si vede senza JavaScript — e la
// query si legge dal browser appena il componente è vivo.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  PARAMETRO_RITORNO,
  destinazioneAziende,
  etichettaUscitaScheda,
  percorsoRitornoAziende,
} from '@/lib/navigazione/ritorno';

const CLASSI =
  'inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider';

export function UscitaSchedaAzienda({ codice }: { codice: string }) {
  const percorso = usePathname();
  // Il ripiego è anche il primo render: un collegamento all'elenco, non un
  // segnaposto. Se l'origine c'è, si applica un istante dopo.
  const [destinazione, setDestinazione] = useState(() => destinazioneAziende(codice));

  useEffect(() => {
    const parametri = new URLSearchParams(window.location.search);
    setDestinazione(percorsoRitornoAziende(parametri.get(PARAMETRO_RITORNO), codice));
  }, [codice, percorso]);

  return (
    <Link href={destinazione} className={CLASSI}>
      <ArrowLeft className="w-3.5 h-3.5" /> {etichettaUscitaScheda(destinazione, codice)}
    </Link>
  );
}
