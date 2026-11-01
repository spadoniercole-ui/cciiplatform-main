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
// l'ente ritrova i propri documenti, e la ricerca va rifatta ogni volta.
//
// I PARAMETRI SI RACCOLGONO QUI (0.155.0). Prima, per un'azienda nuova, il
// triage si fermava con un collegamento ad Anagrafica Ente: si usciva dalla
// verifica per compilare un modulo, e si tornava. Ora i campi dell'ente sono
// nel blocco stesso, con le etichette configurate dallo spazio: si salvano sul
// posto e la generazione prosegue, senza lasciare il triage. Il vincolo non
// cambia — l'elaborato nasce solo con i riferimenti dell'ente — cambia il
// giro che serve per averli.
//
// IL TESTO DELLE DOMANDE SI CORREGGE DA QUI (0.155.0). La matita accanto alla
// domanda ne cambia il testo; il pulsante di correzione rilegge le domande
// esistenti e riformula solo quelle con la polarità sbagliata («Sì» deve
// essere sempre la buona notizia). Erano due funzioni della scheda Screening:
// chi si accorge di una domanda scritta male mentre risponde non deve
// interrompere la verifica e andare in un'altra pagina. L'`id` della domanda
// non cambia mai, quindi le risposte già date restano agganciate.
//
// LA VISURA NON SI CHIEDE DUE VOLTE. Se il triage l'ha già caricata, si usa
// quella trattenuta: è lo stesso documento, letto poche schermate prima.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ListChecks,
  Sparkles,
  Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Check,
  X,
  Wand2,
} from 'lucide-react';
import {
  generaScreeningAziendaAction,
  ottieniScreeningAzienda,
  salvaRispostaScreeningAction,
  aggiornaTestoDomandaScreeningAction,
  correggiPolaritaScreeningAction,
  type StatoScreeningAzienda,
} from '@/app/actions/screeningAzienda';
import { ottieniVisuraTriageAction, registraVisuraTriageAction } from '@/app/actions/visuraTriage';
import {
  ottieniEtichetteAnagraficaEnte,
  type EtichettaAnagraficaEnte,
} from '@/app/actions/anagraficaEnteConfig';
import {
  ottieniAnagraficaEnte,
  salvaAnagraficaEnteAction,
  type AnagraficaEnte,
} from '@/app/actions/anagraficaEnte';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  codice: string;
  /** La visura scelta in questa sessione di triage, se c'è. */
  visuraSessione?: File | null;
}

const CLASSE_CAMPO =
  'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

