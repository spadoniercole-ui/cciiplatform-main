'use client';

// LAVORAZIONI PER TIPOLOGIA DI DEBITO.
//
// La tabella che rende pertinenti le comunicazioni del triage: per ogni
// categoria di debito dice che cosa va fatto e a quale collega va chiesto.
// Non è un elenco di testi liberi da spedire: il testo della comunicazione
// resta composto dai dati del V.E.R.A., qui si configura solo il compito e
// il destinatario.

import React, { useEffect, useState } from 'react';
import { ClipboardList, Plus, Save, Trash2 } from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import {
  ottieniCategorieTipoDebito,
  type CategoriaTipoDebito,
} from '@/app/actions/categorieTipoDebito';
import {
  ottieniLavorazioniTipoDebito,
  salvaLavorazioneTipoDebitoAction,
  eliminaLavorazioneTipoDebitoAction,
  type InputLavorazioneTipoDebito,
  type LavorazioneTipoDebito,
} from '@/app/actions/lavorazioniTipoDebito';
import { TIPI_DEBITO_ENTE } from '@/lib/debitiEnte/tipoDebito';
import { conRitorno } from '@/lib/navigazione/ritorno';
import {
  AVVISO_LAVORAZIONI_SOLA_LETTURA,
  LAVORAZIONI_TIPO_DEBITO_SOLA_LETTURA,
} from '@/lib/lavorazioni/solaLettura';

interface Props {
  nomeSchema: string;
  codice: string;
  /** La pagina da cui si è arrivati: si riporta nei rimandi fra le gestioni. */
  ritorno?: string;
}

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

const vuota = (categoria = ''): InputLavorazioneTipoDebito => ({
  categoria,
  lavorazione: '',
  destinatario: '',
  attivo: true,
});

