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
import { riconosciProspetto } from '@/lib/denunce/lettura';
import { accumulaFile, togliFile } from '@/lib/file/accumula';
import type { RigaDebitoTriage } from '@/lib/debitiTriage/modello';
import type { MappaturaProspetto } from '@/lib/debitiTriage/mappatura';
import { salvaTutteDebitiTriageAction } from '@/app/actions/debitiTriage';
import { salvaStrutturaProspettoAction } from '@/app/actions/struttureProspetto';
import {
  leggiElencoDenunce,
  leggiElencoDeleghe,
  leggiListaInadempienze,
  eF24Aggregato,
} from '@/lib/denunce/lettura';
import { analizzaDenunce, analizzaInadempienze, analizzaVersamenti } from '@/lib/denunce/analisi';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { generaScreeningAziendaAction } from '@/app/actions/screeningAzienda';
import { generaPreCompilazioneMinisterialeAction } from '@/app/actions/checklistMinisterialeAzienda';
import { registraVisuraTriageAction } from '@/app/actions/visuraTriage';
import { salvaAnalisiXbrlAziendaAction } from '@/app/actions/xbrlAzienda';
import { analizzaVera, estraiRigheVera } from '@/lib/debitiEnte/veraImport';
import { sostituisciDebitiVeraAction } from '@/app/actions/posizioneVera';
import { salvaValoriSoglieParzialeAction } from '@/app/actions/soglie25novies';
import { SemaforoAttenzione } from '@/components/spazio/SemaforoAttenzione';
import { DebitiTriage } from '@/components/spazio/DebitiTriage';
import type { Attenzione } from '@/lib/screening/indicatore';

