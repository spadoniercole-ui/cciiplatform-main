'use client';

// "Posizione Ente" — il contenitore che raggruppa tutto ciò che
// riguarda l'ente in relazione a QUESTA azienda: chi è per lui
// (Anagrafica), cosa dichiara di avere a credito (Situazione
// Debitoria). A livello di Azienda, non di Scenario — questi dati non
// cambiano da una proposta all'altra della stessa azienda: la
// matricola con cui l'ente la identifica nella propria contabilità è
// sempre la stessa, e il debito dichiarato è quello, non si "reimposta"
// aprendo un nuovo scenario.
//
// La Check List che viveva qui è sparita come scheda a sé: il
// questionario generato dallo Screening (Azienda → Screening) la
// sostituisce — è già mirato alle direttrici di questo ente per
// QUESTA azienda specifica, non serve una seconda check list generica
// da compilare in parallelo.
//
// L'Anagrafica è un passaggio obbligato, non solo il primo per
// convenzione: Situazione Debitoria resta bloccata finché non è
// compilata (almeno un campo, non vuota — altrimenti il blocco non
// avrebbe senso). Una volta salvata, il suo riepilogo resta sempre
// visibile sopra l'altra scheda.

import React, { useEffect, useState } from 'react';
import { IdCard, Scale, Lock, ClipboardCheck, Gauge } from 'lucide-react';
import { AnagraficaEnteScenario } from '@/components/spazio/AnagraficaEnteScenario';
import { DebitiEnteScenario } from '@/components/spazio/DebitiEnteScenario';
import { PosizioneVeraScenario } from '@/components/spazio/PosizioneVeraScenario';
import { SoglieSegnalazioneAzienda } from '@/components/spazio/SoglieSegnalazioneAzienda';
import { ottieniEtichetteAnagraficaEnte } from '@/app/actions/anagraficaEnteConfig';
import { ottieniAnagraficaEnte, type AnagraficaEnte } from '@/app/actions/anagraficaEnte';
import { CHIAVI_CAMPO_ANAGRAFICA_ENTE } from '@/lib/costantiRicevibilita';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  nomeAzienda: string;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
}

type Scheda = 'anagrafica' | 'debitoria' | 'vera' | 'soglie';

// `soloEnte: false` = visibile anche al Redigente. Le Soglie di segnalazione
// sono l'unica scheda aperta a entrambi: i valori sono a inserimento manuale
// e il professionista li ha (file V.E.R.A. richiesto all'istituto, oppure
// flussi UNIEMENS da cui ricava il totale annuo).
const SCHEDE: { id: Scheda; label: string; icon: typeof IdCard; soloEnte: boolean }[] = [
  { id: 'anagrafica', label: 'Anagrafica', icon: IdCard, soloEnte: true },
  { id: 'debitoria', label: 'Situazione Debitoria', icon: Scale, soloEnte: true },
  { id: 'vera', label: 'Posizione V.E.R.A.', icon: ClipboardCheck, soloEnte: true },
  { id: 'soglie', label: 'Soglie di segnalazione', icon: Gauge, soloEnte: false },
];

const VUOTA: AnagraficaEnte = {
  idEnte: null,
  campo1: null,
  campo2: null,
  campo3: null,
  campo4: null,
  campo5: null,
  campo6: null,
  campo7: null,
  campo8: null,
  campo9: null,
  campo10: null,
};

function anagraficaCompilata(dati: AnagraficaEnte): boolean {
  return [
    dati.idEnte,
    dati.campo1,
    dati.campo2,
    dati.campo3,
    dati.campo4,
    dati.campo5,
    dati.campo6,
    dati.campo7,
    dati.campo8,
    dati.campo9,
    dati.campo10,
  ].some((c) => c && c.trim());
}