export function LavorazioniTipoDebitoManager({ nomeSchema, codice, ritorno }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Lavorazioni per tipologia di debito',
  });

  const [categorie, setCategorie] = useState<CategoriaTipoDebito[]>([]);
  const [lavorazioni, setLavorazioni] = useState<LavorazioneTipoDebito[]>([]);
  const [bozze, setBozze] = useState<Record<number, InputLavorazioneTipoDebito>>({});
  const [nuova, setNuova] = useState<InputLavorazioneTipoDebito>(vuota());
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    setErrore(null);
    const [c, l] = await Promise.all([
      ottieniCategorieTipoDebito(nomeSchema),
      ottieniLavorazioniTipoDebito(nomeSchema),
    ]);
    if (c.success) {
      setCategorie(c.categorie);
      setNuova((prev) =>
        prev.categoria || c.categorie.length === 0
          ? prev
          : vuota(c.categorie.find((x) => x.attivo)?.codice ?? c.categorie[0].codice)
      );
    } else {
      setErrore(c.error || 'Impossibile caricare le categorie di debito.');
    }
    if (l.success) {
      setLavorazioni(l.lavorazioni);
      setBozze(
        Object.fromEntries(
          l.lavorazioni.map((x) => [
            x.id,
            {
              id: x.id,
              categoria: x.categoria,
              lavorazione: x.lavorazione,
              destinatario: x.destinatario,
              attivo: x.attivo,
            },
          ])
        )
      );
    } else {
      setErrore(l.error || 'Impossibile caricare le lavorazioni.');
    }
    setCaricamento(false);
  };

  useEffect(() => {
    void carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  // Le categorie parametriche sono la scelta normale; i quattro codici legacy
  // restano validi per i dati già inseriti e devono poter essere configurati
  // senza doverli prima ricreare come categorie nuove.
  const opzioniCategorie = [
    ...categorie.map((c) => ({
      codice: c.codice,
      etichetta: c.etichetta,
      attivo: c.attivo,
    })),
    ...TIPI_DEBITO_ENTE.filter((t) => !categorie.some((c) => c.codice === t.valore)).map((t) => ({
      codice: t.valore,
      etichetta: `${t.etichetta} — ${t.descrizione} (legacy)`,
      attivo: true,
    })),
  ];

  const etichetta = (codiceCategoria: string) =>
    opzioniCategorie.find((c) => c.codice === codiceCategoria)?.etichetta ?? codiceCategoria;

  // Una lavorazione può puntare a una categoria cancellata: la riga resta in
  // tabella e non produce nulla, e chi legge non sa se è un errore o una
  // scelta. La si segnala invece di lasciarla indistinguibile.
  const categoriaEsistente = (codiceCategoria: string) =>
    opzioniCategorie.some((c) => c.codice === codiceCategoria);
  const lavorazioniOrfane = lavorazioni.filter((l) => !categoriaEsistente(l.categoria));

  const salva = async (input: InputLavorazioneTipoDebito) => {
    setInCorso(true);
    setErrore(null);
    const r = await salvaLavorazioneTipoDebitoAction(nomeSchema, input);
    if (!r.success) setErrore(r.error || 'Impossibile salvare la lavorazione.');
    else {
      // Dopo un inserimento il modulo si svuota (tranne la tipologia, che
      // spesso si ripete): senza, il testo appena salvato resta lì e un
      // secondo clic crea un duplicato.
      if (input.id == null) setNuova(vuota(input.categoria));
      await carica();
    }
    setInCorso(false);
  };

  const elimina = async (l: LavorazioneTipoDebito) => {
    if (!window.confirm(`Eliminare la lavorazione «${l.lavorazione}»?`)) return;
    setInCorso(true);
    setErrore(null);
    const r = await eliminaLavorazioneTipoDebitoAction(nomeSchema, l.id);
    if (!r.success) setErrore(r.error || 'Impossibile eliminare la lavorazione.');
    else await carica();
    setInCorso(false);
  };

  const modificaBozza = (id: number, patch: Partial<InputLavorazioneTipoDebito>) => {
    setBozze((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  // SOLA LETTURA — la tabella continua a decidere i destinatari delle
  // comunicazioni e dei documenti per reparto, quindi si legge per intero;
  // sparirebbero i comandi, non le informazioni. Il blocco vero è nelle
  // server action: qui il modulo non si mostra nemmeno, così nessuno compila
  // una cosa che verrebbe rifiutata al salvataggio.
  if (LAVORAZIONI_TIPO_DEBITO_SOLA_LETTURA) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-2">
          <ClipboardList className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Lavorazioni per tipologia di debito
            </h2>
            <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
              {AVVISO_LAVORAZIONI_SOLA_LETTURA}
            </p>
          </div>
        </div>

        {errore && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {errore}
          </div>
        )}

        {lavorazioniOrfane.length > 0 && (
          <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
            {`${lavorazioniOrfane.length} ${
              lavorazioniOrfane.length === 1 ? 'lavorazione riguarda' : 'lavorazioni riguardano'
            } una tipologia che non esiste più fra le categorie di debito (${lavorazioniOrfane
              .map((l) => l.categoria)
              .join(', ')}): resta in tabella ma non produce comunicazioni né documenti. Con la
            configurazione in sola lettura non si può né correggerla né eliminarla.`}
          </p>
        )}

        {lavorazioni.length === 0 ? (
          <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-xl p-5">
            Nessuna lavorazione configurata. Con la tabella in sola lettura il triage non può
            preparare comunicazioni ai colleghi né documenti per reparto: le posizioni V.E.R.A.
            restano visibili, senza un destinatario a cui indirizzarle.
          </p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="hidden lg:grid grid-cols-12 gap-3 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <span className="col-span-3">Tipologia</span>
              <span className="col-span-4">Lavorazione</span>
              <span className="col-span-3">Collega / ufficio</span>
              <span className="col-span-2">Stato</span>
            </div>
            {lavorazioni.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-1 lg:grid-cols-12 gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0"
              >
                <div className="lg:col-span-3">
                  <p className="text-[11px] font-bold text-slate-900">{etichetta(l.categoria)}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{l.categoria}</p>
                  {!categoriaEsistente(l.categoria) && (
                    <p className="text-[10px] text-amber-700">Tipologia non più esistente</p>
                  )}
                </div>
                <p className="lg:col-span-4 text-xs text-slate-700">{l.lavorazione}</p>
                <p className="lg:col-span-3 text-xs text-slate-700">{l.destinatario}</p>
                <p
                  className={`lg:col-span-2 text-[10px] font-bold uppercase tracking-wider ${
                    l.attivo ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                >
                  {l.attivo ? 'Attiva' : 'Disattivata'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <ClipboardList className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Lavorazioni per tipologia di debito
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Per ogni categoria di debito indica la lavorazione da svolgere e il collega che se ne
            occupa. Il triage userà questa tabella per preparare le comunicazioni sulla base del
            file V.E.R.A.: il testo resta composto dai dati del file, qui si decide solo che cosa
            chiedere e a chi. Le comunicazioni non vengono inviate automaticamente.
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Le categorie sono quelle di{' '}
            <a
              href={conRitorno(`/spazio/${codice}/parametri/categorie-debito`, ritorno)}
              className="font-bold text-sky-700 hover:underline"
            >
              Categorie tipo debito
            </a>
            . Le sezioni V.E.R.A. si mappano su queste categorie in Posizione V.E.R.A.
          </p>
        </div>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
          Nuova lavorazione
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <label className="lg:col-span-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">
            Tipologia di debito
            <select
              value={nuova.categoria}
              onChange={(e) => setNuova((prev) => ({ ...prev, categoria: e.target.value }))}
              className={`${CLASSE} mt-1`}
            >
              <option value="">Scegli...</option>
              {opzioniCategorie
                .filter((c) => c.attivo)
                .map((c) => (
                  <option key={c.codice} value={c.codice}>
                    {c.etichetta}
                  </option>
                ))}
            </select>
          </label>
          <label className="lg:col-span-4 text-[10px] font-bold uppercase tracking-wider text-slate-600">
            Lavorazione
            <input
              type="text"
              value={nuova.lavorazione}
              onChange={(e) => setNuova((prev) => ({ ...prev, lavorazione: e.target.value }))}
              placeholder="Es. trasmettere le denunce mancanti"
              className={`${CLASSE} mt-1`}
            />
          </label>
          <label className="lg:col-span-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">
            Collega / ufficio
            <input
              type="text"
              value={nuova.destinatario}
              onChange={(e) => setNuova((prev) => ({ ...prev, destinatario: e.target.value }))}
              placeholder="Es. Mario Rossi"
              className={`${CLASSE} mt-1`}
            />
          </label>
          <div className="lg:col-span-2 flex items-end">
            <button
              type="button"
              onClick={() => void salva(nuova)}
              disabled={inCorso}
              className="flex items-center justify-center gap-1.5 w-full bg-sky-600 text-white px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-sky-700 disabled:bg-slate-300"
            >
              <Plus className="w-3.5 h-3.5" /> Aggiungi
            </button>
          </div>
        </div>
        <p className="text-[10px] text-slate-400">
          Una categoria può avere più lavorazioni. La stessa posizione assegnata a due colleghi
          compare in entrambe le comunicazioni: sono due competenze distinte.
        </p>
      </div>

      {lavorazioni.length === 0 ? (
        <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-xl p-5">
          Nessuna lavorazione configurata: il triage preparerà le comunicazioni solo dopo che ne
          avrai aggiunta almeno una.
        </p>
      ) : (
        <div className="space-y-3">
          {lavorazioni.map((l) => {
            const b = bozze[l.id] ?? {
              id: l.id,
              categoria: l.categoria,
              lavorazione: l.lavorazione,
              destinatario: l.destinatario,
              attivo: l.attivo,
            };
            return (
              <div key={l.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                  <label className="lg:col-span-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Tipologia
                    <select
                      value={b.categoria}
                      onChange={(e) => modificaBozza(l.id, { categoria: e.target.value })}
                      className={`${CLASSE} mt-1`}
                    >
                      {opzioniCategorie.map((c) => (
                        <option key={c.codice} value={c.codice}>
                          {c.etichetta}
                          {c.attivo ? '' : ' (disattivata)'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="lg:col-span-4 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Lavorazione
                    <input
                      type="text"
                      value={b.lavorazione}
                      onChange={(e) => modificaBozza(l.id, { lavorazione: e.target.value })}
                      className={`${CLASSE} mt-1`}
                    />
                  </label>
                  <label className="lg:col-span-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Collega / ufficio
                    <input
                      type="text"
                      value={b.destinatario}
                      onChange={(e) => modificaBozza(l.id, { destinatario: e.target.value })}
                      className={`${CLASSE} mt-1`}
                    />
                  </label>
                  <div className="lg:col-span-2 flex items-end gap-2">
                    <button
                      type="button"
                      onClick={() => void salva(b)}
                      disabled={inCorso}
                      className="flex items-center justify-center gap-1.5 flex-1 bg-slate-900 text-white px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 disabled:bg-slate-300"
                    >
                      <Save className="w-3.5 h-3.5" /> Salva
                    </button>
                    <button
                      type="button"
                      onClick={() => void elimina(l)}
                      disabled={inCorso}
                      className="p-2 rounded-lg border border-slate-300 text-slate-500 hover:text-red-700 hover:border-red-300 disabled:opacity-40"
                      aria-label={`Elimina ${l.lavorazione}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-[11px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={b.attivo}
                    onChange={(e) => modificaBozza(l.id, { attivo: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  Attiva: se disattivata, la lavorazione resta in tabella ma non genera
                  comunicazioni.
                </label>
                <p className="text-[10px] text-slate-400">
                  Categoria: {etichetta(l.categoria)} — {l.categoria}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
