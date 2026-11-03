'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Save, Plus, X, Workflow, ArrowRight } from 'lucide-react';
import {
  ottieniDirettriciEnte,
  aggiornaDirettriciEnteAction,
  type DirettriceStrutturata,
} from '@/app/actions/screeningAzienda';
import {
  ottieniLavorazioniMateria,
  riallineaUfficioAllaDirettriceAction,
} from '@/app/actions/materieLavorazione';
import { ottieniTitoliEnteAction } from '@/app/actions/titoliEnte';
import { componiCatenaDirettrici } from '@/lib/titoliEnte/direttrici';
import { conRitorno } from '@/lib/navigazione/ritorno';
import type { LavorazioneMateria } from '@/lib/titoliEnte/lavorazioniMateria';
import type { TitoloEnte } from '@/lib/titoliEnte/titoli';

interface Props {
  nomeSchema: string;
  codice: string;
  /** La pagina da cui si è arrivati: si riporta nei rimandi fra le gestioni. */
  ritorno?: string;
}

const DIRETTRICE_VUOTA: DirettriceStrutturata = { nome: '', prodotti: [] };

// Le direttrici sono il PRIMO anello della catena (0.139.0): il nome scritto qui
// è l'ufficio che le lavorazioni delle materie scelgono come dipendenza, e che i
// titoli di credito ereditano dalla materia fino ai documenti per reparto. Il
// riquadro della catena dice quanto lontano è arrivato ogni nome e che cosa
// manca, perché una catena che funziona e nessuno guarda è una catena che si
// rompe in silenzio.
export function DirettriciEnteConfigManager({ nomeSchema, codice, ritorno }: Props) {
  const [direttrici, setDirettrici] = useState<DirettriceStrutturata[]>([]);
  const [lavorazioni, setLavorazioni] = useState<LavorazioneMateria[]>([]);
  const [titoli, setTitoli] = useState<TitoloEnte[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // L'ufficio fuori elenco scelto per il riallineamento, e la direttrice di
  // destinazione: due clic in tutto — la scelta e il comando.
  const [destinazione, setDestinazione] = useState<Record<string, string>>({});
  const [riallineamentoInCorso, setRiallineamentoInCorso] = useState<string | null>(null);
  const [riallineato, setRiallineato] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const [d, l, t] = await Promise.all([
        ottieniDirettriciEnte(nomeSchema),
        ottieniLavorazioniMateria(nomeSchema),
        ottieniTitoliEnteAction(nomeSchema),
      ]);
      if (d.success) setDirettrici(d.direttrici);
      else setErrore(d.error || 'Impossibile caricare.');
      if (l.success) setLavorazioni(l.lavorazioni);
      if (t.success) setTitoli(t.titoli);
      setCaricamento(false);
    })();
  }, [nomeSchema]);

  const ricaricaLavorazioniETitoli = async () => {
    const [l, t] = await Promise.all([
      ottieniLavorazioniMateria(nomeSchema),
      ottieniTitoliEnteAction(nomeSchema),
    ]);
    if (l.success) setLavorazioni(l.lavorazioni);
    if (t.success) setTitoli(t.titoli);
  };

  // Un ufficio fuori elenco non è un errore da correggere a mano, riga per
  // riga: è un nome che va riportato su una direttrice. Il comando fa tutto —
  // lavorazioni delle materie e titoli che lo dichiarano — e poi ricarica la
  // catena, così il riquadro mostra subito che l'ufficio non c'è più.
  const riallinea = async (ufficio: string, a: string) => {
    // `a` è ciò che il selettore mostra: la scelta dell'utente o, se non c'è,
    // la direttrice suggerita. Così il pulsante sposta sempre dove si vede.
    if (!a) return;
    setRiallineamentoInCorso(ufficio);
    setErrore(null);
    setRiallineato(null);
    setSalvato(false);
    const r = await riallineaUfficioAllaDirettriceAction(nomeSchema, ufficio, a);
    if (!r.success) setErrore(r.error || 'Riallineamento non riuscito.');
    else {
      const n = r.lavorazioni ?? 0;
      const c = r.codici ?? 0;
      setRiallineato(
        `«${ufficio}» ora è «${r.destinazione}»: ${n === 1 ? 'una lavorazione' : `${n} lavorazioni`} e ${c === 1 ? 'un codice' : `${c} codici`} riportati.`
      );
      setDestinazione((prev) => {
        const copia = { ...prev };
        delete copia[ufficio];
        return copia;
      });
      await ricaricaLavorazioniETitoli();
    }
    setRiallineamentoInCorso(null);
  };

  const handleSalva = async () => {
    setSalvataggio(true);
    setSalvato(false);
    setErrore(null);
    const risultato = await aggiornaDirettriciEnteAction(nomeSchema, direttrici);
    if (risultato.success) setSalvato(true);
    else setErrore(risultato.error || 'Impossibile salvare.');
    setSalvataggio(false);
  };

  const aggiungiDirettrice = () => setDirettrici([...direttrici, { ...DIRETTRICE_VUOTA }]);

  const rimuoviDirettrice = (indice: number) =>
    setDirettrici(direttrici.filter((_, i) => i !== indice));

  const rinominaDirettrice = (indice: number, nome: string) => {
    const nuove = [...direttrici];
    nuove[indice] = { ...nuove[indice], nome };
    setDirettrici(nuove);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  // La fotografia si ricalcola a ogni modifica: rinominare una direttrice si
  // vede subito come un ufficio che smette di corrispondere.
  const catena = componiCatenaDirettrici({ direttrici, lavorazioni, titoli });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Direttrici Ente — Screening
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        BLOCCO 1 DELLA CATENA. Qui si scrivono <strong>solo i nomi</strong> delle direttrici: ogni
        nome è anche il nome di un ufficio, quello che i titoli di credito ereditano. I prodotti non
        si creano più in questa schermata — hanno un blocco loro, con il flag per la check list e le
        domande — perché il nome dell’area e il fatto concreto su cui si lavora sono due cose
        diverse e vanno configurate in due passi.
      </p>
      <p className="text-[11px] text-slate-500">
        Qui si scrivono le aree e i fatti concreti. Le <strong>TS</strong> non stanno più sotto il
        prodotto: hanno un{' '}
        <Link
          href={conRitorno(`/spazio/${codice}/parametri/tl`, ritorno)}
          className="font-bold text-sky-700 hover:underline inline-flex items-center gap-0.5"
        >
          catalogo loro <ArrowRight className="w-3 h-3" />
        </Link>{' '}
        — codice, descrizione, flag per la check list — e la{' '}
        <Link
          href={conRitorno(`/spazio/${codice}/parametri/materie-lavorazione`, ritorno)}
          className="font-bold text-sky-700 hover:underline"
        >
          materia
        </Link>{' '}
        le applica a una direttrice e a un prodotto, scrivendo lì ufficio, passi ed esito.
      </p>
      <p className="text-[11px] text-slate-500">
        Il nome di ogni direttrice è anche il <strong>nome dell&apos;ufficio</strong>: le{' '}
        <Link
          href={conRitorno(`/spazio/${codice}/parametri/materie-lavorazione`, ritorno)}
          className="font-bold text-sky-700 hover:underline inline-flex items-center gap-0.5"
        >
          lavorazioni delle materie <ArrowRight className="w-3 h-3" />
        </Link>{' '}
        lo scelgono come dipendenza, i{' '}
        <Link
          href={conRitorno(`/spazio/${codice}/parametri/titoli-ente`, ritorno)}
          className="font-bold text-sky-700 hover:underline inline-flex items-center gap-0.5"
        >
          titoli di credito <ArrowRight className="w-3 h-3" />
        </Link>{' '}
        lo ereditano dalla materia, e da lì arriva nelle comunicazioni ai reparti e nel report per
        unità operativa. Si scrive una volta, qui.
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}
      {salvato && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          Direttrici aggiornate.
        </div>
      )}
      {riallineato && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          {riallineato}
        </div>
      )}

      {catena.voci.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Workflow className="w-3.5 h-3.5 text-slate-500" />
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
              La catena — direttrici, lavorazioni, titoli
            </h3>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Che cosa arriva a ogni ufficio: le lavorazioni delle materie che lo hanno scelto, le
            materie coinvolte e i codici di partita che ci finiscono — con la dipendenza del codice,
            o quella ereditata dalla materia quando il codice non ne ha una.
          </p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-wider text-slate-400 text-left">
                <th className="py-1 font-bold">Direttrice</th>
                <th className="py-1 font-bold text-right">Lavorazioni</th>
                <th className="py-1 font-bold text-right">Materie</th>
                <th className="py-1 font-bold text-right">Codici</th>
              </tr>
            </thead>
            <tbody>
              {catena.voci.map((v) => (
                <tr key={v.nome} className="border-t border-slate-200">
                  <td className="py-1.5 pr-2 text-slate-800">{v.nome}</td>
                  <td
                    className={`py-1.5 text-right tabular-nums ${
                      v.lavorazioni === 0 ? 'text-amber-800 font-bold' : 'text-slate-700'
                    }`}
                  >
                    {v.lavorazioni === 0 ? 'nessuna' : v.lavorazioni}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">{v.materie}</td>
                  <td
                    className={`py-1.5 text-right tabular-nums ${
                      v.codici === 0 ? 'text-amber-800' : 'text-slate-700'
                    }`}
                  >
                    {v.codici}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {catena.fuoriElenco.length > 0 && (
            <div className="border-t border-slate-200 pt-2 space-y-1.5">
              <p className="text-[10px] text-amber-800 leading-relaxed">
                Uffici in uso che non sono direttrici: o sono uffici da aggiungere qui, o sono nomi
                vecchi da riportare a una direttrice — finché restano fuori, quel destinatario ha un
                nome che vale solo per sé. Scegli la direttrice e riportacelo: vengono spostate
                anche le lavorazioni delle materie che lo nominano.
              </p>
              {catena.fuoriElenco.map((u) => {
                // Il suggerimento è la direttrice che sembra lo stesso ufficio
                // scritto in un altro modo: se è una sola si preseleziona, e il
                // riallineamento costa un clic. Se sono più d'una non si sceglie
                // per l'ente — due sedi possono chiamarsi quasi uguale — e resta
                // il selettore vuoto, con l'avviso di quali sono.
                const suggerita = u.somigliaA.length === 1 ? u.somigliaA[0] : '';
                const scelta = destinazione[u.nome] ?? suggerita;
                const inCorso = riallineamentoInCorso === u.nome;
                return (
                  <div
                    key={u.nome}
                    className="flex flex-wrap items-center gap-2 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5"
                  >
                    <span className="text-[11px] font-bold text-slate-800">{u.nome}</span>
                    <span className="text-[10px] text-slate-500 tabular-nums">
                      {u.lavorazioni === 1 ? '1 lavorazione' : `${u.lavorazioni} lavorazioni`} ·{' '}
                      {u.codici === 1 ? '1 codice' : `${u.codici} codici`}
                    </span>
                    {u.somigliaA.length > 0 && (
                      <span className="text-[10px] text-amber-900 w-full leading-relaxed">
                        {u.somigliaA.length === 1
                          ? `Sembra lo stesso ufficio di «${u.somigliaA[0]}», scritto in un altro modo: la direzione è già indicata.`
                          : `Sembra lo stesso ufficio di ${u.somigliaA
                              .map((n) => `«${n}»`)
                              .join(' e ')}: scegli tu quale — potrebbero essere due sedi diverse.`}
                      </span>
                    )}
                    <select
                      aria-label={`Direttrice a cui riportare ${u.nome}`}
                      value={scelta}
                      onChange={(e) =>
                        setDestinazione({ ...destinazione, [u.nome]: e.target.value })
                      }
                      className="ml-auto p-1.5 text-[11px] border border-slate-200 rounded-lg text-slate-900 bg-white max-w-[16rem]"
                    >
                      <option value="">Riporta a…</option>
                      {catena.voci
                        .filter((v) => v.nome.trim() !== '')
                        .map((v) => (
                          <option key={v.nome} value={v.nome}>
                            {v.nome}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void riallinea(u.nome, scelta)}
                      disabled={!scelta || inCorso}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
                    >
                      <ArrowRight className="w-3 h-3" />
                      {inCorso ? 'Sposto…' : 'Riporta'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {catena.lavorazioniSenzaUfficio > 0 && (
            <p className="text-[10px] text-amber-800 leading-relaxed">
              {catena.lavorazioniSenzaUfficio === 1
                ? 'Una lavorazione delle materie non ha ancora un ufficio: le sue posizioni non sanno a chi andare.'
                : `${catena.lavorazioniSenzaUfficio} lavorazioni delle materie non hanno ancora un ufficio: le loro posizioni non sanno a chi andare.`}
            </p>
          )}
          {catena.codiciSenzaUfficio > 0 && (
            <p className="text-[10px] text-slate-500 leading-relaxed">
              {catena.codiciSenzaUfficio === 1
                ? 'Un codice non arriva a nessun ufficio.'
                : `${catena.codiciSenzaUfficio} codici non arrivano a nessun ufficio.`}{' '}
              Succede quando il codice e la sua materia non hanno una dipendenza: si risolve nella
              lavorazione della materia.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {direttrici.map((d, indice) => (
          <div key={indice} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={d.nome}
                onChange={(e) => rinominaDirettrice(indice, e.target.value)}
                placeholder="Nome direttrice — es. Vigilanza documentale"
                className="flex-1 p-2 text-xs font-bold border border-slate-200 rounded-lg text-slate-900 bg-white"
              />
              <button
                type="button"
                onClick={() => rimuoviDirettrice(indice)}
                className="text-slate-400 hover:text-red-600 shrink-0"
                title="Rimuovi direttrice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {d.prodotti.length === 0 ? (
                <span className="text-[10px] text-amber-800 leading-relaxed">
                  Nessun prodotto in questa direttrice: aggiungilo nel blocco{' '}
                  <Link
                    href={conRitorno(`/spazio/${codice}/parametri/prodotti`, ritorno)}
                    className="font-bold underline"
                  >
                    Prodotti dell’ente
                  </Link>
                  .
                </span>
              ) : (
                d.prodotti.map((prodotto, indiceProdotto) => (
                  <span
                    key={indiceProdotto}
                    className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-md"
                  >
                    {prodotto}
                  </span>
                ))
              )}
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              I prodotti di questa direttrice si configurano in{' '}
              <Link
                href={conRitorno(`/spazio/${codice}/parametri/prodotti`, ritorno)}
                className="font-bold text-sky-700 hover:underline"
              >
                Prodotti dell’ente
              </Link>
              , dove si sceglie anche se entrano nella check list e con quali domande.
            </p>
          </div>
        ))}

        <button
          type="button"
          onClick={aggiungiDirettrice}
          className="flex items-center gap-1.5 px-4 py-2.5 border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 text-slate-500 hover:text-blue-700 font-bold text-xs uppercase rounded-lg transition-colors w-full justify-center"
        >
          <Plus className="w-3.5 h-3.5" /> Aggiungi direttrice
        </button>

        <button
          type="button"
          onClick={handleSalva}
          disabled={salvataggio}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
        >
          <Save className="w-3.5 h-3.5" /> {salvataggio ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>
    </div>
  );
}