export function CheckListTriage({ nomeSchema, aziendaId, codice, visuraSessione }: Props) {
  const [stato, setStato] = useState<StatoScreeningAzienda | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [generazione, setGenerazione] = useState(false);
  const [secondi, setSecondi] = useState(0);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [fileScelto, setFileScelto] = useState<File | null>(null);
  const [visuraTrattenuta, setVisuraTrattenuta] = useState<string | null>(null);
  const [rispostaInCorso, setRispostaInCorso] = useState<string | null>(null);

  // Correzione del testo di una domanda.
  const [domandaInModifica, setDomandaInModifica] = useState<string | null>(null);
  const [testoInModifica, setTestoInModifica] = useState('');
  const [salvataggioTesto, setSalvataggioTesto] = useState(false);

  // Correzione della polarità delle domande già generate.
  const [correzionePolarita, setCorrezionePolarita] = useState(false);

  // Identificativi dell'ente, quando mancano: si raccolgono qui.
  const [etichette, setEtichette] = useState<EtichettaAnagraficaEnte[]>([]);
  const [anagrafica, setAnagrafica] = useState<AnagraficaEnte | null>(null);
  const [salvataggioAnagrafica, setSalvataggioAnagrafica] = useState(false);

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

  // SENZA IDENTIFICATIVI NON SI GENERA: i campi si aprono qui, con le
  // etichette che l'ente ha configurato per lo spazio (matricola, posizione…).
  const senzaIdentificativi =
    stato !== null && !stato.esiste && (stato.identificativiEnte?.length ?? 0) === 0;

  useEffect(() => {
    if (!senzaIdentificativi) return;
    let annullato = false;
    void Promise.all([
      ottieniEtichetteAnagraficaEnte(nomeSchema),
      ottieniAnagraficaEnte(nomeSchema, aziendaId),
    ]).then(([et, an]) => {
      if (annullato) return;
      if (et.success) setEtichette(et.etichette);
      if (an.success) setAnagrafica(an.dati);
    });
    return () => {
      annullato = true;
    };
  }, [nomeSchema, aziendaId, senzaIdentificativi]);

  const valoreCampo = (campo: number) =>
    anagrafica
      ? ((anagrafica as unknown as Record<string, string | null>)[`campo${campo}`] ?? '')
      : '';

  const impostaCampo = (campo: number, valore: string) =>
    setAnagrafica((prev) =>
      prev
        ? ({ ...prev, [`campo${campo}`]: valore.trim() ? valore : null } as AnagraficaEnte)
        : prev
    );

  const salvaIdentificativi = async () => {
    if (!anagrafica) return;
    setSalvataggioAnagrafica(true);
    setErrore(null);
    setAvviso(null);
    const r = await salvaAnagraficaEnteAction(nomeSchema, aziendaId, anagrafica);
    if (r.success) {
      setAvviso(
        'Identificativi dell’ente salvati: la check list può essere generata. Restano nell’Anagrafica Ente e li ritrovi in Posizione Ente.'
      );
      await carica();
    } else {
      setErrore(r.error ?? 'Identificativi non salvati.');
    }
    setSalvataggioAnagrafica(false);
  };

  const genera = async () => {
    setErrore(null);
    setAvviso(null);
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

  const salvaTesto = async (domandaId: string) => {
    setSalvataggioTesto(true);
    setErrore(null);
    setAvviso(null);
    const r = await aggiornaTestoDomandaScreeningAction(
      nomeSchema,
      aziendaId,
      domandaId,
      testoInModifica
    );
    if (r.success) {
      setDomandaInModifica(null);
      setTestoInModifica('');
      setAvviso(
        'Testo della domanda aggiornato. Le risposte già date restano sulla stessa domanda.'
      );
      await carica();
    } else {
      setErrore(r.error ?? 'Testo non salvato.');
    }
    setSalvataggioTesto(false);
  };

  const correggiPolarita = async () => {
    setCorrezionePolarita(true);
    setErrore(null);
    setAvviso(null);
    const r = await correggiPolaritaScreeningAction(nomeSchema, aziendaId);
    if (r.success) {
      setAvviso(
        r.domandeCorrette === 0
          ? 'Nessuna domanda ha la polarità invertita: il questionario è già scritto con «Sì» come buona notizia.'
          : `Polarità corretta: ${r.domandeCorrette} ${
              r.domandeCorrette === 1 ? 'domanda riformulata' : 'domande riformulate'
            }, ${r.risposteInvertite} ${
              r.risposteInvertite === 1 ? 'risposta invertita' : 'risposte invertite'
            } per restare aderenti al fatto rappresentato.`
      );
      await carica();
    } else {
      setErrore(r.error ?? 'Correzione non riuscita.');
    }
    setCorrezionePolarita(false);
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
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => void correggiPolarita()}
              disabled={correzionePolarita}
              title="Rilegge le domande e riformula solo quelle in cui «Sì» non è la buona notizia"
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 disabled:bg-slate-100 text-slate-700 font-bold uppercase tracking-wider rounded-lg text-[10px]"
            >
              {correzionePolarita ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5" />
              )}
              {correzionePolarita ? 'Correzione…' : 'Correggi polarità'}
            </button>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {risposte}/{domande.length} risposte
            </span>
          </div>
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

      {avviso && (
        <p className="flex items-start gap-1.5 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{avviso}</span>
        </p>
      )}

      {!stato?.esiste ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            Per questa azienda il questionario non è ancora stato generato. Si costruisce dal
            fascicolo storico e dai dati già in archivio, sulle direttrici dell’ente.
          </p>

          {senzaIdentificativi && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
                Identificativi dell’ente per questa azienda
              </p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Servono per generare: l’elaborato deve portare i riferimenti interni con cui l’ente
                ritrova i documenti dell’azienda (matricola, posizione…). Si salvano qui e restano
                nell’Anagrafica Ente, senza uscire dal triage.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {etichette
                  .filter((e) => e.attivo)
                  .map((e) => (
                    <label
                      key={e.campo}
                      className="text-[10px] font-bold uppercase tracking-wider text-slate-600"
                    >
                      {e.etichetta}
                      <input
                        type="text"
                        value={valoreCampo(e.campo)}
                        onChange={(ev) => impostaCampo(e.campo, ev.target.value)}
                        className={`${CLASSE_CAMPO} mt-1`}
                      />
                    </label>
                  ))}
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  ID Ente
                  <input
                    type="text"
                    value={anagrafica?.idEnte ?? ''}
                    onChange={(ev) =>
                      setAnagrafica((prev) =>
                        prev
                          ? { ...prev, idEnte: ev.target.value.trim() ? ev.target.value : null }
                          : prev
                      )
                    }
                    className={`${CLASSE_CAMPO} mt-1`}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void salvaIdentificativi()}
                disabled={salvataggioAnagrafica || !anagrafica}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold uppercase tracking-wider rounded-lg text-[10px]"
              >
                {salvataggioAnagrafica ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Salva identificativi
              </button>
              <p className="text-[10px] text-slate-400">
                Le etichette dei campi si impostano in Parametri di Spazio → Anagrafica Ente.
              </p>
            </div>
          )}

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
              disabled={
                generazione ||
                senzaIdentificativi ||
                (!visuraSessione && !visuraTrattenuta && !fileScelto)
              }
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
            {senzaIdentificativi && !generazione && (
              <span className="text-[10px] text-slate-500">
                Salva prima gli identificativi dell’ente: la generazione li usa.
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
                  const inModifica = domandaInModifica === d.id;
                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-3 border-b border-slate-50 pb-2 last:border-0 last:pb-0"
                    >
                      {inModifica ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="text"
                            value={testoInModifica}
                            onChange={(e) => setTestoInModifica(e.target.value)}
                            className={CLASSE_CAMPO}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => void salvaTesto(d.id)}
                            disabled={salvataggioTesto || !testoInModifica.trim()}
                            title="Salva il nuovo testo"
                            className="p-1.5 rounded bg-emerald-600 text-white disabled:bg-slate-300"
                          >
                            {salvataggioTesto ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDomandaInModifica(null);
                              setTestoInModifica('');
                            }}
                            title="Annulla"
                            className="p-1.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-700 flex-1 flex items-start gap-1.5">
                          <span>{d.domanda}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setDomandaInModifica(d.id);
                              setTestoInModifica(d.domanda);
                              setErrore(null);
                              setAvviso(null);
                            }}
                            title="Modifica il testo della domanda"
                            className="mt-0.5 p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void rispondi(d.id, true)}
                          disabled={rispostaInCorso === d.id || inModifica}
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
                          disabled={rispostaInCorso === d.id || inModifica}
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
