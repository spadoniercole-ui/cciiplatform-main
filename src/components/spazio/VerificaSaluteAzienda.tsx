'use client';

// VERIFICA SALUTE AZIENDA — il triage prima dell'istruttoria.
//
// Si carica la visura camerale, si confermano i campi estratti, e si ottiene
// l'indicatore di attenzione. Solo se si decide di procedere la posizione
// diventa una pratica vera.
//
// Perché l'anagrafica viene comunque salvata, invece di calcolare tutto al
// volo senza scrivere nulla:
//
//  - se il funzionario guarda l'indicatore e decide di NON procedere, ha
//    preso una decisione amministrativa: senza traccia non resta memoria di
//    chi ha verificato cosa, e in un ente è la traccia che protegge chi
//    decide;
//  - i documenti caricati vengono sempre eliminati dopo l'elaborazione:
//    senza esito salvato, due funzionari sulla stessa azienda otterrebbero
//    report diversi e nessuno dei due sarebbe ricostruibile;
//  - un secondo percorso che ricalcola esposizione, soglie e indici
//    finirebbe per divergere da quello esistente. Una sola definizione di
//    ogni numero.
//
// Il costo che si voleva abbattere non era il salvataggio: erano i quindici
// campi da digitare. Quelli ora arrivano dalla visura.

import React, { useEffect, useState } from 'react';
import { Stethoscope, Upload, Check, AlertTriangle, ArrowRight } from 'lucide-react';
import {
  estraiAnagraficaDaVisuraAction,
  type AnagraficaEstratta,
} from '@/app/actions/visuraEstrazione';
import {
  creaAziendaInVerificaAction,
  promuoviAziendaAction,
  registraEsitoVerificaAction,
  ottieniStoricoVerificheAction,
  archiviaVerificaAction,
  type RigaVerifica,
} from '@/app/actions/aziendaInVerifica';
import { valutaValidita } from '@/lib/screening/validitaVerifica';
import {
  leggiElencoDenunce,
  leggiElencoDeleghe,
  leggiListaInadempienze,
} from '@/lib/denunce/lettura';
import { analizzaDenunce, analizzaInadempienze, analizzaVersamenti } from '@/lib/denunce/analisi';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { generaScreeningAziendaAction } from '@/app/actions/screeningAzienda';
import { salvaAnalisiXbrlAziendaAction } from '@/app/actions/xbrlAzienda';
import { analizzaVera, estraiRigheVera } from '@/lib/debitiEnte/veraImport';
import { sostituisciDebitiVeraAction } from '@/app/actions/posizioneVera';
import { salvaValoriSoglieParzialeAction } from '@/app/actions/soglie25novies';
import { SemaforoAttenzione } from '@/components/spazio/SemaforoAttenzione';
import type { Attenzione } from '@/lib/screening/indicatore';

interface Props {
  nomeSchema: string;
  codice: string;
}

type Fase = 'caricamento' | 'conferma' | 'esito' | 'presa_in_carico';

const CAMPI: { chiave: keyof AnagraficaEstratta; label: string; numerico?: boolean }[] = [
  { chiave: 'ragioneSociale', label: 'Ragione sociale' },
  { chiave: 'formaGiuridica', label: 'Forma giuridica' },
  { chiave: 'annoCostituzione', label: 'Anno di costituzione', numerico: true },
  { chiave: 'codiceFiscale', label: 'Codice fiscale' },
  { chiave: 'partitaIva', label: 'Partita IVA' },
  { chiave: 'codiceAteco', label: 'Codice ATECO' },
  { chiave: 'numeroRea', label: 'Numero REA' },
  { chiave: 'capitaleSociale', label: 'Capitale sociale', numerico: true },
  { chiave: 'indirizzoSedeLegale', label: 'Indirizzo sede legale' },
  { chiave: 'citta', label: 'Città' },
  { chiave: 'provincia', label: 'Provincia' },
  { chiave: 'cap', label: 'CAP' },
  { chiave: 'rappresentanteLegale', label: 'Rappresentante legale' },
  { chiave: 'ruoloRappresentanteLegale', label: 'Ruolo del rappresentante' },
  { chiave: 'pec', label: 'PEC' },
];

