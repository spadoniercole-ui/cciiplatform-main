'use client';

// LA RELAZIONE DELLA VERIFICA CONTABILE — la parte scritta dell'unica verifica.
//
// Prima questa era una seconda procedura, con un nome suo («Valutazione
// completa»), una pagina sua, i suoi caricamenti della visura e dei bilanci e
// due giudizi propri (il semaforo e l'Indice di Attenzione Istruttoria). Gli
// stessi documenti entravano due volte, e la stessa posizione usciva con due
// verdetti che potevano non coincidere.
//
// Ora è la parte scritta della verifica: legge i documenti acquisiti nella
// verifica contabile (visura, parametri, bilanci), non ne chiede altri, e non
// produce un esito. L'esito è uno solo ed è quello mostrato sopra, in
// `EsitoVerifica`. Qui restano il questionario per direttrici, la relazione di
// inquadramento e il documento stampabile, che quel giudizio lo riportano.

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  RefreshCw,
  Printer,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import {
  ottieniScreeningAzienda,
  generaScreeningAziendaAction,
  calcolaRiscontriNormativiAzienda,
  type StatoScreeningAzienda,
} from '@/app/actions/screeningAzienda';
import { generaPreCompilazioneMinisterialeAction } from '@/app/actions/checklistMinisterialeAzienda';
import { ottieniStoricoXbrlAzienda, type BilancioStoricoAzienda } from '@/app/actions/xbrlAzienda';
import { proiezioneContabileAction } from '@/app/actions/verificaContabile';
import { htmlSezioniContabili } from '@/lib/contabile/documentoHtml';
import { stampaHtml } from '@/lib/stampaTesto';
import { TestoConNormativa } from '@/components/spazio/TestoConNormativa';
import { RiscontriNormativi, corpoRiscontriHtml } from '@/components/spazio/RiscontriNormativi';
import { ottieniVisuraTriageAction } from '@/app/actions/visuraTriage';
import { RevisioneTesto } from '@/components/spazio/RevisioneTesto';
import { FattiVisura } from '@/components/spazio/FattiVisura';
import { StoricoScreening } from '@/components/spazio/StoricoScreening';
import { htmlCopertinaEsito } from '@/lib/iai/esitoHtml';
import { htmlRiferimentiEMetodo } from '@/lib/iai/riferimentiHtml';
import { valutaSoglieAction } from '@/app/actions/soglie25novies';
import { markdownInHtml } from '@/lib/stampa/markdown';
import { appendiceRilievi } from '@/lib/revisore/correzione';
import { datiRiferimentiAction } from '@/app/actions/iai';
import { revisionaTesto } from '@/lib/revisore/revisore';
import { FascicoloEvidenza } from '@/components/spazio/FascicoloEvidenza';
import type { Evidenza } from '@/lib/fascicolo/evidenza';
import { useDemo } from '@/components/spazio/DemoUploadProvider';
import { fascicoloDemoPerCodiceFiscale } from '@/lib/demo/documenti';
import type { EsitoVerifica } from '@/lib/verifica/esito';
import type { DebitoInBilancio } from '@/lib/verifica/debitoInBilancio';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  codice: string;
  tipoSpazio: 'ENTE' | 'NON_ENTE';
  /** L'esito unico della verifica: entra nella prima pagina del documento. */
  esito: EsitoVerifica | null;
  /** Il debito dell'ente in bilancio o no: stesso avviso della schermata (0.256.5). */
  debitoInBilancio?: DebitoInBilancio | null;
  /** Gli indici abilitati nello spazio: le tabelle del documento mostrano questi. */
  indiciAbilitati?: string[];
}

