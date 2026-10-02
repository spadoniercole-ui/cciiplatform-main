'use client';

// LAVORAZIONE DELLA PROPOSTA — percorso Redigente, una pagina sola (specchio
// dell'istruttoria del Ricevente). Prima erano nove passi in pagine diverse
// (XBRL, Posizione aggiornata, Indici, Check List, Settore, Piano, Brogliaccio,
// Proposta, Relazione), con un giro dalla sidebar per ognuno. Ora:
//   1. Stato attuale dell'azienda — cosa c'è e cosa manca, gli indici in
//      tabella, il settore; le pagine di servizio si aprono e si torna qui;
//   2. La proposta — righe del piano di rientro;
//   3. Il piano di sviluppo — le manopole dicono subito se le rate reggono;
//   4. Documenti di corredo e Relazione — l'unico momento in cui si produce
//      un documento formale.
// Il Brogliaccio non c'è più: la sintesi dello scenario la compone la
// piattaforma quando serve, senza un passo dell'utente.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  CircleDashed,
  FileSpreadsheet,
  ClipboardEdit,
  ListChecks,
  Gauge,
  BarChart3,
} from 'lucide-react';
import { PropostaScenario } from '@/components/spazio/PropostaScenario';
import { TabellaIndiciPeriodi } from '@/components/spazio/TabellaIndiciPeriodi';
import { PianoSviluppoScenario } from '@/components/spazio/PianoSviluppoScenario';
import { DocumentiCorredoRedigente } from '@/components/spazio/DocumentiCorredoRedigente';
import { RelazioneAiScenario } from '@/components/spazio/RelazioneAiScenario';

export interface StatoLavorazione {
  anniBilancio: number[];
  posizione: { data: string | null } | null;
  checklist: { risposte: number; totale: number; esito: string | null };
  testPratico: string | null;
  settore: { gruppo: string | null; settore: number | null; azienda: number | null } | null;
}

export interface ChiusuraLavorazione {
  pianoDisponibile: boolean;
  relazioneDisponibile: boolean;
  settoreDisponibile: boolean;
  eAdminSpazio: boolean;
  identitaUtente: string | null;
  bloccatoIl: string | null;
}

interface Props {
  nomeSchema: string;
  codice: string;
  scenarioId: number;
  aziendaId: number;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
  nomeScenario: string;
  rigaRilevanteBloccataIniziale: boolean;
  stato: StatoLavorazione;
  chiusura: ChiusuraLavorazione;
}

function TitoloFase({ numero, testo, id }: { numero: number; testo: string; id: string }) {
  return (
    <h3
      id={id}
      className="scroll-mt-4 font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2"
    >
      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] flex items-center justify-center">
        {numero}
      </span>
      {testo}
    </h3>
  );
}

const pct = (n: number | null) =>
  n === null ? 'n/d' : `${n > 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')}%`;

