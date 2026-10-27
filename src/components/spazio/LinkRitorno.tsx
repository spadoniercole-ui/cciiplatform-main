import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { etichettaRitorno, percorsoRitorno } from '@/lib/navigazione/ritorno';

// L'uscita di una pagina dei Parametri.
//
// Non è sempre «Torna a Parametri di Spazio»: chi è arrivato qui dal triage per
// sistemare una materia deve poter tornare alla verifica che stava guardando,
// non ricominciare dalla dashboard. Il percorso è validato in
// src/lib/navigazione/ritorno.ts: solo dentro lo spazio di chi naviga.
export function LinkRitorno({ codice, ritorno }: { codice: string; ritorno?: string | string[] }) {
  const destinazione = percorsoRitorno(ritorno, codice);
  return (
    <Link
      href={destinazione}
      className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider"
    >
      <ArrowLeft className="w-3.5 h-3.5" /> {etichettaRitorno(destinazione, codice)}
    </Link>
  );
}