const CLASSE_CAMPO =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

export function VerificaSaluteAzienda({ nomeSchema, codice }: Props) {
  const [fase, setFase] = useState<Fase>('caricamento');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [nonTrovati, setNonTrovati] = useState<string[]>([]);
  const [dati, setDati] = useState<AnagraficaEstratta | null>(null);
  const [aziendaId, setAziendaId] = useState<number | null>(null);
  const [attenzione, setAttenzione] = useState<Attenzione | null>(null);
  // I due documenti che danno sostanza all'indicatore. Con la sola visura le
  // dimensioni portanti — bilancio ed esposizione — mancano entrambe, e
  // l'esito sarebbe rosso sempre: un semaforo che dice sempre la stessa cosa
  // non è un semaforo.
  const [fileXbrl, setFileXbrl] = useState<File | null>(null);
  const [fileVera, setFileVera] = useState<File | null>(null);
  // La visura serve di nuovo al momento del "Procedi": lo screening la usa
  // come documento di partenza.
  const [fileVisura, setFileVisura] = useState<File | null>(null);
  // Valori che la soglia INPS richiede e che nessun documento porta: i
  // contributi DOVUTI vengono dai flussi UNIEMENS, non dal file V.E.R.A.
  const [conLavoratori, setConLavoratori] = useState<'' | 'si' | 'no'>('');
  const [contributiDovuti, setContributiDovuti] = useState('');
  // I tre fogli INPS. `null` = non ancora scelto; il flag "non disponibile"
  // dice che il documento non c'è e va escluso dalle verifiche, invece di
  // lasciare l'indicatore in attesa di qualcosa che non arriverà.
  const [fileDenunce, setFileDenunce] = useState<File | null>(null);
  const [fileDeleghe, setFileDeleghe] = useState<File | null>(null);
  const [fileInadempienze, setFileInadempienze] = useState<File | null>(null);
  const [nd, setNd] = useState({ denunce: false, deleghe: false, inadempienze: false });
  const [esitoFogli, setEsitoFogli] = useState<string[]>([]);
  const [avanzamento, setAvanzamento] = useState<string | null>(null);
  const [problemiPresaInCarico, setProblemiPresaInCarico] = useState<string[]>([]);
  const [storico, setStorico] = useState<
    (RigaVerifica & { presaInCarico: boolean; archiviata: boolean; motivo: string | null })[]
  >([]);
  const [motivoArchiviazione, setMotivoArchiviazione] = useState('');
  const [mostraArchiviazione, setMostraArchiviazione] = useState(false);

  // Lo storico rende vera la promessa fatta a schermo — "la verifica resta
  // consultabile" — che finora non lo era: esito e data stavano nel
  // database e non esistevano per l'utente.
  useEffect(() => {
    void ottieniStoricoVerificheAction(nomeSchema).then((r) => {
      if (r.success && r.righe) setStorico(r.righe);
    });
  }, [nomeSchema, fase]);

  const caricaVisura = async (f: File | null) => {
    if (!f) return;
    setFileVisura(f);
    setInCorso(true);
    setErrore(null);
    try {
      const byte = new Uint8Array(await f.arrayBuffer());
      let binario = '';
      for (let i = 0; i < byte.length; i += 8192) {
        binario += String.fromCharCode(...byte.subarray(i, i + 8192));
      }
      const r = await estraiAnagraficaDaVisuraAction(btoa(binario));
      if (r.success && r.anagrafica) {
        setDati(r.anagrafica);
        setNonTrovati(r.nonTrovati ?? []);
        setFase('conferma');
      } else {
        // Anche senza estrazione si può proseguire: i campi si compilano a
        // mano. Meglio un percorso più lento che un vicolo cieco.
        setErrore(r.error ?? 'Estrazione non riuscita.');
        setDati({
          ragioneSociale: null,
          formaGiuridica: null,
          codiceFiscale: null,
          partitaIva: null,
          codiceAteco: null,
          numeroRea: null,
          capitaleSociale: null,
          indirizzoSedeLegale: null,
          citta: null,
          provincia: null,
          cap: null,
          rappresentanteLegale: null,
          ruoloRappresentanteLegale: null,
          pec: null,
          annoCostituzione: null,
        });
        setFase('conferma');
      }
    } catch (e) {
      setErrore(String(e));
    } finally {
      setInCorso(false);
    }
  };

  const confermaEValuta = async () => {
    if (!dati) return;
    setInCorso(true);
    setErrore(null);
    try {
      const c = await creaAziendaInVerificaAction(nomeSchema, dati);
      if (!c.success || !c.aziendaId) {
        setErrore(c.error ?? 'Creazione non riuscita.');
        return;
      }
      setAziendaId(c.aziendaId);
      // ---- I documenti, prima della valutazione --------------------------
      // Ogni caricamento è indipendente: se uno fallisce, l'indicatore lo
      // registra come dimensione mancante e lo dichiara. Meglio un giudizio
      // parziale e onesto che nessun giudizio.

      if (fileXbrl) {
        setAvanzamento('Analisi del bilancio XBRL...');
        try {
          // Via la rotta dedicata, non chiamando la libreria da qui:
          // `analizzaFileXbrl` legge le mappature dei tag dal database, e
          // importarla in un componente client trascinerebbe `pg` nel bundle
          // del browser — la build fallisce con "Can't resolve 'fs'".
          const fd = new FormData();
          fd.append('file', fileXbrl);
          const resp = await fetch('/api/xbrl/parse', { method: 'POST', body: fd });
          const esito = await resp.json();
          if (!resp.ok || !esito.success) {
            throw new Error(esito.error || 'Analisi non riuscita.');
          }
          await salvaAnalisiXbrlAziendaAction(nomeSchema, c.aziendaId, esito);
        } catch (e) {
          setErrore(`Bilancio XBRL non analizzabile: ${String(e)}`);
        }
      }

      if (fileVera) {
        setAvanzamento('Lettura della Posizione V.E.R.A....');
        try {
          const analisi = await analizzaVera(fileVera);
          // Mappature vuote: in fase di triage non si chiede all'operatore di
          // classificare titoli e trattamenti. Le righe non riconosciute
          // restano tali e la classificazione fine si fa più avanti, nella
          // scheda Posizione V.E.R.A., se la posizione viene presa in carico.
          const { righe } = estraiRigheVera(analisi.sezioni, {}, {}, true);
          if (righe.length > 0) {
            await sostituisciDebitiVeraAction(nomeSchema, c.aziendaId, righe);
          }
        } catch (e) {
          setErrore(`File V.E.R.A. non leggibile: ${String(e)}`);
        }
      }

      // ---- I tre fogli INPS ----------------------------------------------
      // Da qui vengono i numeri che prima si digitavano a mano, e il terzo
      // requisito dell'art. 25-novies che finora non era accertabile.
      const note: string[] = [];
      let dovutoAnnoPrec: number | null = null;
      let nonVersato: number | null = null;
      let ritardo90: boolean | null = null;
      let periodiRitardo: number | null = null;
      let mancanti: string | null = null;
      const annoPrec = new Date().getFullYear() - 1;

      let righeDenunce: Awaited<ReturnType<typeof leggiElencoDenunce>>['righe'] = [];
      if (fileDenunce) {
        setAvanzamento('Lettura dell’Elenco denunce...');
        const r = await leggiElencoDenunce(fileDenunce);
        if (r.colonneMancanti) {
          note.push(`Elenco denunce non riconosciuto: mancano ${r.colonneMancanti.join(', ')}.`);
        } else {
          righeDenunce = r.righe;
          const a = analizzaDenunce(r.righe, new Date(), annoPrec);
          dovutoAnnoPrec = a.dovutoPerAnno[annoPrec] ?? null;
          if (a.periodiMancanti.length > 0) {
            mancanti = a.periodiMancanti.join(', ');
            note.push(
              `Denunce non presentate per ${a.periodiMancanti.length} periodi: ${mancanti}.`
            );
          }
          note.push(
            `Contributi dovuti ${annoPrec}: ${Math.round(dovutoAnnoPrec ?? 0).toLocaleString('it-IT')} € (ultimo periodo esigibile ${a.ultimoPeriodoDovuto}).`
          );
        }
      }

      if (fileInadempienze) {
        setAvanzamento('Lettura della Lista Inadempienze...');
        const r = await leggiListaInadempienze(fileInadempienze);
        if (r.colonneMancanti) {
          note.push(
            `Lista Inadempienze non riconosciuta: mancano ${r.colonneMancanti.join(', ')}.`
          );
        } else {
          const b = analizzaInadempienze(r.righe);
          nonVersato = b.totaleNonVersato;
          note.push(
            `Non versato certificato: ${Math.round(nonVersato).toLocaleString('it-IT')} €.`
          );
          if (b.anniConSaldoNegativo.length > 0) {
            note.push(
              `Anni con accrediti superiori agli addebiti (non compensati): ${b.anniConSaldoNegativo.join(', ')}.`
            );
          }
        }
      }

      if (fileDeleghe && righeDenunce.length > 0) {
        setAvanzamento('Lettura dell’Elenco Deleghe...');
        const r = await leggiElencoDeleghe(fileDeleghe);
        if (r.colonneMancanti) {
          note.push(`Elenco Deleghe non riconosciuto: mancano ${r.colonneMancanti.join(', ')}.`);
        } else {
          const c = analizzaVersamenti(righeDenunce, r.righe, new Date());
          periodiRitardo = c.oltre90Giorni.length + c.maiVersati.length;
          ritardo90 = periodiRitardo > 0;
          note.push(
            `Ritardo oltre 90 giorni: ${periodiRitardo} periodi, per ${Math.round(c.dovutoInRitardo).toLocaleString('it-IT')} € di contributi dovuti.`
          );
          for (const sc of c.scartate) {
            note.push(
              `Escluse ${sc.righe} righe (${Math.round(sc.importo).toLocaleString('it-IT')} €): ${sc.motivo}`
            );
          }
        }
      } else if (fileDeleghe) {
        note.push(
          'Elenco Deleghe ignorato: serve anche l’Elenco denunce per attribuire i periodi.'
        );
      }

      setEsitoFogli(note);

      // ---- I due valori della soglia INPS --------------------------------
      if (conLavoratori !== '' || contributiDovuti.trim() !== '' || note.length > 0) {
        setAvanzamento('Salvataggio dei valori per le soglie...');
        // Salvataggio PARZIALE: si scrivono solo i due valori raccolti qui.
        // Con quello completo si azzererebbero premi INAIL, IVA e volume
        // d'affari già inseriti — una funzione di triage non deve poter
        // distruggere il lavoro di un'istruttoria.
        // I valori letti dai fogli hanno la precedenza su quelli digitati:
        // vengono da un documento dell'ente, non da una trascrizione.
        await salvaValoriSoglieParzialeAction(nomeSchema, c.aziendaId, {
          conLavoratoriSubordinati: conLavoratori === '' ? undefined : conLavoratori === 'si',
          contributiDovutiAnnoPrecedente:
            dovutoAnnoPrec ??
            (contributiDovuti.trim() === '' ? undefined : Number(contributiDovuti)),
          annoContributiDovuti:
            dovutoAnnoPrec !== null || contributiDovuti.trim() !== '' ? annoPrec : undefined,
          contributiScaduti: nonVersato ?? undefined,
          ritardoOltre90Giorni: ritardo90 ?? undefined,
          periodiInRitardo: periodiRitardo ?? undefined,
          denunceNonPresentate: mancanti ?? undefined,
          soglieAggiornateAl: new Date().toISOString().slice(0, 10),
        });
      }

      setAvanzamento('Calcolo dell’indicatore...');
      const a = await ottieniAttenzioneScreeningAction(nomeSchema, c.aziendaId);
      if (a.success && a.attenzione) {
        setAttenzione(a.attenzione);
        await registraEsitoVerificaAction(nomeSchema, c.aziendaId, a.attenzione.esito);
      }
      setFase('esito');
    } catch (e) {
      setErrore(String(e));
    } finally {
      setInCorso(false);
      setAvanzamento(null);
    }
  };

  /**
   * Promuove la posizione E prepara screening e check list.
   *
   * L'operatore non deve compiere un passo in più: preme "Procedi" e trova
   * l'azienda con l'analisi già fatta. La check list nasce dallo screening,
   * quindi le domande sono già quelle giuste per quell'azienda invece di un
   * questionario generico.
   *
   * L'attesa è dichiarata, non nascosta: nasconderla creerebbe il caso
   * peggiore — l'operatore che apre la scheda dopo dieci secondi, non trova
   * nulla, e non sa se stia arrivando o se sia andato storto qualcosa.
   *
   * Se la generazione fallisce — chiave API assente, direttrici non
   * configurate, visura illeggibile — l'azienda viene promossa LO STESSO:
   * il triage non deve poter bloccare la presa in carico di una posizione,
   * e screening e check list restano generabili dalla scheda azienda come
   * si è sempre fatto.
   */
  const archivia = async () => {
    if (!aziendaId) return;
    setInCorso(true);
    setErrore(null);
    const r = await archiviaVerificaAction(nomeSchema, aziendaId, motivoArchiviazione);
    setInCorso(false);
    if (!r.success) {
      setErrore(r.error ?? 'Archiviazione non riuscita.');
      return;
    }
    setMostraArchiviazione(false);
    setMotivoArchiviazione('');
    setFase('caricamento');
    setDati(null);
    setAttenzione(null);
    setAziendaId(null);
  };

  const procedi = async () => {
    if (!aziendaId) return;
    setInCorso(true);
    setErrore(null);
    const problemi: string[] = [];

    try {
      if (!fileVisura) {
        problemi.push(
          'Visura non disponibile in questa sessione: screening e check list non sono stati generati.'
        );
      } else {
        setAvanzamento('Caricamento della visura...');
        let urlVisura: string | null = null;
        try {
          const fd = new FormData();
          fd.append('file', fileVisura);
          fd.append('codice', codice);
          const up = await fetch('/api/blob-upload', { method: 'POST', body: fd });
          const corpo = await up.json().catch(() => ({}));
          if (!up.ok || corpo.error) {
            // PRIMA questo caso era silenzioso: si proseguiva e si navigava
            // via, e l'operatore si ritrovava sulla scheda azienda senza
            // screening e senza sapere perché. Un fallimento che non lascia
            // messaggio è peggio di un errore.
            problemi.push(
              `Caricamento della visura non riuscito: ${corpo.error ?? `HTTP ${up.status}`}`
            );
          } else {
            urlVisura = corpo.url as string;
          }
        } catch (e) {
          problemi.push(`Caricamento della visura non riuscito: ${String(e)}`);
        }

        if (urlVisura) {
          setAvanzamento('Generazione di screening e check list — un minuto circa...');
          try {
            const g = await generaScreeningAziendaAction(
              nomeSchema,
              aziendaId,
              urlVisura,
              fileVisura.name
            );
            if (!g.success) problemi.push(`Screening non generato: ${g.error ?? 'errore'}`);
          } catch (e) {
            problemi.push(`Screening non generato: ${String(e)}`);
          }
        }
      }

      setAvanzamento('Presa in carico...');
      const r = await promuoviAziendaAction(nomeSchema, aziendaId);
      if (!r.success) {
        setErrore(r.error ?? 'Presa in carico non riuscita.');
        return;
      }

      if (problemi.length === 0) {
        // Tutto riuscito: si va direttamente alla scheda, dove screening e
        // check list sono pronti.
        window.location.href = `/spazio/${codice}/aziende/${aziendaId}`;
        return;
      }

      // Qualcosa non è andato: l'azienda è comunque presa in carico, ma NON
      // si naviga via. L'operatore deve vedere cosa manca e decidere lui
      // quando spostarsi — altrimenti scoprirebbe l'assenza dello screening
      // solo più tardi, senza sapere perché.
      setProblemiPresaInCarico(problemi);
      setFase('presa_in_carico');
    } finally {
      setInCorso(false);
      setAvanzamento(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 font-bold text-slate-900 uppercase text-xs tracking-wider">
          <Stethoscope className="w-4 h-4 text-slate-500" />
          Verifica salute azienda
        </h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Il triage prima dell&apos;istruttoria: si carica la visura camerale, si confermano i dati
          e si ottiene l&apos;indicatore di attenzione. La posizione diventa una pratica solo se
          decidi di procedere — ma la verifica resta comunque registrata.
        </p>
      </div>

      {errore && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{errore}</p>
        </div>
      )}

      {fase === 'caricamento' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
            Visura camerale (PDF)
          </p>
          <input
            type="file"
            accept=".pdf"
            disabled={inCorso}
            onChange={(e) => void caricaVisura(e.target.files?.[0] ?? null)}
            className="w-full text-xs font-mono text-slate-900 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:font-bold file:uppercase file:text-[10px]"
          />
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Da qui vengono letti i dati anagrafici. Il file non viene conservato: serve solo
            all&apos;estrazione, e i campi letti li confermi tu prima che vengano salvati.
          </p>
          {inCorso && (
            <p className="text-[11px] text-slate-500">
              <Upload className="w-3 h-3 inline mr-1" />
              Lettura della visura in corso...
            </p>
          )}
        </div>
      )}

      {fase === 'conferma' && dati && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Conferma i dati letti
            </h3>
            {nonTrovati.length > 0 && (
              <span className="text-[10px] text-amber-700">
                {nonTrovati.length} campi non trovati nella visura
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Quanto letto viene <span className="font-bold">proposto</span>, non ancora salvato: su
            un&apos;anagrafica un errore non resta isolato, si trascina in tutto ciò che viene dopo
            — a partire dalla soglia dell&apos;Agente della Riscossione, che dipende dalla forma
            giuridica.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CAMPI.map(({ chiave, label, numerico }) => {
              const valore = dati[chiave];
              const mancante = valore === null;
              return (
                <div key={chiave}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    {label}
                    {mancante && <span className="ml-1 text-amber-600">— non trovato</span>}
                  </label>
                  <input
                    type={numerico ? 'number' : 'text'}
                    value={valore === null ? '' : String(valore)}
                    onChange={(e) =>
                      setDati({
                        ...dati,
                        [chiave]: numerico
                          ? e.target.value === ''
                            ? null
                            : Number(e.target.value)
                          : e.target.value === ''
                            ? null
                            : e.target.value,
                      })
                    }
                    className={`${CLASSE_CAMPO} ${mancante ? 'border-amber-300' : ''}`}
                  />
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
                Documenti per l&apos;analisi
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                Senza questi due l&apos;indicatore non ha né il bilancio né l&apos;esposizione, e
                l&apos;esito resta &laquo;approfondimenti necessari&raquo; per forza. Sono
                facoltativi — ma è da qui che il semaforo prende significato.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Bilancio XBRL
                </label>
                <input
                  type="file"
                  accept=".xbrl,.xml"
                  onChange={(e) => setFileXbrl(e.target.files?.[0] ?? null)}
                  className="w-full text-xs font-mono text-slate-900 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-bold file:uppercase file:text-[10px]"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Da qui patrimonio netto e indici CCII.
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Posizione V.E.R.A.
                </label>
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={(e) => setFileVera(e.target.files?.[0] ?? null)}
                  className="w-full text-xs font-mono text-slate-900 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-bold file:uppercase file:text-[10px]"
                />
                <p className="text-[10px] text-slate-400 mt-1">Da qui l&apos;esposizione.</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
                Fogli INPS
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                Da qui vengono i contributi dovuti, il non versato certificato e il ritardo di oltre
                90 giorni — il terzo requisito dell&apos;art. 25-novies, che senza l&apos;Elenco
                Deleghe non è accertabile. Sono dati dell&apos;istituto: nessuna elaborazione
                nostra. Se un foglio non è disponibile, spuntalo: verrà escluso dalle verifiche
                invece di lasciare l&apos;indicatore in attesa.
              </p>
            </div>

            {[
              {
                k: 'denunce' as const,
                label: 'Elenco denunce (UNIEMENS)',
                hint: 'Contributi dovuti per anno e denunce non presentate.',
                file: fileDenunce,
                set: setFileDenunce,
              },
              {
                k: 'inadempienze' as const,
                label: 'Lista Inadempienze',
                hint: 'Il non versato certificato dall’istituto.',
                file: fileInadempienze,
                set: setFileInadempienze,
              },
              {
                k: 'deleghe' as const,
                label: 'Elenco Deleghe (F24)',
                hint: 'Date di versamento: da qui il ritardo oltre 90 giorni. Solo DM10.',
                file: fileDeleghe,
                set: setFileDeleghe,
              },
            ].map((f) => (
              <div key={f.k} className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    {f.label}
                  </label>
                  <label className="flex items-center gap-1.5 text-[10px] text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={nd[f.k]}
                      onChange={(e) => {
                        setNd({ ...nd, [f.k]: e.target.checked });
                        if (e.target.checked) f.set(null);
                      }}
                    />
                    non disponibile
                  </label>
                </div>
                {!nd[f.k] && (
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={(e) => f.set(e.target.files?.[0] ?? null)}
                    className="w-full mt-1 text-xs font-mono text-slate-900 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-bold file:uppercase file:text-[10px]"
                  />
                )}
                <p className="text-[10px] text-slate-400 mt-1">
                  {nd[f.k] ? 'Escluso dalle verifiche.' : f.hint}
                </p>
              </div>
            ))}

            <div className="border-t border-slate-100 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
                Soglia di segnalazione
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                Servono solo se l&apos;Elenco denunce non è disponibile: con quel foglio i
                contributi dovuti si leggono da lì, e il valore letto ha la precedenza su quello
                digitato.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Lavoratori subordinati o parasubordinati
                </label>
                <select
                  value={conLavoratori}
                  onChange={(e) => setConLavoratori(e.target.value as '' | 'si' | 'no')}
                  className={CLASSE_CAMPO}
                >
                  <option value="">Non dichiarato</option>
                  <option value="si">Sì</option>
                  <option value="no">No</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Decide quale soglia si applica: 30% + 15.000 € oppure 5.000 €.
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Contributi dovuti nell&apos;anno precedente
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={contributiDovuti}
                  onChange={(e) => setContributiDovuti(e.target.value)}
                  className={`${CLASSE_CAMPO} font-mono`}
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Totale dovuto, non il debito: è la base del 30%.
                </p>
              </div>
            </div>
          </div>

          {avanzamento && <p className="text-[11px] font-mono text-slate-500">{avanzamento}</p>}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                setFase('caricamento');
                setDati(null);
                setNonTrovati([]);
              }}
              className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              ← Indietro
            </button>
            <button
              onClick={() => void confermaEValuta()}
              disabled={inCorso || !dati.ragioneSociale}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-800 disabled:bg-slate-300"
            >
              <Check className="w-3.5 h-3.5" />
              {inCorso ? 'Valutazione in corso...' : 'Conferma e valuta'}
            </button>
          </div>
        </div>
      )}

      {fase === 'caricamento' && storico.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider mb-3">
            Verifiche già eseguite
          </h3>
          <div className="divide-y divide-slate-100">
            {storico.slice(0, 15).map((v) => (
              // Cliccabile: una verifica che non si può riaprire è un elenco
              // di sola lettura, non una traccia consultabile.
              <a
                key={v.id}
                href={`/spazio/${codice}/aziende/${v.id}`}
                className="flex items-center justify-between gap-3 py-2 hover:bg-slate-50 -mx-2 px-2 rounded"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-900 truncate">
                    {v.ragioneSociale}
                  </span>
                  <span className="block text-[10px] text-slate-400 font-mono">
                    {v.partitaIva ? `P.IVA ${v.partitaIva} · ` : ''}
                    {v.eseguitaIl ? new Date(v.eseguitaIl).toLocaleDateString('it-IT') : ''}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {v.esito && (
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 ${
                        v.esito === 'ROSSO'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : v.esito === 'GIALLO'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {v.esito === 'ATTENZIONE_MINIMA' ? 'Minima' : v.esito.toLowerCase()}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-500">
                    {v.archiviata
                      ? 'archiviata'
                      : v.presaInCarico
                        ? 'presa in carico'
                        : 'in sospeso'}
                  </span>
                  {(() => {
                    const val = valutaValidita(v.eseguitaIl);
                    return (
                      <span
                        className={`text-[10px] ${
                          val.stato === 'da_rivedere'
                            ? 'text-amber-700 font-bold'
                            : val.stato === 'in_scadenza'
                              ? 'text-amber-600'
                              : 'text-slate-400'
                        }`}
                      >
                        {val.etichetta}
                      </span>
                    );
                  })()}
                  <ArrowRight className="w-3 h-3 text-slate-300" />
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {fase === 'presa_in_carico' && (
        <div className="bg-white border border-amber-200 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Azienda presa in carico, con riserva
          </h3>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            La posizione è entrata fra quelle in lavorazione, ma la preparazione automatica non è
            riuscita del tutto:
          </p>
          <ul className="space-y-1">
            {problemiPresaInCarico.map((p, i) => (
              <li key={i} className="text-[11px] text-amber-800 leading-relaxed flex gap-2">
                <span className="text-amber-500 shrink-0">—</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Screening e check list si generano dalla scheda azienda, come si è sempre fatto: nulla è
            andato perduto, manca solo la preparazione automatica.
          </p>
          <a
            href={`/spazio/${codice}/aziende/${aziendaId}`}
            className="inline-flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-sky-700"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            Vai alla scheda azienda
          </a>
        </div>
      )}

      {fase === 'esito' && (
        <div className="space-y-4">
          {esitoFogli.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider mb-2">
                Letto dai fogli INPS
              </h3>
              <ul className="space-y-1">
                {esitoFogli.map((n, i) => (
                  <li key={i} className="text-[11px] text-slate-600 leading-relaxed flex gap-2">
                    <span className="text-slate-400 shrink-0">—</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                Tutti dati dell&apos;istituto, aggregati riga per riga dai fogli caricati: il conto
                è rifacibile sul file di partenza.
              </p>
            </div>
          )}

          {attenzione ? (
            <SemaforoAttenzione attenzione={attenzione} />
          ) : (
            <p className="text-xs text-slate-500">
              Indicatore non calcolabile con i dati inseriti.
            </p>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">E adesso?</h3>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              La verifica è registrata: resta consultabile anche se decidi di non proseguire, ed è
              la traccia di chi ha guardato questa posizione e quando.
            </p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Procedendo, l&apos;azienda entra fra quelle in lavorazione e vengono generati{' '}
              <span className="font-bold">screening e check list</span> — un minuto circa. Li
              troverai già pronti nella scheda: sono <span className="font-bold">preliminari</span>,
              perché nascono senza la posizione debitoria e senza le tue risposte, e si rigenerano
              quando avrai completato quei due passaggi.
            </p>
            {avanzamento && <p className="text-[11px] font-mono text-slate-500">{avanzamento}</p>}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => void procedi()}
                disabled={inCorso || !aziendaId}
                className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-sky-700 disabled:bg-slate-300"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                {inCorso ? 'Preparazione in corso...' : 'Procedi con questa azienda'}
              </button>
              <button
                onClick={() => {
                  setFase('conferma');
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                ← Indietro
              </button>
              <button
                onClick={() => {
                  setFase('caricamento');
                  setDati(null);
                  setAttenzione(null);
                  setAziendaId(null);
                  setNonTrovati([]);
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Verifica un&apos;altra azienda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
