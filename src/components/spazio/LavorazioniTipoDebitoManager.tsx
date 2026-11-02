'use client';

// LAVORAZIONI PER TIPOLOGIA DI DEBITO.
//
// Dalla 0.158.0 questa pagina non scrive una tabella propria: per ogni
// categoria di debito sceglie quali TS del catalogo la lavorano. L'ufficio e la
// procedura si scrivono una volta sola, nei Parametri › Direttrici, sotto il
// prodotto a cui la TS si applica; qui resta solo il collegamento. Così non
// esistono due elenchi di uffici da tenere allineati a mano.

import React, { useEffect, useState } from 'react';
import { ClipboardList, Link2, Link2Off } from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import {
  ottieniCategorieTipoDebito,
  type CategoriaTipoDebito,
} from '@/app/actions/categorieTipoDebito';
import {
  ottieniLavorazioniTipoDebito,
  collegaCategoriaTlAction,
  scollegaCategoriaTlAction,
  type LavorazioneTipoDebito,
} from '@/app/actions/lavorazioniTipoDebito';
import { ottieniCatalogoTl } from '@/app/actions/materieLavorazione';
import { etichettaTl, type Tl } from '@/lib/titoliEnte/catalogoTl';
import { TIPI_DEBITO_ENTE } from '@/lib/debitiEnte/tipoDebito';
import { conRitorno } from '@/lib/navigazione/ritorno';

interface Props {
  nomeSchema: string;
  codice: string;
  /** La pagina da cui si è arrivati: si riporta nei rimandi fra le gestioni. */
  ritorno?: string;
}

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