interface Props {
  nomeSchema: string;
  codice: string;
  /**
   * Il triage è identico per i due percorsi — stessi documenti di partenza,
   * stesso motore — ma cio' che si GENERA al "Procedi" no: il Ricevente
   * ottiene lo screening sulle direttrici del proprio ente, il Redigente la
   * pre-compilazione della Check List Ministeriale. Senza questa
   * distinzione un Redigente si ritrovava lo screening dell'altro percorso.
   */
  tipoSpazio: 'ENTE' | 'NON_ENTE';
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

export function VerificaSaluteAzienda({ nomeSchema, codice, tipoSpazio }: Props) {
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
  // Più bilanci: ognuno porta due esercizi, quindi due bilanci danno tre anni
  // di indici. Un campo singolo lo faceva sembrare impossibile.
  const [fileXbrl, setFileXbrl] = useState<File[]>([]);
  // Un solo punto di caricamento per la posizione debitoria: N file di
  // qualunque natura, riconosciuti dalle intestazioni al momento della
  // conferma. Sostituisce i campi fissi — V.E.R.A. e tre fogli INPS — che
  // presentavano come presupposto quello che è documentazione a corredo.
  const [fileProspetti, setFileProspetti] = useState<File[]>([]);
  // Le posizioni della tabella e le strutture mappate vivono qui finché
  // l'azienda non esiste: si salvano alla conferma, insieme a lei. Prima
  // restavano solo sullo schermo, e il pulsante di salvataggio diceva di
  // confermare prima i dati — cioè di perderle.
  const [righeDebiti, setRigheDebiti] = useState<RigaDebitoTriage[]>([]);
  const [struttureDaSalvare, setStruttureDaSalvare] = useState<
    { ente: string; firma: string; mappatura: MappaturaProspetto; nome: string }[]
  >([]);
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
  const [esitoFogli, setEsitoFogli] = useState<string[]>([]);
  /**
   * Data a cui la verifica è riferita.
   *
   * Non è un dettaglio di comodo: da questa data discendono TRE cose —
   * quali periodi sono già esigibili (un periodo scade l'ultimo giorno del
   * mese successivo), quale sia l'anno precedente per il 30%, e da quanto
   * tempo un versamento è in ritardo. Usare implicitamente "oggi"
   * significava fare quei conti alla cieca e non poterli rifare domani
   * ottenendo lo stesso risultato.
   */
  const [dataVerifica, setDataVerifica] = useState(() => new Date().toISOString().slice(0, 10));
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

      // ---- Posizioni debitorie e strutture mappate ----------------------
      // Si salvano PRIMA di calcolare l'indicatore, che le legge.
      if (righeDebiti.length > 0) {
        const sd = await salvaTutteDebitiTriageAction(nomeSchema, c.aziendaId, righeDebiti);
        if (!sd.success) {
          setErrore(`Posizioni debitorie non salvate: ${sd.error ?? 'errore'}`);
        }
      }
      for (const st of struttureDaSalvare) {
        await salvaStrutturaProspettoAction(nomeSchema, st.ente, st.firma, st.mappatura, st.nome);
      }
      // ---- I documenti, prima della valutazione --------------------------
      // Ogni caricamento è indipendente: se uno fallisce, l'indicatore lo
      // registra come dimensione mancante e lo dichiara. Meglio un giudizio
      // parziale e onesto che nessun giudizio.

      // ---- Riconoscimento dei prospetti -----------------------------------
      // Si classifica ogni file dalle intestazioni, poi la logica di
      // elaborazione — invariata, e coperta dai test — riceve i file per
      // tipo come prima riceveva i campi fissi.
      const note: string[] = [];
      let fileVera: File | null = null;
      let fileDenunce: File | null = null;
      let fileDelegheDettaglio: File | null = null;
      let fileF24Aggregato: File | null = null;
      let fileInadempienze: File | null = null;
      for (const f of fileProspetti) {
        const tipo = await riconosciProspetto(f);
        if (tipo === 'VERA' && !fileVera) fileVera = f;
        else if (tipo === 'DENUNCE' && !fileDenunce) fileDenunce = f;
        // Deleghe per periodo e F24 aggregato NON si contendono lo stesso
        // posto: se arrivano entrambi, il primo caricato vinceva — e se era
        // l'aggregato, il ritardo diventava non calcolabile mentre il file
        // buono veniva scartato come duplicato.
        else if (tipo === 'DELEGHE' && !fileDelegheDettaglio) fileDelegheDettaglio = f;
        else if (tipo === 'F24_AGGREGATO' && !fileF24Aggregato) fileF24Aggregato = f;
        else if (tipo === 'INADEMPIENZE' && !fileInadempienze) fileInadempienze = f;
        else if (tipo === 'SCONOSCIUTO') {
          // Dichiarato, non scartato in silenzio: il file c'era, e chi l'ha
          // caricato deve sapere che non è stato usato.
          note.push(
            `«${f.name}»: struttura non riconosciuta. Non è stato usato — la mappatura manuale delle colonne per i prospetti liberi non è ancora disponibile.`
          );
        } else {
          note.push(`«${f.name}»: secondo file dello stesso tipo, ignorato — si usa il primo.`);
        }
      }

      // Il dettaglio per periodo prevale SEMPRE sull'aggregato: e' l'unico da
      // cui si misura il ritardo sul singolo versamento.
      const fileDeleghe: File | null = fileDelegheDettaglio ?? fileF24Aggregato;
      if (fileDelegheDettaglio && fileF24Aggregato) {
        note.push(
          `«${fileF24Aggregato.name}» (F24 aggregato) non usato: c'è anche l'Elenco Deleghe per periodo, che porta il dettaglio necessario al calcolo del ritardo.`
        );
      }

      for (const fx of fileXbrl) {
        setAvanzamento(`Analisi del bilancio XBRL (${fx.name})...`);
        try {
          // Via la rotta dedicata, non chiamando la libreria da qui:
          // `analizzaFileXbrl` legge le mappature dei tag dal database, e
          // importarla in un componente client trascinerebbe `pg` nel bundle
          // del browser — la build fallisce con "Can't resolve 'fs'".
          const fd = new FormData();
          fd.append('file', fx);
          const resp = await fetch('/api/xbrl/parse', { method: 'POST', body: fd });
          const esito = await resp.json();
          if (!resp.ok || !esito.success) {
            throw new Error(esito.error || 'Analisi non riuscita.');
          }
          await salvaAnalisiXbrlAziendaAction(nomeSchema, c.aziendaId, esito);
        } catch (e) {
          note.push(`Bilancio «${fx.name}» non analizzabile: ${String(e)}`);
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

      // ---- I fogli INPS riconosciuti ------------------------------------
      // Da qui vengono i numeri che prima si digitavano a mano, e il terzo
      // requisito dell'art. 25-novies che finora non era accertabile.
      let dovutoAnnoPrec: number | null = null;
      let nonVersato: number | null = null;
      let ritardo90: boolean | null = null;
      let periodiRitardo: number | null = null;
      let mancanti: string | null = null;
      const riferimento = new Date(`${dataVerifica}T12:00:00Z`);
      const annoPrec = riferimento.getUTCFullYear() - 1;

      let righeDenunce: Awaited<ReturnType<typeof leggiElencoDenunce>>['righe'] = [];
      if (fileDenunce) {
        setAvanzamento('Lettura dell’Elenco denunce...');
        const r = await leggiElencoDenunce(fileDenunce);
        if (r.colonneMancanti) {
          note.push(`Elenco denunce non riconosciuto: mancano ${r.colonneMancanti.join(', ')}.`);
        } else {
          righeDenunce = r.righe;
          const a = analizzaDenunce(r.righe, riferimento, annoPrec);
          dovutoAnnoPrec = a.dovutoPerAnno[annoPrec] ?? null;
          if (a.periodiMancanti.length > 0) {
            mancanti = a.periodiMancanti.join(', ');
            note.push(
              `Denunce non presentate per ${a.periodiMancanti.length} periodi: ${mancanti}.`
            );
          }
          // ZERO NON E' UN NUMERO, QUI. "Contributi dovuti 2025: 0 €" sembra
          // un dato rilevato e invece e' assenza di dato: nel file non c'era
          // nessuna denuncia per quell'anno. Su un'azienda che non presenta
          // denunce da due anni la differenza e' tutto.
          note.push(
            dovutoAnnoPrec === null
              ? `Contributi dovuti ${annoPrec}: nessuna denuncia presente nel file per quell’anno — il dato non è zero, semplicemente non c’è (ultimo periodo esigibile ${a.ultimoPeriodoDovuto}).`
              : `Contributi dovuti ${annoPrec}: ${Math.round(dovutoAnnoPrec).toLocaleString('it-IT')} € (ultimo periodo esigibile ${a.ultimoPeriodoDovuto}).`
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

      if (fileDeleghe && (await eF24Aggregato(fileDeleghe))) {
        note.push(
          'Il file F24 caricato è l’aggregato per anno di INPS-CPC: porta anno, posizione e importo pagato, senza periodo di competenza né data di versamento. Con questo il ritardo di oltre 90 giorni non è calcolabile — serve l’Elenco Deleghe del Cassetto, che è il massimo dettaglio ottenibile senza passare dall’Agenzia delle Entrate.'
        );
      } else if (fileDeleghe && righeDenunce.length > 0) {
        setAvanzamento('Lettura dell’Elenco Deleghe...');
        const r = await leggiElencoDeleghe(fileDeleghe);
        if (r.colonneMancanti) {
          note.push(`Elenco Deleghe non riconosciuto: mancano ${r.colonneMancanti.join(', ')}.`);
        } else {
          const c = analizzaVersamenti(righeDenunce, r.righe, riferimento);
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
        const salv = await salvaValoriSoglieParzialeAction(nomeSchema, c.aziendaId, {
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
          soglieAggiornateAl: dataVerifica,
        });
        // Se il salvataggio fallisce, i valori letti dai fogli non arrivano
        // all'indicatore e l'esito risulta incoerente con il riepilogo — che
        // mostra i numeri mentre il semaforo li dichiara mancanti. Va detto.
        if (!salv.success) {
          note.push(`Valori non salvati: ${salv.error ?? 'errore non riportato'}.`);
          setEsitoFogli([...note]);
        }
      }

      setAvanzamento('Calcolo dell’indicatore...');
      const a = await ottieniAttenzioneScreeningAction(nomeSchema, c.aziendaId);
      if (a.success && a.attenzione) {
        setAttenzione(a.attenzione);
        await registraEsitoVerificaAction(nomeSchema, c.aziendaId, a.attenzione.esito);
      } else {
        // PRIMA questo caso era muto: l'esito mostrava "Indicatore non
        // calcolabile con i dati inseriti" — una frase che accusa i dati
        // quando il problema può essere tutt'altro — e il motivo vero
        // restava nel risultato scartato.
        setErrore(a.error ?? 'Indicatore non calcolato: causa non riportata dal server.');
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
            // Trattenuta fino allo screening: se la generazione non parte o
            // fallisce, la visura resta disponibile e lo screening non la
            // richiede di nuovo. La elimina la generazione stessa.
            await registraVisuraTriageAction(nomeSchema, aziendaId, urlVisura, fileVisura.name);
          }
        } catch (e) {
          problemi.push(`Caricamento della visura non riuscito: ${String(e)}`);
        }

        if (urlVisura) {
          setAvanzamento('Generazione di screening e check list — un minuto circa...');
          try {
            const g =
              tipoSpazio === 'NON_ENTE'
                ? await generaPreCompilazioneMinisterialeAction(
                    nomeSchema,
                    aziendaId,
                    urlVisura,
                    fileVisura.name
                  )
                : await generaScreeningAziendaAction(
                    nomeSchema,
                    aziendaId,
                    urlVisura,
                    fileVisura.name
                  );
            if (!g.success) {
              problemi.push(
                `${tipoSpazio === 'NON_ENTE' ? 'Check List' : 'Screening'} non generata: ${g.error ?? 'errore'}`
              );
            }
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
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Il primo livello si regge su documenti pubblici, recuperabili da chiunque: la visura
                e il bilancio. Bastano a leggere l&apos;azienda e a fotografarne i conti, e
                collocano sulla soglia del CCII senza entrarci — per quello serve la posizione
                debitoria, più sotto.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600">
                Bilanci XBRL
              </label>
              <input
                type="file"
                accept=".xbrl,.xml"
                multiple
                onChange={(e) => {
                  const scelti = Array.from(e.target.files ?? []);
                  setFileXbrl((prev) => accumulaFile(prev, scelti));
                  // Si svuota il campo: senza, riscegliere lo stesso file non
                  // produce alcun evento e sembra che il clic non funzioni.
                  e.target.value = '';
                }}
                className="w-full font-mono text-xs text-slate-900 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-[10px] file:font-bold file:uppercase file:text-slate-700"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Anche più di uno: ogni bilancio porta due esercizi, quindi due bilanci danno tre
                anni di indici. Servono al quadro d&apos;insieme, mai al test delle soglie.
              </p>
              {fileXbrl.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {fileXbrl.map((f) => (
                    <li
                      key={`${f.name}|${f.size}`}
                      className="flex items-center gap-2 font-mono text-[10px] text-slate-600"
                    >
                      — {f.name}
                      <button
                        onClick={() => setFileXbrl((prev) => togliFile(prev, f))}
                        className="font-sans font-bold text-slate-400 hover:text-red-600"
                        aria-label={`Togli ${f.name}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Data di verifica
              </label>
              <input
                type="date"
                value={dataVerifica}
                onChange={(e) => setDataVerifica(e.target.value)}
                className={`${CLASSE_CAMPO} font-mono max-w-[12rem]`}
              />
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Da questa data discendono tre cose: quali periodi sono già esigibili (un periodo
                scade l&apos;ultimo giorno del mese successivo), quale sia l&apos;anno precedente
                per il 30%, e da quanto un versamento è in ritardo. Cambiandola, i conti si rifanno
                su quella data.
              </p>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <DebitiTriage
                nomeSchema={nomeSchema}
                aziendaId={aziendaId}
                dataVerifica={dataVerifica}
                prospetti={fileProspetti}
                onProspetti={setFileProspetti}
                onTogliProspetto={(f) => setFileProspetti((prev) => togliFile(prev, f))}
                onRighe={setRigheDebiti}
                onStruttura={(st) => setStruttureDaSalvare((prev) => [...prev, st])}
              />
            </div>

            <div className="border-t border-slate-100 pt-4">
              {/* Nessun documento la riporta: va dichiarata. Decide quale soglia
                  INPS si applica — il 30% congiunto a 15.000 € con lavoratori,
                  i soli 5.000 € senza. */}
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600">
                Lavoratori subordinati o parasubordinati
              </label>
              <select
                value={conLavoratori}
                onChange={(e) => setConLavoratori(e.target.value as '' | 'si' | 'no')}
                className={`${CLASSE_CAMPO} max-w-md`}
              >
                <option value="">Non dichiarato</option>
                <option value="si">Sì</option>
                <option value="no">No</option>
              </select>
              <p className="mt-1 text-[10px] text-slate-400">
                Nessun documento la riporta. Decide quale soglia si applica: con lavoratori il 30%
                congiunto a 15.000 €, senza la sola soglia di 5.000 €.
              </p>
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
                onClick={() => setMostraArchiviazione(true)}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Non procedo
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