export function PosizioneEnteScenario({ nomeSchema, aziendaId, nomeAzienda, tipoSpazio }: Props) {
  const eEnte = tipoSpazio === 'ENTE';
  const schedeVisibili = SCHEDE.filter((x) => !x.soloEnte || eEnte);
  const [scheda, setScheda] = useState<Scheda>(eEnte ? 'anagrafica' : 'soglie');
  const [etichette, setEtichette] = useState<
    { campo: number; etichetta: string; attivo: boolean }[]
  >([]);
  const [dati, setDati] = useState<AnagraficaEnte>(VUOTA);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const [etichetteRis, datiRis] = await Promise.all([
        ottieniEtichetteAnagraficaEnte(nomeSchema),
        ottieniAnagraficaEnte(nomeSchema, aziendaId),
      ]);
      if (etichetteRis.success) setEtichette(etichetteRis.etichette);
      if (datiRis.success) setDati(datiRis.dati);
      setCaricamento(false);
    })();
  }, [nomeSchema, aziendaId]);

  const sbloccata = anagraficaCompilata(dati);
  const chiaviCampo = CHIAVI_CAMPO_ANAGRAFICA_ENTE as (keyof AnagraficaEnte)[];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Posizione Ente
        </h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Tutto ciò che riguarda l&apos;ente in relazione a questa azienda: chi è per lui, cosa
          dichiara di avere a credito — non cambia da uno scenario all&apos;altro della stessa
          azienda.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {schedeVisibili.map((s) => {
          // Le Soglie di segnalazione non dipendono dall'Anagrafica Ente:
          // sono valori a inserimento manuale, e per il Redigente
          // quella scheda non esiste nemmeno.
          const bloccata = s.id !== 'anagrafica' && s.id !== 'soglie' && !sbloccata && !caricamento;
          return (
            <button
              key={s.id}
              type="button"
              disabled={bloccata}
              onClick={() => !bloccata && setScheda(s.id)}
              title={bloccata ? "Compila prima l'anagrafica" : undefined}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap transition-colors shrink-0 ${
                bloccata
                  ? 'bg-slate-50 border border-slate-100 text-slate-300 cursor-not-allowed'
                  : scheda === s.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'
              }`}
            >
              {bloccata ? <Lock className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
              {s.label}
            </button>
          );
        })}
      </div>

      {!sbloccata && !caricamento && scheda === 'anagrafica' && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          Compila e salva almeno un campo per sbloccare Situazione Debitoria — sono dati
          fondamentali per l&apos;analisi, non solo un&apos;anagrafica di comodo.
        </p>
      )}

      {sbloccata && scheda !== 'anagrafica' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px]">
          {dati.idEnte && (
            <span>
              <span className="text-slate-400">ID Ente:</span>{' '}
              <span className="font-bold text-slate-700">{dati.idEnte}</span>
            </span>
          )}
          {etichette
            .filter((e) => e.attivo)
            .map((e) => {
              const valore = dati[chiaviCampo[e.campo - 1]];
              if (!valore) return null;
              return (
                <span key={e.campo}>
                  <span className="text-slate-400">{e.etichetta}:</span>{' '}
                  <span className="font-bold text-slate-700">{valore}</span>
                </span>
              );
            })}
        </div>
      )}

      {scheda === 'anagrafica' && (
        <AnagraficaEnteScenario
          nomeSchema={nomeSchema}
          aziendaId={aziendaId}
          onSalvato={(nuoviDati) => setDati(nuoviDati)}
        />
      )}
      {scheda === 'debitoria' && sbloccata && (
        <DebitiEnteScenario
          nomeSchema={nomeSchema}
          aziendaId={aziendaId}
          nomeAzienda={nomeAzienda}
        />
      )}
      {scheda === 'vera' && sbloccata && (
        <PosizioneVeraScenario nomeSchema={nomeSchema} aziendaId={aziendaId} />
      )}
      {scheda === 'soglie' && (
        <SoglieSegnalazioneAzienda
          nomeSchema={nomeSchema}
          aziendaId={aziendaId}
          tipoSpazio={tipoSpazio}
        />
      )}
    </div>
  );
}
