'use client';

// LAVORAZIONI DELLE MATERIE — Parametri di Spazio (0.138.0).
//
// Il titolo di una partita è quello della sua materia: la dipendenza (l'ufficio
// a cui indirizzare la comunicazione di pagamento) e la procedura (i passi per
// incassare) sono quindi proprietà della materia. Qui si scrivono una volta, e
// i titoli di credito dell'ente le leggono da sole dove il codice non ha una
// sua versione.
//
// Una materia può avere più lavorazioni: un processo prevede la verifica del
// flusso, poi la diffida, poi la contabilizzazione, e ciascuna ha il suo
// ufficio e i suoi passi. La prima per ordine è quella che il titolo eredita.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Plus, Save, Trash2, ArrowRight } from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import { ottieniMaterieEnteAction } from '@/app/actions/titoliEnte';
import {
  eliminaLavorazioneMateriaAction,
  ottieniLavorazioniMateria,
  salvaLavorazioneMateriaAction,
} from '@/app/actions/materieLavorazione';
import {
  MASSIMO_CARATTERI_ESITO,
  MASSIMO_CARATTERI_TIPOLOGIA,
  lavorazioniDellaMateria,
  type InputLavorazioneMateria,
  type LavorazioneMateria,
} from '@/lib/titoliEnte/lavorazioniMateria';
import {
  MASSIMO_CARATTERI_ATTIVITA_RECUPERO,
  MASSIMO_CARATTERI_DIPENDENZA,
  riassuntoAttivitaRecupero,
} from '@/lib/titoliEnte/recupero';
import type { MateriaEnte } from '@/lib/titoliEnte/materie';
import { AnteprimaPassi } from '@/components/spazio/TitoliEnteManager';

interface Props {
  nomeSchema: string;
  codice: string;
}

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

const vuota = (materiaId = 0): InputLavorazioneMateria => ({
  materiaId,
  tipologia: '',
  dipendenza: null,
  procedura: null,
  esito: null,
});

function Contatore({ testo, massimo }: { testo: string; massimo: number }) {
  return (
    <span
      className={`block text-[10px] mt-1 ${
        testo.length > massimo ? 'text-red-700 font-bold' : 'text-slate-400'
      }`}
    >
      {testo.length} / {massimo}
    </span>
  );
}