function Voce({
  fatto,
  icona: Icona,
  titolo,
  dettaglio,
  azione,
  href,
}: {
  fatto: boolean;
  icona: typeof Gauge;
  titolo: string;
  dettaglio: string;
  azione: string;
  href: string;
}) {
  return (
    <div className="flex items-start gap-3 bg-white border border-slate-200 rounded-lg p-3">
      {fatto ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
      ) : (
        <CircleDashed className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <Icona className="w-3.5 h-3.5 text-blue-600" /> {titolo}
        </p>
        <p className="text-[11px] text-slate-600 mt-0.5">{dettaglio}</p>
      </div>
      <Link
        href={href}
        className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase ${
          fatto
            ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {azione}
      </Link>
    </div>
  );
}

export function LavorazioneRedigente({
  nomeSchema,
  codice,
  scenarioId,
  aziendaId,
  tipoSpazio,
  nomeScenario,
  rigaRilevanteBloccataIniziale,
  stato,
  chiusura,
}: Props) {
  // Le rate del piano vengono dalla proposta: quando le righe cambiano, il
  // piano si rilegge (nuova chiave = nuovo caricamento).
  const [versioneProposta, setVersioneProposta] = useState(0);

  // Rientro da una pagina di servizio: si torna all'altezza giusta.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = setTimeout(
      () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      400
    );
    return () => clearTimeout(t);
  }, []);

  const base = `/spazio/${codice}/scenari/${scenarioId}`;
  const ritorno = 'ritorno=lavorazione';
  const { anniBilancio, posizione, checklist, testPratico, settore } = stato;
  const dataPos = posizione?.data ? posizione.data.split('-').reverse().join('/') : null;

  return (
    <div className="space-y-10">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Lavorazione della proposta
        </h2>
        <p className="text-[11px] text-slate-600 mt-1">
          Tutto su questa pagina, nell’ordine in cui si lavora: lo stato attuale dell’azienda, le
          righe della proposta, il piano di sviluppo che dice se le rate reggono, poi i documenti e
          la Relazione. Le pagine di servizio (bilanci, posizione aggiornata, Check List) si aprono
          da qui e riportano qui.
        </p>
      </div>

      <section className="space-y-3">
        <TitoloFase numero={1} id="stato" testo="Stato attuale dell’azienda" />
        <div className="grid gap-2">
          <Voce
            fatto={anniBilancio.length > 0}
            icona={FileSpreadsheet}
            titolo="Bilanci depositati (XBRL)"
            dettaglio={
              anniBilancio.length
                ? `${anniBilancio.length} ${anniBilancio.length === 1 ? 'bilancio' : 'bilanci'}: ${anniBilancio.join(', ')}.`
                : 'Nessun bilancio caricato: serve almeno l’ultimo, è la base di indici e piano.'
            }
            azione={anniBilancio.length ? 'Aggiungi o rivedi' : 'Carica i bilanci'}
            href={`${base}/xbrl?${ritorno}`}
          />
          <Voce
            fatto={!!posizione}
            icona={ClipboardEdit}
            titolo="Posizione aggiornata"
            dettaglio={
              posizione
                ? `Situazione al ${dataPos ?? 'data non indicata'}: è lo stato attuale da cui parte il piano.`
                : 'Facoltativa ma consigliata: una situazione contabile più recente del bilancio (anche in PDF, la piattaforma la legge). Senza, il piano parte dall’ultimo bilancio.'
            }
            azione={posizione ? 'Aggiorna' : 'Carica la situazione'}
            href={`${base}/posizione-aggiornata?${ritorno}`}
          />
          <Voce
            fatto={!!testPratico}
            icona={Gauge}
            titolo="Test pratico (Sezione I del decreto)"
            dettaglio={
              testPratico
                ? `Esito: ${testPratico}.`
                : 'Non ancora compilato: misura il debito da ristrutturare contro i flussi annui a regime.'
            }
            azione={testPratico ? 'Rivedi' : 'Compila'}
            href={`/spazio/${codice}/aziende/${aziendaId}/checklist?${ritorno}&scenario=${scenarioId}`}
          />
          <Voce
            fatto={checklist.risposte > 0}
            icona={ListChecks}
            titolo="Check List Ministeriale (Sezione II)"
            dettaglio={
              checklist.risposte
                ? `${checklist.risposte}/${checklist.totale} risposte${checklist.esito ? ` — ${checklist.esito}` : ''}.`
                : `Nessuna risposta su ${checklist.totale}: è il quadro qualitativo che il bilancio non racconta.`
            }
            azione={checklist.risposte ? 'Continua' : 'Compila'}
            href={`${base}/checklist?${ritorno}`}
          />
        </div>
        {chiusura.settoreDisponibile && (
          <p className="flex items-center gap-2 text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <BarChart3 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            {settore ? (
              <span>
                Settore{settore.gruppo ? ` (ATECO ${settore.gruppo})` : ''}: crescita annua{' '}
                <strong>{pct(settore.settore)}</strong>; azienda{' '}
                <strong>{pct(settore.azienda)}</strong>. È il riferimento con cui il piano viene
                confrontato.
              </span>
            ) : (
              <span>
                Dati di settore non ancora disponibili: servono il codice ATECO dell’azienda e
                almeno due bilanci.
              </span>
            )}
          </p>
        )}
        {(anniBilancio.length > 0 || posizione) && (
          <TabellaIndiciPeriodi
            nomeSchema={nomeSchema}
            scenarioId={scenarioId}
            titolo="Indici per periodo, con la Posizione aggiornata"
          />
        )}
      </section>

      <section className="space-y-3">
        <TitoloFase numero={2} id="proposta" testo="La proposta" />
        <PropostaScenario
          nomeSchema={nomeSchema}
          scenarioId={scenarioId}
          aziendaId={aziendaId}
          tipoProposta="DA_DEFINIRE"
          tipoSpazio={tipoSpazio}
          nomeScenario={nomeScenario}
          rigaRilevanteBloccataIniziale={rigaRilevanteBloccataIniziale}
          codice={codice}
          onRigheCambiate={setVersioneProposta}
        />
      </section>

      <section className="space-y-3">
        <TitoloFase numero={3} id="piano" testo="Il piano di sviluppo: le rate reggono?" />
        {chiusura.pianoDisponibile ? (
          <PianoSviluppoScenario
            key={versioneProposta}
            nomeSchema={nomeSchema}
            codice={codice}
            scenarioId={scenarioId}
            aziendaId={aziendaId}
            tipoProposta="DA_DEFINIRE"
          />
        ) : (
          <p className="text-xs text-slate-500">
            Il Piano di sviluppo non è incluso nella licenza di questo spazio o nei tuoi permessi.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <TitoloFase numero={4} id="chiusura" testo="Documenti e Relazione" />
        <DocumentiCorredoRedigente
          nomeSchema={nomeSchema}
          scenarioId={scenarioId}
          aziendaId={aziendaId}
        />
        {chiusura.relazioneDisponibile ? (
          <RelazioneAiScenario
            nomeSchema={nomeSchema}
            scenarioId={scenarioId}
            aziendaId={aziendaId}
            tipoProposta="DA_DEFINIRE"
            eAdminSpazio={chiusura.eAdminSpazio}
            identitaUtente={chiusura.identitaUtente}
            bloccatoIl={chiusura.bloccatoIl}
          />
        ) : (
          <p className="text-xs text-slate-500">
            La Relazione AI non è inclusa nella licenza di questo spazio.
          </p>
        )}
      </section>
    </div>
  );
}
