'use client';

// Parametri di Spazio: prima una pagina unica con tutto in linea (indici,
// tab XBRL, ricevibilità, check list, parametri di sistema — diventata
// chilometrica). Ora solo indice: una card per area, ciascuna con un link
// verso la propria pagina dedicata. Le informazioni si attivano solo
// quando servono, non tutte insieme ad ogni apertura.

import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  FileSpreadsheet,
  TrendingUp,
  ListChecks,
  Settings2,
  ArrowRight,
  Building2,
  Scale,
  Sparkles,
  History,
} from 'lucide-react';

interface Props {
  nomeSchema: string;
  codice: string;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
}

export function ParametriSpazioManager({ codice, tipoSpazio }: Props) {
  const voci = [
    {
      href: `/spazio/${codice}/parametri/ricevibilita`,
      icon: ShieldCheck,
      titolo: tipoSpazio === 'ENTE' ? 'Limiti di ricevibilità' : 'Percentuale media di proposta',
      descrizione:
        tipoSpazio === 'ENTE'
          ? 'Valore di liquidazione e % minima per categoria di creditore.'
          : 'Il punto di partenza per ogni nuova riga di Proposta, modificabile riga per riga.',
    },
    ...(tipoSpazio === 'ENTE'
      ? [
          {
            href: `/spazio/${codice}/parametri/direttrici-ente`,
            icon: Sparkles,
            titolo: 'Direttrici Ente (Screening)',
            descrizione:
              'Le aree lungo cui generare il questionario di screening (vigilanza documentale, gestione del credito, contenzioso...).',
          },
        ]
      : []),
    {
      href: `/spazio/${codice}/parametri/tab-xbrl`,
      icon: FileSpreadsheet,
      titolo: 'Tab XBRL',
      descrizione: "Quali viste del motore XBRL attivare nell'Import XBRL delle aziende.",
    },
    {
      href: `/spazio/${codice}/parametri/indici`,
      icon: TrendingUp,
      titolo: 'Indici',
      descrizione: 'Quali dei 9 indici calcolati usare in questo spazio.',
    },
    {
      href: `/spazio/${codice}/parametri/checklist`,
      icon: ListChecks,
      titolo: 'Check List',
      descrizione:
        tipoSpazio === 'ENTE'
          ? 'Pesi della Check List generata dallo Screening.'
          : 'Pesi della Check List Ministeriale (56 domande, Sezione II del decreto).',
    },
    ...(tipoSpazio === 'ENTE'
      ? [
          {
            href: `/spazio/${codice}/parametri/anagrafica-ente`,
            icon: Building2,
            titolo: 'Anagrafica Ente',
            descrizione: "Etichette dei campi identificativi usati dall'ente di questo spazio.",
          },
          {
            href: `/spazio/${codice}/parametri/tipo-debito`,
            icon: Scale,
            titolo: 'Tipo Debito (Situazione Debitoria)',
            descrizione:
              'Etichette dei 4 codici CLE/CEN/CEC/CEA usati dall\u2019ente di questo spazio.',
          },
        ]
      : []),
    {
      href: `/spazio/${codice}/parametri/visualizzazione`,
      icon: History,
      titolo: 'Storico XBRL a video',
      descrizione:
        'Quanti anni di bilancio mostrare al massimo in Indici e Posizione Aggiornata (l’archivio li conserva comunque tutti).',
    },
    {
      href: `/spazio/${codice}/parametri/sistema`,
      icon: Settings2,
      titolo: 'Parametri di sistema',
      descrizione: 'Ereditati dal superadmin, sola lettura.',
    },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Parametri di Spazio</h1>
        <p className="text-slate-500 text-xs mt-1">
          Configurazione specifica di questo spazio, per area. Apri ciascuna sezione solo quando ti
          serve modificarla.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {voci.map((v) => (
          <Link
            key={v.href}
            href={v.href}
            className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2">
              <v.icon className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 text-sm">{v.titolo}</span>
                <p className="text-xs text-slate-500 mt-0.5">{v.descrizione}</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