export function MaterieLavorazioneManager({ nomeSchema, codice }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Lavorazioni delle materie',
  });

  const [materie, setMaterie] = useState<MateriaEnte[]>([]);
  const [lavorazioni, setLavorazioni] = useState<LavorazioneMateria[]>([]);
  const [bozze, setBozze] = useState<Record<number, InputLavorazioneMateria>>({});
  const [nuova, setNuova] = useState<InputLavorazioneMateria>(vuota());
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    setErrore(null);
    const [m, l] = await Promise.all([
      ottieniMaterieEnteAction(nomeSchema),
      ottieniLavorazioniMateria(nomeSchema),
    ]);
    if (m.success) {
      setMaterie(m.materie);
      setNuova((prev) => ({
        ...prev,
        materiaId: prev.materiaId || (m.materie[0]?.id ?? 0),
      }));
    } else setErrore(m.error || 'Impossibile caricare le materie.');
    if (l.success) {
      setLavorazioni(l.lavorazioni);
      setBozze(
        Object.fromEntries(
          l.lavorazioni.map((x) => [
            x.id,
            {
              id: x.id,
              materiaId: x.materiaId,
              tipologia: x.tipologia,
              dipendenza: x.dipendenza,
              procedura: x.procedura,
              esito: x.esito,
            },
          ])
        )
      );
    } else setErrore(l.error || 'Impossibile caricare le lavorazioni.');
    setCaricamento(false);
  };

  useEffect(() => {
    void carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const salva = async (input: InputLavorazioneMateria) => {
    setInCorso(true);
    setErrore(null);
    const r = await salvaLavorazioneMateriaAction(nomeSchema, input);
    if (!r.success) setErrore(r.error || 'Impossibile salvare la lavorazione.');
    else {
      if (input.id == null) setNuova(vuota(input.materiaId));
      await carica();
    }
    setInCorso(false);
  };

  const elimina = async (l: LavorazioneMateria) => {
    if (!window.confirm(`Eliminare la lavorazione «${l.tipologia}»?`)) return;
    setInCorso(true);
    setErrore(null);
    const r = await eliminaLavorazioneMateriaAction(nomeSchema, l.id);
    if (!r.success) setErrore(r.error || 'Impossibile eliminare la lavorazione.');
    else await carica();
    setInCorso(false);
  };

  const modificaBozza = (id: number, patch: Partial<InputLavorazioneMateria>) => {
    setBozze((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const nomeMateria = (id: number) => materie.find((m) => m.id === id)?.nome ?? `Materia ${id}`;

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const materieSenzaLavorazione = materie.filter(
    (m) => m.id != null && lavorazioniDellaMateria(lavorazioni, m.id).length === 0
  );
  const materieConLavorazione = materie.filter(
    (m) => m.id != null && lavorazioniDellaMateria(lavorazioni, m.id).length > 0
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <ClipboardList className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Lavorazioni delle materie
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Una materia raccoglie codici di partita che si lavorano allo stesso modo. Qui la materia
            porta con sé la <strong>dipendenza</strong> — l’ufficio a cui indirizzare la
            comunicazione con cui si chiede all’azienda il pagamento — e la{' '}
            <strong>procedura</strong>, i passi che l’ufficio esegue davvero. Si scrivono una volta
            sola: nei{' '}
            <Link
              href={`/spazio/${codice}/parametri/titoli-ente`}
              className="font-bold text-sky-700 hover:underline inline-flex items-center gap-0.5"
            >
              titoli di credito dell’ente <ArrowRight className="w-3 h-3" />
            </Link>{' '}
            ogni codice della materia le legge da qui, e solo un valore scritto sul singolo codice
            ha la precedenza. Questa associazione viene esportata e ripristinata con il resto della
            configurazione dello spazio.
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Un processo ha spesso più lavorazioni — verifica del messaggio, emissione della diffida,
            contabilizzazione — che portano allo stesso esito. La prima dell’elenco è quella che il
            titolo eredita.
          </p>
        </div>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      {materie.length === 0 ? (
        <p className="text-xs text-slate-500">
          Nessuna materia configurata. Le materie si creano nei{' '}
          <Link
            href={`/spazio/${codice}/parametri/titoli-ente`}
            className="font-bold text-sky-700 hover:underline"
          >
            titoli di credito dell’ente
          </Link>
          : una lavorazione senza materia non avrebbe a chi appartenere.
        </p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Nuova lavorazione
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <label className="lg:col-span-4 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Materia
              <select
                value={nuova.materiaId || ''}
                onChange={(e) =>
                  setNuova((prev) => ({ ...prev, materiaId: Number(e.target.value) }))
                }
                className={`${CLASSE} mt-1`}
              >
                <option value="">Scegli...</option>
                {materie.map((m) => (
                  <option key={m.id} value={m.id!}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="lg:col-span-4 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Lavorazione
              <input
                type="text"
                value={nuova.tipologia}
                onChange={(e) => setNuova((prev) => ({ ...prev, tipologia: e.target.value }))}
                placeholder="Es. emissione della diffida"
                className={`${CLASSE} mt-1`}
              />
              <Contatore testo={nuova.tipologia} massimo={MASSIMO_CARATTERI_TIPOLOGIA} />
            </label>
            <label className="lg:col-span-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Esito
              <input
                type="text"
                value={nuova.esito ?? ''}
                onChange={(e) => setNuova((prev) => ({ ...prev, esito: e.target.value || null }))}
                placeholder="Es. diffida notificata"
                className={`${CLASSE} mt-1`}
              />
              <Contatore testo={nuova.esito ?? ''} massimo={MASSIMO_CARATTERI_ESITO} />
            </label>
            <div className="lg:col-span-1 flex items-end">
              <button
                type="button"
                onClick={() => void salva(nuova)}
                disabled={inCorso}
                className="flex items-center justify-center gap-1.5 w-full bg-sky-600 text-white px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-sky-700 disabled:bg-slate-300"
              >
                <Plus className="w-3.5 h-3.5" /> Aggiungi
              </button>
            </div>
            <label className="lg:col-span-4 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Dipendenza
              <input
                type="text"
                value={nuova.dipendenza ?? ''}
                onChange={(e) =>
                  setNuova((prev) => ({ ...prev, dipendenza: e.target.value || null }))
                }
                placeholder="Es. Ufficio Recupero Crediti — Sede di …"
                className={`${CLASSE} mt-1`}
              />
              <Contatore testo={nuova.dipendenza ?? ''} massimo={MASSIMO_CARATTERI_DIPENDENZA} />
            </label>
            <label className="lg:col-span-7 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Procedura — un passo per riga
              <textarea
                value={nuova.procedura ?? ''}
                onChange={(e) =>
                  setNuova((prev) => ({ ...prev, procedura: e.target.value || null }))
                }
                rows={4}
                placeholder={
                  '1. Verificare il messaggio sul cassetto bidirezionale\n2. Acquisire la proposta\n3. Contabilizzare il credito'
                }
                className={`${CLASSE} mt-1 leading-relaxed`}
              />
              <Contatore
                testo={nuova.procedura ?? ''}
                massimo={MASSIMO_CARATTERI_ATTIVITA_RECUPERO}
              />
            </label>
            <div className="lg:col-span-1 flex items-end text-[10px] text-slate-400">
              {riassuntoAttivitaRecupero(nuova.procedura)}
            </div>
          </div>
        </div>
      )}

      {materieConLavorazione.map((m) => (
        <div key={m.id} className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">{m.nome}</h3>
            {m.stato !== 'CONFERMATA' && (
              <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
                materia non confermata
              </span>
            )}
          </div>
          {lavorazioniDellaMateria(lavorazioni, m.id).map((l, indice) => {
            const b = bozze[l.id] ?? {
              id: l.id,
              materiaId: l.materiaId,
              tipologia: l.tipologia,
              dipendenza: l.dipendenza,
              procedura: l.procedura,
              esito: l.esito,
            };
            return (
              <div key={l.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {indice === 0
                      ? 'Ereditata dai titoli della materia'
                      : `Lavorazione ${indice + 1}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void salva(b)}
                      disabled={inCorso}
                      className="flex items-center gap-1.5 bg-slate-900 text-white px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 disabled:bg-slate-300"
                    >
                      <Save className="w-3.5 h-3.5" /> Salva
                    </button>
                    <button
                      type="button"
                      onClick={() => void elimina(l)}
                      disabled={inCorso}
                      className="p-2 rounded-lg border border-slate-300 text-slate-500 hover:text-red-700 hover:border-red-300 disabled:opacity-40"
                      aria-label={`Elimina ${l.tipologia}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                  <label className="lg:col-span-5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Lavorazione
                    <input
                      type="text"
                      value={b.tipologia}
                      onChange={(e) => modificaBozza(l.id, { tipologia: e.target.value })}
                      className={`${CLASSE} mt-1`}
                    />
                    <Contatore testo={b.tipologia} massimo={MASSIMO_CARATTERI_TIPOLOGIA} />
                  </label>
                  <label className="lg:col-span-4 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Dipendenza
                    <input
                      type="text"
                      value={b.dipendenza ?? ''}
                      onChange={(e) => modificaBozza(l.id, { dipendenza: e.target.value || null })}
                      className={`${CLASSE} mt-1`}
                    />
                    <Contatore testo={b.dipendenza ?? ''} massimo={MASSIMO_CARATTERI_DIPENDENZA} />
                  </label>
                  <label className="lg:col-span-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Esito
                    <input
                      type="text"
                      value={b.esito ?? ''}
                      onChange={(e) => modificaBozza(l.id, { esito: e.target.value || null })}
                      className={`${CLASSE} mt-1`}
                    />
                    <Contatore testo={b.esito ?? ''} massimo={MASSIMO_CARATTERI_ESITO} />
                  </label>
                </div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  Procedura — un passo per riga
                  <textarea
                    value={b.procedura ?? ''}
                    onChange={(e) => modificaBozza(l.id, { procedura: e.target.value || null })}
                    rows={7}
                    className={`${CLASSE} mt-1 leading-relaxed`}
                  />
                  <Contatore
                    testo={b.procedura ?? ''}
                    massimo={MASSIMO_CARATTERI_ATTIVITA_RECUPERO}
                  />
                </label>
                <div>
                  <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
                    Come lo vedrà l’operatore
                  </span>
                  <AnteprimaPassi testo={b.procedura ?? ''} />
                </div>
                <p className="text-[10px] text-slate-400">
                  Materia: {nomeMateria(l.materiaId)} — nessun riscontro sulle fonti: la procedura è
                  prassi dell’ente e si salva così com’è.
                </p>
              </div>
            );
          })}
        </div>
      ))}

      {materieSenzaLavorazione.length > 0 && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Senza lavorazione: {materieSenzaLavorazione.map((m) => m.nome).join(', ')}. I codici di
          queste materie restano senza dipendenza e senza procedura finché non ne aggiungi una.
        </p>
      )}
    </div>
  );
}
