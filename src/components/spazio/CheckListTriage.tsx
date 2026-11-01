'use client';

// LA CHECK LIST NEL TRIAGE (0.154.0).
//
// Prima viveva in due schede dell'Azienda: lo Screening generava il
// questionario, la Check List lo mostrava per le risposte. Due passi dello
// stesso atto, in due pagine, con il semaforo che diceva quando una era
// finita. Qui sono nello stesso posto, dentro il triage: si genera e si
// risponde senza cambiare pagina.
//
// LA GENERAZIONE NON SALTA I PARAMETRI DELL'ENTE. Lo screening si elabora
// solo quando l'azienda si riconosce con i riferimenti interni dell'ente
// (matricola, posizione…): senza, l'elaborato non porta con sé il modo in cui
// l'ente ritrova i propri documenti, e la ricerca va rifatta ogni volta. È il
// motivo per cui la generazione automatica parte al salvataggio
// dell'Anagrafica Ente. Qui il pulsante c'è, e quando i parametri mancano lo
// dice con il collegamento al passo che li raccoglie, invece di restare
// spento senza spiegazione.
//
// LA VISURA NON SI CHIEDE DUE VOLTE. Se il triage l'ha già caricata, si usa
// quella trattenuta: è lo stesso documento, letto poche schermate prima.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks, Sparkles, Upload, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  generaScreeningAziendaAction,
  ottieniScreeningAzienda,
  salvaRispostaScreeningAction,
  type StatoScreeningAzienda,
} from '@/app/actions/screeningAzienda';
import { ottieniVisuraTriageAction, registraVisuraTriageAction } from '@/app/actions/visuraTriage';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  codice: string;
  /** La visura scelta in questa sessione di triage, se c'è. */
  visuraSessione?: File | null;
}