export function LavorazioniTipoDebitoManager({ nomeSchema, codice, ritorno }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Lavorazioni per tipologia di debito',
  });

  const [categorie, setCategorie] = useState<CategoriaTipoDebito[]>([]);
  const [lavorazioni, setLavorazioni] = useState<LavorazioneTipoDebito[]>([]);
  const [catalogo, setCatalogo] = useState<Tl[]>([]);
  const [scelte, setScelte] = useState<Record<string, string>>({});
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    setErrore(null);
    const [c, l, t] = await Promise.all([
      ottieniCategorieTipoDebito(nomeSchema),
      ottieniLavorazioniTipoDebito(nomeSchema),
      ottieniCatalogoTl(nomeSchema),
    ]);
    if (c.success) setCategorie(c.categorie);
    else setErrore(c.error || 'Impossibile caricare le categorie di debito.');
    if (l.success) setLavorazioni(l.lavorazioni);
    else setErrore(l.error || 'Impossibile caricare le lavorazioni.');
    if (t.success) setCatalogo(t.tl);
    else setErrore(t.error || 'Impossibile caricare il catalogo delle TS.');
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

  const categoriaEsistente = (codiceCategoria: string) =>
    opzioniCategorie.some((c) => c.codice === codiceCategoria);
  // Un collegamento può puntare a una categoria cancellata: la riga resta e
  // non produce nulla. La si segnala invece di lasciarla indistinguibile.
  const orfane = lavorazioni.filter((l) => !categoriaEsistente(l.categoria));

  const descrizioneTl = (tl: Tl) => etichettaTl(tl);

  const collega = async (categoria: string) => {
    const scelto = Number(scelte[categoria] ?? '');
    if (!Number.isInteger(scelto) || scelto <= 0) return;
    setInCorso(true);
    setErrore(null);
    const r = await collegaCategoriaTlAction(nomeSchema, categoria, scelto);
    if (!r.success) setErrore(r.error || 'Impossibile collegare la TS.');
    else {
      setScelte((prev) => ({ ...prev, [categoria]: '' }));
      await carica();
    }
    setInCorso(false);
  };

  const scollega = async (l: LavorazioneTipoDebito) => {
    setInCorso(true);
    setErrore(null);
    const r = await scollegaCategoriaTlAction(nomeSchema, l.categoria, l.id);
    if (!r.success) setErrore(r.error || 'Impossibile scollegare la TS.');
    else await carica();
    setInCorso(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const senzaLavorazione = opzioniCategorie.filter(
    (c) => !lavorazioni.some((l) => l.categoria === c.codice)
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <ClipboardList className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Lavorazioni per tipologia di debito
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Per ogni categoria di debito, quali TS del catalogo la lavorano. La TS — codice,
            descrizione, flag per la check list — si scrive una volta sola nel catalogo; ufficio e
            procedura sono quelli dell’associazione della materia che la usa. Il triage legge questi
            collegamenti per preparare le comunicazioni sul file della certificazione dei debiti: le
            comunicazioni non vengono inviate automaticamente.
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Le categorie sono quelle di{' '}
            <a
              href={conRitorno(`/spazio/${codice}/parametri/categorie-debito`, ritorno)}
              className="font-bold text-sky-700 hover:underline"
            >
              Categorie tipo debito
            </a>
            ; le TS si scrivono nel{' '}
            <a
              href={conRitorno(`/spazio/${codice}/parametri/tl`, ritorno)}
              className="font-bold text-sky-700 hover:underline"
            >
              Catalogo delle TS
            </a>{' '}
            e si applicano alle materie in{' '}
            <a
              href={conRitorno(`/spazio/${codice}/parametri/materie-lavorazione`, ritorno)}
              className="font-bold text-sky-700 hover:underline"
            >
              Materie e TS
            </a>
            . Le sezioni della certificazione dei debiti si mappano su queste categorie in
            Certificazione dei debiti
          </p>
        </div>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      {orfane.length > 0 && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
          {`${orfane.length} ${
            orfane.length === 1 ? 'collegamento riguarda' : 'collegamenti riguardano'
          } una categoria che non esiste più fra le categorie di debito (${orfane
            .map((l) => l.categoria)
            .join(', ')}): resta in tabella ma non produce comunicazioni né documenti.`}
        </p>
      )}

      {senzaLavorazione > 0 && (
        <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 leading-relaxed">
          {`${senzaLavorazione} ${
            senzaLavorazione === 1 ? 'categoria non ha' : 'categorie non hanno'
          } ancora una TS: le posizioni di quelle tipologie restano fuori dai documenti del triage finché non ne colleghi una.`}
        </p>
      )}

      {catalogo.length === 0 && (
        <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-xl p-5">
          Il catalogo delle TS è vuoto. Scrivile prima nel{' '}
          <a
            href={conRitorno(`/spazio/${codice}/parametri/tl`, ritorno)}
            className="font-bold text-sky-700 hover:underline"
          >
            Catalogo delle TS
          </a>
          : qui si collegano soltanto.
        </p>
      )}

      <div className="space-y-3">
        {opzioniCategorie.map((c) => {
          const collegate = lavorazioni.filter((l) => l.categoria === c.codice);
          const disponibili = catalogo.filter((t) => !collegate.some((l) => l.id === t.id));
          return (
            <div
              key={c.codice}
              className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-[11px] font-bold text-slate-900">{c.etichetta}</p>
                <p className="text-[10px] text-slate-400 font-mono">{c.codice}</p>
                {!c.attivo && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    disattivata
                  </span>
                )}
              </div>

              {collegate.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  Nessuna TS collegata: le posizioni di questa tipologia restano fuori dai
                  documenti.
                </p>
              ) : (
                <ul className="space-y-1">
                  {collegate.map((l) => (
                    <li
                      key={`${l.categoria}:${l.id}`}
                      className="flex items-start justify-between gap-3 border border-slate-100 rounded-lg px-3 py-2"
                    >
                      <div>
                        <p className="text-xs text-slate-800">{l.lavorazione}</p>
                        <p className="text-[10px] text-slate-500">
                          {l.destinatario || 'ufficio non indicato'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void scollega(l)}
                        disabled={inCorso}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 text-slate-500 hover:text-red-700 hover:border-red-300 text-[10px] font-bold uppercase disabled:opacity-40"
                      >
                        <Link2Off className="w-3 h-3" /> Scollega
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {disponibili.length > 0 && (
                <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
                  <select
                    value={scelte[c.codice] ?? ''}
                    onChange={(e) => setScelte({ ...scelte, [c.codice]: e.target.value })}
                    className={CLASSE}
                    aria-label={`TS da collegare a ${c.codice}`}
                  >
                    <option value="">Scegli una TS del catalogo...</option>
                    {disponibili.map((t) => (
                      <option key={t.id} value={t.id}>
                        {descrizioneTl(t)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void collega(c.codice)}
                    disabled={inCorso || !scelte[c.codice]}
                    className="flex items-center justify-center gap-1.5 bg-sky-600 text-white px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-sky-700 disabled:bg-slate-300 shrink-0"
                  >
                    <Link2 className="w-3.5 h-3.5" /> Collega
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {orfane.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
            Collegamenti a categorie non più esistenti
          </p>
          {orfane.map((l) => (
            <div key={`${l.categoria}:${l.id}`} className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-700">
                {l.categoria} — {l.lavorazione} ({l.destinatario || 'ufficio non indicato'})
              </p>
              <button
                type="button"
                onClick={() => void scollega(l)}
                disabled={inCorso}
                className="px-2 py-1 rounded-lg border border-slate-300 text-slate-500 hover:text-red-700 hover:border-red-300 text-[10px] font-bold uppercase disabled:opacity-40"
              >
                Rimuovi
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