export function RelazioneInquadramento({
  nomeSchema,
  aziendaId,
  codice,
  tipoSpazio,
  esito,
  debitoInBilancio = null,
  indiciAbilitati = [],
}: Props) {
  const router = useRouter();
  const demo = useDemo();
  const [stato, setStato] = useState<StatoScreeningAzienda | null>(null);
  const [numeroXbrl, setNumeroXbrl] = useState(0);
  // I bilanci in archivio servono al documento: prospetto e indici si stampano
  // dagli stessi dati che la verifica mostra a schermo.
  const [bilanci, setBilanci] = useState<BilancioStoricoAzienda[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [generazioneInCorso, setGenerazioneInCorso] = useState(false);
  const [fascicolo, setFascicolo] = useState<Evidenza[] | null>(null);
  const [menuStampa, setMenuStampa] = useState(false);
  const [conAllegato, setConAllegato] = useState(true);
  const [stampaInCorso, setStampaInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esitoPreCompilazione, setEsitoPreCompilazione] = useState<string | null>(null);
  // L'assenza di bilancio si dichiara: il server non procede senza (0.248.0).
  const [procediSenzaXbrl, setProcediSenzaXbrl] = useState(false);
  const [visuraTriage, setVisuraTriage] = useState<{ nome: string; caricataIl: string } | null>(
    null
  );
  const [istruzioniAI, setIstruzioniAI] = useState('');
  const [secondiGenerazione, setSecondiGenerazione] = useState(0);

  const intestazioneCopertina = {
    azienda: stato?.visuraFatti?.denominazione ?? `Azienda ${aziendaId}`,
    codiceFiscale: stato?.visuraFatti?.codiceFiscale ?? null,
    ente: tipoSpazio === 'ENTE' ? 'Ricevente' : 'Redigente',
    identificativi: stato?.identificativiEnte ?? [],
  };

  useEffect(() => {
    if (!generazioneInCorso) {
      setSecondiGenerazione(0);
      return;
    }
    const t = setInterval(() => setSecondiGenerazione((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [generazioneInCorso]);

  const carica = async () => {
    setCaricamento(true);
    const [screeningRis, xbrlRis] = await Promise.all([
      ottieniScreeningAzienda(nomeSchema, aziendaId),
      ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
    ]);
    if (screeningRis.success) setStato(screeningRis.stato);
    else setErrore(screeningRis.error || 'Impossibile caricare la relazione.');
    if (xbrlRis.success) {
      setNumeroXbrl(xbrlRis.storico.length);
      setBilanci(xbrlRis.storico);
    }
    setCaricamento(false);
  };

  useEffect(() => {
    void ottieniVisuraTriageAction(nomeSchema, aziendaId).then((r) => {
      if (r.success && r.visura) {
        setVisuraTriage({ nome: r.visura.nome, caricataIl: r.visura.caricataIl });
      }
    });
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const handleGenera = async () => {
    // Nella demo non si consuma AI: la relazione è già stata prodotta sui
    // documenti demo. Il gesto resta visibile, il risultato è la simulazione.
    if (demo) {
      setErrore(null);
      setEsitoPreCompilazione(
        'Relazione demo: i documenti sono già acquisiti e il testo è già stato generato. La rigenerazione è simulata e non consuma chiamate AI.'
      );
      return;
    }
    // LA VISURA È QUELLA DELLA VERIFICA. Si acquisisce nella sezione 1, una
    // volta: qui non c'è un secondo caricamento.
    const r = await ottieniVisuraTriageAction(nomeSchema, aziendaId);
    if (!visuraTriage || !r.success || !r.visura) {
      setErrore(
        'Manca la visura storica: acquisiscila nella sezione 1 della verifica contabile, qui sopra, poi torna a generare.'
      );
      return;
    }
    setGenerazioneInCorso(true);
    setErrore(null);
    try {
      if (tipoSpazio === 'NON_ENTE') {
        const risultato = await generaPreCompilazioneMinisterialeAction(
          nomeSchema,
          aziendaId,
          r.visura.url,
          r.visura.nome
        );
        if (risultato.success) {
          setEsitoPreCompilazione(
            risultato.domandeCompilate === 0
              ? 'Nessuna domanda della Check List Ministeriale poteva essere compilata con certezza da questi dati — completala a mano in Check List.'
              : `${risultato.domandeCompilate} domanda/e della Check List Ministeriale compilata/e — completa il resto in Check List, la scheda accanto.`
          );
          router.refresh();
        } else {
          setErrore(risultato.error || 'Impossibile pre-compilare la Check List Ministeriale.');
        }
        return;
      }
      const risultato = await generaScreeningAziendaAction(
        nomeSchema,
        aziendaId,
        r.visura.url,
        r.visura.nome,
        istruzioniAI,
        'MANUALE',
        procediSenzaXbrl
      );
      if (risultato.success) {
        await carica();
        router.refresh();
      } else {
        setErrore(risultato.error || 'Impossibile generare la relazione.');
      }
    } catch (err: unknown) {
      setErrore(`Generazione non riuscita: ${(err as Error).message || String(err)}`);
    } finally {
      setGenerazioneInCorso(false);
    }
  };

  const stampa = async () => {
    // La relazione non è più la condizione della stampa: i numeri che
    // sostengono l'esito ci sono anche quando la narrazione manca.
    if (!stato) return;
    setStampaInCorso(true);
    const testo = stato.relazioneTesto;
    const revisione = testo ? revisionaTesto(testo, 'RELAZIONE_SCREENING', { fascicolo }) : null;
    const [ris, s25] = await Promise.all([
      calcolaRiscontriNormativiAzienda(nomeSchema, aziendaId),
      valutaSoglieAction(nomeSchema, aziendaId, tipoSpazio),
    ]);
    const riscontri =
      ris.success && ris.riscontri
        ? corpoRiscontriHtml(
            ris.riscontri,
            s25.success && s25.esito ? s25.esito : null,
            s25.success ? null : (s25.error ?? null)
          )
        : '<p class="note">Riscontri normativi non calcolabili sui dati disponibili.</p>';
    let allegato = '';
    if (conAllegato && testo && revisione) {
      const rif = await datiRiferimentiAction(nomeSchema, aziendaId, tipoSpazio);
      if (rif.success)
        allegato = htmlRiferimentiEMetodo({
          fase: 'SCREENING',
          documenti: rif.documenti ?? [],
          fontiUsate: rif.fontiUsate ?? [],
          testo,
          materie: rif.materie ?? [],
          revisione,
          identificativi: stato.identificativiEnte,
        });
    }
    const salto = '<div class="salto"></div>';
    const corpo = revisione
      ? conAllegato
        ? revisione.testoRivisto
        : revisione.testoRivisto + appendiceRilievi(revisione)
      : '';
    const copertina = esito
      ? htmlCopertinaEsito(
          esito,
          {
            ...intestazioneCopertina,
            data: new Date().toLocaleString('it-IT'),
          },
          debitoInBilancio
        )
      : '<p class="note">Esito non disponibile: la stampa riporta i soli dati.</p>';

    // I NUMERI CHE SOSTENGONO L'ESITO STANNO QUI. Prospetto, indici e
    // proiezione arrivano dagli stessi dati della schermata — i bilanci in
    // archivio e la proiezione della verifica — ciascuno con la sua nota:
    // il documento non rimanda più a un'altra stampa per le tabelle.
    const proiezioneRis = await proiezioneContabileAction(nomeSchema, aziendaId).catch(() => null);
    const sezioniContabili = htmlSezioniContabili({
      storico: bilanci,
      proiezione: proiezioneRis?.success ? proiezioneRis.proiezione : null,
      indiciAbilitati,
    });
    let progressivo = 0;
    const tabelle = sezioniContabili
      .map((s) => `<h2 style="font-size:14px">${++progressivo}. ${s.titolo}</h2>${s.corpo}`)
      .join(salto);
    const relazioneHtml = revisione
      ? `<h2 style="font-size:14px">${++progressivo}. Relazione di inquadramento</h2><div class="md" style="font-size:12px;line-height:1.5">${markdownInHtml(corpo)}</div>`
      : '<p class="note">Relazione di inquadramento non generata: il documento riporta dati, indici, proiezione e riscontri.</p>';
    stampaHtml(
      `Verifica contabile — ${intestazioneCopertina.azienda}`,
      copertina +
        salto +
        tabelle +
        salto +
        relazioneHtml +
        salto +
        `<h2 style="font-size:14px">${++progressivo}. Riscontri normativi</h2>${riscontri}` +
        (allegato ? salto + allegato : ''),
      undefined,
      stato.generatoIl
    );
    setStampaInCorso(false);
    setMenuStampa(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const documentoFascicoloDemo = demo
    ? fascicoloDemoPerCodiceFiscale(stato?.visuraFatti?.codiceFiscale)
    : null;
  const haVisura = Boolean(visuraTriage || documentoFascicoloDemo);
  const base = `/spazio/${codice}/verifica-contabile/${aziendaId}`;
  const puoGenerare =
    !generazioneInCorso &&
    haVisura &&
    (tipoSpazio === 'NON_ENTE' || (stato?.identificativiEnte.length ?? 0) > 0) &&
    (numeroXbrl > 0 || procediSenzaXbrl || tipoSpazio === 'NON_ENTE');

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Relazione di inquadramento
        </h2>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          {tipoSpazio === 'NON_ENTE' ? (
            <>
              Da bilancio XBRL e fascicolo storico, un tentativo di rispondere alle domande fisse
              della Check List Ministeriale (56, Sezione II del decreto) — solo dove i dati lo
              dimostrano, mai per invenzione. Il resto si completa a mano in{' '}
              <span className="font-bold">Check List</span>.
            </>
          ) : (
            <>
              La parte scritta della verifica: dal bilancio XBRL e dal fascicolo storico, un
              questionario mirato alle direttrici di questo ente e una relazione di inquadramento —
              basati solo su quello che è già pubblico o nei tuoi sistemi. Le domande generate si
              rispondono nel <span className="font-bold">triage</span>. L’esito non cambia: è quello
              della verifica, qui sopra.
            </>
          )}
        </p>

        {tipoSpazio !== 'NON_ENTE' && (stato?.identificativiEnte.length ?? 0) > 0 && (
          <p className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
            <span className="font-bold uppercase text-[10px] text-slate-500 tracking-wider">
              Identificativi presso l’ente
            </span>
            {stato!.identificativiEnte.map((x) => (
              <span key={x.etichetta}>
                <span className="text-slate-500">{x.etichetta}</span>{' '}
                <span className="font-bold">{x.valore}</span>
              </span>
            ))}
          </p>
        )}

        {/* I DOCUMENTI SONO QUELLI DELLA VERIFICA, non una seconda raccolta. */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Documenti su cui lavora la relazione
          </p>
          <p className="text-[11px] text-slate-700 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              {visuraTriage
                ? `Visura storica ${visuraTriage.nome}`
                : documentoFascicoloDemo
                  ? `Fascicolo demo ${documentoFascicoloDemo.nome}`
                  : 'Visura storica mancante'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
              {numeroXbrl > 0
                ? `${numeroXbrl} ${numeroXbrl === 1 ? 'annualità XBRL' : 'annualità XBRL'}`
                : 'Nessun bilancio XBRL'}
            </span>
            {!haVisura && (
              <Link href="#visura-storica" className="font-bold text-blue-700 hover:underline">
                Acquisisci la visura nella sezione 1
              </Link>
            )}
          </p>
          <p className="text-[10px] text-slate-400">
            Si acquisiscono una volta sola, nella verifica contabile: qui non si ricaricano.
          </p>
        </div>

        {errore && (
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{errore}</p>
          </div>
        )}

        {tipoSpazio !== 'NON_ENTE' && stato && stato.identificativiEnte.length === 0 && (
          <div className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <span className="font-bold">Prima i parametri dell’ente.</span> La relazione si
              elabora solo dopo aver salvato almeno un parametro dell’ente per questa azienda
              (sezione 2 qui sopra: matricola, posizione…): da lì l’azienda si riconosce con i tuoi
              riferimenti interni, non con quelli camerali.
            </p>
          </div>
        )}

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
            Istruzioni per l’AI (facoltative, solo per questo lancio)
          </label>
          <textarea
            value={istruzioniAI}
            onChange={(e) => setIstruzioniAI(e.target.value)}
            rows={2}
            placeholder="Es. concentrati sui debiti previdenziali, tieni conto della stagionalità dei ricavi…"
            className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 outline-none focus:border-blue-500"
          />
        </div>

        {numeroXbrl === 0 && tipoSpazio !== 'NON_ENTE' && (
          <label className="flex items-start gap-2 text-[11px] text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={procediSenzaXbrl}
              onChange={(e) => setProcediSenzaXbrl(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-bold text-amber-800">Procedi senza bilancio XBRL.</span> La
              relazione si scrive sui soli dati disponibili e l’assenza del bilancio resta scritta
              nel testo — che resta preliminare finché il bilancio non viene caricato.
            </span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleGenera}
            disabled={!puoGenerare}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
          >
            {generazioneInCorso ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {generazioneInCorso
              ? `Generazione in corso… ${secondiGenerazione}s`
              : tipoSpazio === 'NON_ENTE'
                ? 'Pre-compila Check List Ministeriale'
                : stato?.esiste
                  ? 'Rigenera la relazione'
                  : 'Genera la relazione'}
          </button>
          {stato?.esiste && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuStampa((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
                title="Un solo documento: esito, prospetto, indici, proiezione, relazione, riscontri e allegato"
              >
                <Printer className="w-3.5 h-3.5" /> Stampa la verifica (PDF)
              </button>
              {menuStampa && (
                <div className="absolute right-0 mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-3 space-y-2 z-20">
                  <p className="text-[11px] text-slate-700">
                    Il documento contiene: esito della verifica con le cinque dimensioni, prospetto
                    contabile, indici per annualità, proiezione, relazione di inquadramento,
                    riscontri normativi. Ogni tabella porta la sua nota.
                  </p>
                  <label className="flex items-start gap-2 text-[11px] text-slate-800">
                    <input
                      type="checkbox"
                      checked={conAllegato}
                      onChange={(e) => setConAllegato(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Allegato «Riferimenti e metodo» (perimetro, documenti con impronta, fonti,
                      titoli dell’ente, basi, rilievi residui)
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={stampa}
                      disabled={stampaInCorso}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
                    >
                      {stampaInCorso ? 'Preparazione…' : 'Stampa'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMenuStampa(false)}
                      className="px-3 py-2 text-[10px] font-bold uppercase text-slate-500"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {esitoPreCompilazione && (
            <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
              {esitoPreCompilazione}
            </span>
          )}
        </div>

        {generazioneInCorso && (
          <div className="text-[11px] text-slate-700 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
            <p className="font-bold text-slate-900">
              Generazione in corso — {secondiGenerazione} secondi. Può richiedere fino a due minuti
              e mezzo: non chiudere la pagina.
            </p>
            <p>
              L’assistente sta producendo in parallelo il questionario per direttrice, la relazione
              di analisi e i fatti della visura.
            </p>
            {secondiGenerazione > 150 && (
              <p className="text-amber-800">
                Tempo massimo superato: se non compare nulla entro pochi secondi, la generazione è
                stata interrotta e verrà mostrato un messaggio.
              </p>
            )}
          </div>
        )}

        <p className="text-[10px] text-slate-400">
          {tipoSpazio === 'NON_ENTE'
            ? 'Ripetere l’operazione sovrascrive solo le domande già compilate dalla relazione — quelle risposte a mano restano intatte.'
            : 'Rigenerare sovrascrive il questionario e la relazione attuali, e azzera le risposte già date nel triage. L’esito della verifica non cambia: dipende dai dati, non dal testo.'}
        </p>
        <p className="text-[10px] text-slate-400">
          Documenti e dati si aggiornano{' '}
          <Link href={base} className="font-bold text-blue-700 hover:underline">
            nella verifica contabile
          </Link>
          .
        </p>
      </div>

      {stato?.esiste && stato.visuraFatti && (
        <FattiVisura
          fatti={stato.visuraFatti}
          impronta={stato.visuraImpronta}
          nomeFile={stato.nomeFileVisura}
        />
      )}

      {stato?.esiste && stato.relazioneTesto && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Relazione di inquadramento
            </h3>
            {stato.generatoIl && (
              <span className="text-[10px] text-slate-400">
                Generata il {new Date(stato.generatoIl).toLocaleString('it-IT')}
              </span>
            )}
          </div>
          <div className="mb-3 space-y-3">
            <FascicoloEvidenza
              nomeSchema={nomeSchema}
              aziendaId={aziendaId}
              scenarioId={null}
              onCaricato={setFascicolo}
            />
            <RevisioneTesto
              testo={stato.relazioneTesto}
              tipo="RELAZIONE_SCREENING"
              fascicolo={fascicolo}
            />
          </div>
          <TestoConNormativa testo={stato.relazioneTesto} codice={codice} mostraRiferimenti />
        </div>
      )}

      {stato?.esiste && stato.relazioneTesto && (
        <RiscontriNormativi
          nomeSchema={nomeSchema}
          aziendaId={aziendaId}
          codice={codice}
          tipoSpazio={tipoSpazio}
        />
      )}

      {stato?.esiste && (
        <StoricoScreening
          nomeSchema={nomeSchema}
          aziendaId={aziendaId}
          versione={stato.generatoIl ? Date.parse(stato.generatoIl) : 0}
        />
      )}
    </div>
  );
}