export function CheckListTriage({ nomeSchema, aziendaId, codice, visuraSessione }: Props) {
  const [stato, setStato] = useState<StatoScreeningAzienda | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [generazione, setGenerazione] = useState(false);
  const [secondi, setSecondi] = useState(0);
  const [errore, setErrore] = useState<string | null>(null);
  const [fileScelto, setFileScelto] = useState<File | null>(null);
  const [visuraTrattenuta, setVisuraTrattenuta] = useState<string | null>(null);
  const [rispostaInCorso, setRispostaInCorso] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    const r = await ottieniScreeningAzienda(nomeSchema, aziendaId);
    if (r.success) setStato(r.stato);
    else setErrore(r.error ?? 'Lettura non riuscita.');
    setCaricamento(false);
  };

  useEffect(() => {
    void carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  // La visura trattenuta dal triage: si legge quando manca il questionario,
  // perché è solo lì che serve.
  useEffect(() => {
    if (stato?.esiste) return;
    let annullato = false;
    void ottieniVisuraTriageAction(nomeSchema, aziendaId).then((r) => {
      if (annullato) return;
      if (r.success && r.visura) setVisuraTrattenuta(r.visura.nome);
    });
    return () => {
      annullato = true;
    };
  }, [nomeSchema, aziendaId, stato?.esiste]);

  // Il tempo della generazione: due minuti e mezzo passano in fretta se non
  // si sa che il lavoro sta andando avanti.
  useEffect(() => {
    if (!generazione) return;
    setSecondi(0);
    const t = setInterval(() => setSecondi((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [generazione]);

  const genera = async () => {
    setErrore(null);
    setGenerazione(true);
    try {
      let url: string | null = null;
      let nome: string | null = null;
      const file = fileScelto ?? visuraSessione ?? null;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('codice', codice);
        const up = await fetch('/api/blob-upload', { method: 'POST', body: fd });
        const corpo = await up.json().catch(() => ({}));
        if (!up.ok || corpo.error) {
          setErrore(`Caricamento della visura non riuscito: ${corpo.error ?? `HTTP ${up.status}`}`);
          return;
        }
        url = corpo.url as string;
        nome = file.name;
        await registraVisuraTriageAction(nomeSchema, aziendaId, url, nome);
      } else {
        const v = await ottieniVisuraTriageAction(nomeSchema, aziendaId);
        if (v.success && v.visura) {
          url = v.visura.url;
          nome = v.visura.nome;
        }
      }
      if (!url || !nome) {
        setErrore(
          'Per generare la check list serve il fascicolo storico (visura in PDF): caricalo qui sopra.'
        );
        return;
      }
      const r = await generaScreeningAziendaAction(nomeSchema, aziendaId, url, nome);
      if (r.success) {
        setFileScelto(null);
        await carica();
      } else {
        setErrore(r.error ?? 'Generazione non riuscita.');
      }
    } catch (e) {
      setErrore(`Generazione non riuscita: ${String(e)}`);
    } finally {
      setGenerazione(false);
    }
  };

  const rispondi = async (domandaId: string, risposta: boolean) => {
    if (!stato) return;
    const corrente = stato.risposte.find((r) => r.domandaId === domandaId)?.risposta;
    // Ricliccare la risposta già data la toglie: la domanda torna in attesa,
    // non resta una risposta che nessuno ha confermato.
    const nuovoValore: boolean | null = corrente === risposta ? null : risposta;
    setRispostaInCorso(domandaId);
    setErrore(null);
    const r = await salvaRispostaScreeningAction(
      nomeSchema,
      aziendaId,
      domandaId,
      nuovoValore,
      null
    );
    if (r.success) {
      // Si rilegge lo stato dal server: il punteggio e l'esito si calcolano
      // là, e aggiornarli solo a schermo mostrerebbe un numero che il
      // database non conosce.
      await carica();
    } else {
      setErrore(r.error ?? 'Risposta non salvata.');
    }
    setRispostaInCorso(null);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento della check list…</p>;

  const domande = stato?.sezioni.flatMap((s) => s.domande) ?? [];
  const risposte = domande.filter(
    (d) => stato?.risposte.find((r) => r.domandaId === d.id)?.risposta != null
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-slate-900 uppercase text-xs tracking-wider">
            <ListChecks className="w-4 h-4 text-slate-500" />
            Check list dello screening
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 max-w-3xl leading-relaxed">
            Le domande generate dalle direttrici di questo ente per questa azienda. Un «Sì» è sempre
            una buona notizia, un «No» sempre una criticità: la regola vale per costruzione, non per
            interpretazione.
          </p>
        </div>
        {stato?.esiste && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {risposte}/{domande.length} risposte
          </span>
        )}
      </div>

      {errore && (
        <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-1">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{errore}</span>
          </p>
          {errore.includes('parametro dell’ente') && (
            <Link
              href={`/spazio/${codice}/aziende/${aziendaId}/posizione-ente`}
              className="inline-block font-bold underline"
            >
              Vai a Posizione Ente → Anagrafica Ente
            </Link>
          )}
        </div>
      )}

      {!stato?.esiste ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            Per questa azienda il questionario non è ancora stato generato. Si costruisce dal
            fascicolo storico e dai dati già in archivio, sulle direttrici dell’ente.
          </p>
          {visuraSessione || visuraTrattenuta || fileScelto ? (
            <p className="text-[11px] text-slate-500">
              Visura disponibile:{' '}
              <b>{fileScelto?.name ?? visuraSessione?.name ?? visuraTrattenuta}</b> — non serve
              ricaricarla.
            </p>
          ) : (
            <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> Carica il fascicolo storico
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => setFileScelto(e.target.files?.[0] ?? null)}
              />
            </label>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void genera()}
              disabled={generazione || (!visuraSessione && !visuraTrattenuta && !fileScelto)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold uppercase tracking-wider rounded-lg text-[10px]"
            >
              {generazione ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {generazione ? `Generazione in corso… ${secondi}s` : 'Genera la check list'}
            </button>
            {generazione && (
              <span className="text-[10px] text-slate-500">
                Può richiedere fino a due minuti e mezzo: non chiudere la pagina.
              </span>
            )}
          </div>

          {!visuraSessione && !visuraTrattenuta && (
            <p className="text-[10px] text-slate-400">
              La visura camerale è il documento di partenza; il bilancio XBRL, se caricato, entra
              nella relazione di inquadramento.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {stato.quadro && (
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Esito
              </span>
              <span className="text-sm font-bold text-slate-900">
                {stato.quadro.etichetta}
                {stato.quadro.punteggio !== null && (
                  <span className="font-normal text-slate-500">
                    {' '}
                    — punteggio {stato.quadro.punteggio > 0 ? '+' : ''}
                    {stato.quadro.punteggio.toFixed(1)}
                  </span>
                )}
              </span>
            </div>
          )}

          {stato.sezioni.map((sez) => (
            <div key={sez.numero} className="bg-white border border-slate-200 rounded-xl p-4">
              <h4 className="font-bold text-slate-900 text-xs mb-2">{sez.titolo}</h4>
              <div className="space-y-2">
                {sez.domande.map((d) => {
                  const r = stato.risposte.find((x) => x.domandaId === d.id)?.risposta;
                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-3 border-b border-slate-50 pb-2 last:border-0 last:pb-0"
                    >
                      <span className="text-xs text-slate-700 flex-1">{d.domanda}</span>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void rispondi(d.id, true)}
                          disabled={rispostaInCorso === d.id}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-colors disabled:opacity-50 ${
                            r === true
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          Sì
                        </button>
                        <button
                          type="button"
                          onClick={() => void rispondi(d.id, false)}
                          disabled={rispostaInCorso === d.id}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-colors disabled:opacity-50 ${
                            r === false
                              ? 'bg-red-600 text-white'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {stato.quadro && (
            <p className="flex items-center gap-1.5 text-[11px] text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Tutte le domande hanno una risposta — esito calcolato.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
