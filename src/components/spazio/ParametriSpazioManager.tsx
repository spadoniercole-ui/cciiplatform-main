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
  Gauge,
  Printer,
  ClipboardList,
} from 'lucide-react';
import { ConfigurazioneSpazioFile } from '@/components/spazio/ConfigurazioneSpazioFile';
import { LAVORAZIONI_TIPO_DEBITO_SOLA_LETTURA } from '@/lib/lavorazioni/solaLettura';

interface Props {
  nomeSchema: string;
  codice: string;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
}

interface VoceParametro {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  titolo: string;
  descrizione: string;
  /**
   * Posizione nella catena dell'ente: direttrici → lavorazioni → titoli. È
   * l'ordine in cui si scrivono, perché ogni anello usa quello prima.
   */
  passo?: number;
}

export function ParametriSpazioManager({ nomeSchema, codice, tipoSpazio }: Props) {
  const voci: VoceParametro[] = [
    // La catena dell'ente, nell'ordine in cui si configura: le direttrici danno
    // il nome agli uffici, le lavorazioni delle materie li scelgono, i titoli di
    // credito li ereditano. Gli altri parametri vengono dopo.
    ...(tipoSpazio === 'ENTE'
      ? [
          {
            href: `/spazio/${codice}/parametri/direttrici-ente`,
            icon: Sparkles,
            passo: 1,
            titolo: 'Direttrici Ente',
            descrizione:
              'Le aree dell’ente, scritte una volta sola: il loro nome è il nome dell’ufficio che le lavorazioni scelgono come dipendenza. Alimentano anche il questionario di screening.',
          },
          {
            href: `/spazio/${codice}/parametri/materie-lavorazione`,
            icon: ClipboardList,
            passo: 2,
            titolo: 'Lavorazioni delle materie',
            descrizione:
              'Per ogni materia, l’ufficio (una delle direttrici), i passi e l’esito: si scrivono una volta e i titoli dei suoi codici li ereditano.',
          },
          {
            href: `/spazio/${codice}/parametri/titoli-ente`,
            icon: Scale,
            passo: 3,
            titolo: 'Titoli di credito dell’ente',
            descrizione:
              'Per ogni codice di partita: atto, presupposto giuridico e circolare, riscontrati sulle fonti ufficiali; ufficio e procedura arrivano dalla materia.',
          },
        ]
      : []),
    {
      href: `/spazio/${codice}/parametri/ricevibilita`,
      icon: ShieldCheck,
      titolo:
        tipoSpazio === 'ENTE'
          ? 'Parametri di riscontro della proposta'
          : 'Percentuale media di proposta',
      descrizione:
        tipoSpazio === 'ENTE'
          ? 'Valore di liquidazione e % minima per categoria di creditore.'
          : 'Il punto di partenza per ogni nuova riga di Proposta, modificabile riga per riga.',
    },
    {
      href: `/spazio/${codice}/parametri/confronto-piano`,
      icon: Scale,
      titolo: 'Confronto con il piano di settore',
      descrizione:
        tipoSpazio === 'ENTE'
          ? 'Soglie dei semafori sullo scostamento del piano dell’azienda, in senso favorevole, dal piano automatico di settore.'
          : 'Soglie dei semafori dell’autoverifica: scostamento del piano, in senso favorevole, dal piano automatico di settore.',
    },
    ...(tipoSpazio === 'ENTE'
      ? [
          {
            href: `/spazio/${codice}/parametri/stampa`,
            icon: Printer,
            titolo: 'Stampa',
            descrizione:
              'Margini, intestazione, piè di pagina e logo dell’ente su ogni documento stampato.',
          },
          {
            href: `/spazio/${codice}/parametri/indice-iai`,
            icon: Gauge,
            titolo: 'Indice di Attenzione Istruttoria',
            descrizione:
              'Pesi delle dimensioni e minimi dei vincoli, con la nota metodologica stampabile.',
          },
        ]
      : []),
    {
      href: `/spazio/${codice}/parametri/soglie`,
      icon: Scale,
      titolo: 'Soglie di segnalazione (art. 25-novies)',
      descrizione:
        'Gli importi di legge oltre cui scatta la segnalazione. Modificabili perché una riforma non imponga un aggiornamento del programma; il valore di legge resta sempre a vista.',
    },
    {
      href: `/spazio/${codice}/parametri/lavorazioni`,
      icon: ClipboardList,
      titolo: 'Lavorazioni per tipo di debito',
      descrizione:
        'Per ogni categoria di debito, la lavorazione da svolgere e il collega che la riceve. Alimenta le comunicazioni preparate dal triage sul file V.E.R.A.' +
        (LAVORAZIONI_TIPO_DEBITO_SOLA_LETTURA ? ' Oggi è in sola lettura.' : ''),
    },
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

      <ConfigurazioneSpazioFile nomeSchema={nomeSchema} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {voci.map((v) => (
          <Link
            key={v.href}
            href={v.href}
            className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2">
              {v.passo ? (
                <span className="w-5 h-5 shrink-0 mt-0.5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center">
                  {v.passo}
                </span>
              ) : (
                <v.icon className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              )}
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
