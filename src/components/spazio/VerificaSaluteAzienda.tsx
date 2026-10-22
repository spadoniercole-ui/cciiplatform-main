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

import { dichiarazionePerimetro } from '@/lib/revisore/perimetro';
import {
  htmlRiepilogoTriage,
  type DocumentoTriage,
  type ValoriTriage,
} from '@/lib/triage/riepilogoHtml';
import { stampaHtml } from '@/lib/stampaTesto';
import React, { useEffect, useState } from 'react';
import {
  Stethoscope,
  Upload,
  Check,
  AlertTriangle,
  ArrowRight,
  Printer,
  Info,
  Copy,
  ClipboardList,
  Building2,
  FileDown,
  Send,
} from 'lucide-react';
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
import { riconosciProspetto, leggiRuoli, type TipoProspetto } from '@/lib/denunce/lettura';
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
import {
  analizzaDenunce,
  analizzaInadempienze,
  analizzaVersamenti,
  partiteInpsPerAnzianita,
} from '@/lib/denunce/analisi';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { generaPreCompilazioneMinisterialeAction } from '@/app/actions/checklistMinisterialeAzienda';
import { registraVisuraTriageAction } from '@/app/actions/visuraTriage';
import { salvaAnalisiXbrlAziendaAction } from '@/app/actions/xbrlAzienda';
import {
  analizzaVera,
  estraiRigheVera,
  ritardoDaVera,
  totaliVera,
  type RigaVera,
} from '@/lib/debitiEnte/veraImport';
import {
  sostituisciDebitiVeraAction,
  ottieniMappaturaTitoliVera,
} from '@/app/actions/posizioneVera';
import { ottieniCategorieTipoDebito } from '@/app/actions/categorieTipoDebito';
import {
  ottieniLavorazioniTipoDebito,
  type LavorazioneTipoDebito,
} from '@/app/actions/lavorazioniTipoDebito';
import { componiComunicazioniVera, formattaImportoEuro } from '@/lib/lavorazioni/comunicazioni';
import { preparaDocumentiReparto, type DocumentoReparto } from '@/lib/lavorazioni/reparti';
import {
  MEZZI_INVIO,
  etichettaMezzo,
  riassumiConsegne,
  statoConsegnaReparto,
  type ConsegnaRegistrata,
  type MezzoInvio,
} from '@/lib/lavorazioni/consegne';
import {
  confermaInvioConsegnaAction,
  ottieniConsegneRepartiAction,
  registraConsegnaRepartoAction,
} from '@/app/actions/consegneReparti';
import { salvaValoriSoglieParzialeAction, valutaSoglieAction } from '@/app/actions/soglie25novies';
import { riepilogaSoglieTriage } from '@/lib/soglie25novies/triage';
import type { EsitoSoglie } from '@/lib/soglie25novies/calcolo';
import { SemaforoAttenzione } from '@/components/spazio/SemaforoAttenzione';
import { DebitiTriage } from '@/components/spazio/DebitiTriage';
import type { Attenzione } from '@/lib/screening/indicatore';
import { improntaFile } from '@/lib/fascicolo/impronta';
import { registraDocumentoOrigineAction } from '@/app/actions/documentiOrigine';

/** «21/10/2026, 15:42» — data e ora locali della consegna. */
function dataOraConsegna(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * «21/10/2026» — un giorno dichiarato (AAAA-MM-GG), senza ora.
 *
 * Non passa da Date di proposito: la data d'invio è un giorno civile, e
 * costruirla con `new Date(...)` la sposterebbe a seconda del fuso di chi
 * guarda (un invio del 21 può diventare il 20 a ovest di Greenwich).
 */
function dataInvio(iso: string): string {
  const [anno, mese, giorno] = iso.split('-');
  return anno && mese && giorno ? `${giorno}/${mese}/${anno}` : iso;
}

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
  const [avvisoCiclo, setAvvisoCiclo] = useState<string | null>(null);
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
  // Le scelte fatte sulle sovrapposizioni. Quella fra V.E.R.A. ed elenchi
  // decide cosa si salva come non versato: la applica questa pagina.
  const [scelteFonti, setScelteFonti] = useState<Record<string, string>>({});
  // Una sovrapposizione fra documenti non risolta blocca la conferma: si
  // sommerebbero due descrizioni dello stesso debito.
  const [conflittoAperto, setConflittoAperto] = useState(false);
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
  // Per il riepilogo stampabile: documenti letti e valori misurati.
  const [documentiTriage, setDocumentiTriage] = useState<DocumentoTriage[]>([]);
  const [valoriTriage, setValoriTriage] = useState<ValoriTriage | null>(null);
  /**
   * Esito delle soglie dell'art. 25-novies, calcolato a fine triage.
   *
   * È il secondo esito della verifica e vive prima del «Procedi»: un
   * parametro oltre soglia non impedisce la presa in carico — la decisione
   * resta all'operatore — ma non deve arrivare solo dentro una scheda che
   * si apre se qualcuno la cerca.
   */
  const [esitoSoglie, setEsitoSoglie] = useState<EsitoSoglie | null>(null);
  const [erroreSoglie, setErroreSoglie] = useState<string | null>(null);
  /**
   * Il V.E.R.A. è il presupposto del triage: senza, non si parte.
   * `tipiProspetti` è il riconoscimento fatto da DebitiTriage sui file
   * caricati; `haVera` guarda solo i file ancora presenti, così togliere il
   * V.E.R.A. richiude il passaggio.
   */
  const [tipiProspetti, setTipiProspetti] = useState<Record<string, TipoProspetto>>({});
  const [righeVera, setRigheVera] = useState<RigaVera[]>([]);
  const [lavorazioni, setLavorazioni] = useState<LavorazioneTipoDebito[]>([]);
  const [etichetteCategorie, setEtichetteCategorie] = useState<Record<string, string>>({});
  const [erroreComunicazioni, setErroreComunicazioni] = useState<string | null>(null);
  const [copiato, setCopiato] = useState<string | null>(null);
  const [erroreCopia, setErroreCopia] = useState<string | null>(null);
  // Il reparto di cui si sta preparando il PDF (null = nessuno) e l'eventuale
  // errore di generazione: il pulsante deve dire che sta lavorando e, se
  // qualcosa va storto, perché il file non è arrivato.
  const [pdfInCorso, setPdfInCorso] = useState<string | null>(null);
  const [errorePdf, setErrorePdf] = useState<string | null>(null);
  // Registro delle consegne: che cosa è già uscito da questa pagina, per
  // quale reparto e in quale versione. Righe grezze; il riepilogo per reparto
  // si calcola da qui (riassumiConsegne), così registrare un nuovo scaricamento
  // non richiede una seconda lettura del database.
  const [consegneReparti, setConsegneReparti] = useState<ConsegnaRegistrata[]>([]);
  const [erroreConsegne, setErroreConsegne] = useState<string | null>(null);
  const [avvisoConsegna, setAvvisoConsegna] = useState<string | null>(null);
  // La conferma d'invio: quale reparto ha il modulo aperto e i tre campi che
  // si stanno compilando. Uno alla volta: è una dichiarazione su un documento,
  // non un modulo da compilare in fila per tutti i reparti.
  const [confermaAperta, setConfermaAperta] = useState<string | null>(null);
  const [inviataIl, setInviataIl] = useState(() => new Date().toISOString().slice(0, 10));
  const [mezzoInvio, setMezzoInvio] = useState<MezzoInvio>('PEC');
  const [noteInvio, setNoteInvio] = useState('');
  const [invioInCorso, setInvioInCorso] = useState(false);
  const [erroreInvio, setErroreInvio] = useState<string | null>(null);
  const [avvisoInvio, setAvvisoInvio] = useState<string | null>(null);
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

  // Il registro si legge quando c'è un'azienda su cui leggerlo, e si rilegge
  // a ogni passaggio di fase: la scheda dei reparti compare nell'esito, ma il
  // registro deve essere già lì quando compare, non un istante dopo.
  useEffect(() => {
    if (!aziendaId) {
      setConsegneReparti([]);
      return;
    }
    let annullato = false;
    void ottieniConsegneRepartiAction(nomeSchema, aziendaId).then((r) => {
      if (annullato) return;
      if (!r.success) {
        setErroreConsegne(r.error ?? 'Registro delle consegne non leggibile.');
        return;
      }
      setErroreConsegne(null);
      setConsegneReparti(r.consegne);
    });
    return () => {
      annullato = true;
    };
  }, [nomeSchema, aziendaId, fase]);

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
    setEsitoSoglie(null);
    setErroreSoglie(null);
    setRigheVera([]);
    setLavorazioni([]);
    setEtichetteCategorie({});
    setErroreComunicazioni(null);
    setCopiato(null);
    setErroreCopia(null);
    try {
      // ---- Presupposto: il V.E.R.A. --------------------------------------
      // Non basta che il file sia nell'elenco: deve essere riconosciuto e
      // leggibile. Il controllo si fa PRIMA di creare l'azienda, così un
      // triage senza V.E.R.A. non lascia una pratica a metà.
      const tipi = await Promise.all(fileProspetti.map((f) => riconosciProspetto(f)));
      const indiceVera = tipi.indexOf('VERA');
      if (indiceVera < 0) {
        setErrore(
          'Il file V.E.R.A. è obbligatorio: senza, il triage non parte. Caricalo tra i prospetti e attendi che compaia «Posizione V.E.R.A.».'
        );
        return;
      }
      setAvanzamento('Lettura del file V.E.R.A....');
      let analisiVera: Awaited<ReturnType<typeof analizzaVera>>;
      try {
        analisiVera = await analizzaVera(fileProspetti[indiceVera]);
      } catch (e) {
        setErrore(`File V.E.R.A. non leggibile: ${String(e)}`);
        return;
      }

      const c = await creaAziendaInVerificaAction(nomeSchema, dati);
      if (!c.success || !c.aziendaId) {
        setErrore(c.error ?? 'Creazione non riuscita.');
        return;
      }
      setAziendaId(c.aziendaId);
      if (c.cicloArchiviato) {
        setAvvisoCiclo(
          'Questa azienda aveva già un’istruttoria: screening, Check List, posizioni debitorie e valori delle soglie sono stati archiviati e si riparte da zero. Il lavoro precedente resta consultabile nello Screening, in «Istruttorie precedenti».'
        );
      }

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
      // ---- Tipologie e lavorazioni per le comunicazioni -------------------
      // Servono a dare un destinatario alle posizioni V.E.R.A. Se una delle
      // letture fallisce il triage prosegue: le comunicazioni mancheranno,
      // ma l'esito non si perde.
      let mappaturaTitoli: Record<string, string> = {};
      try {
        const [mappa, lav, cat] = await Promise.all([
          ottieniMappaturaTitoliVera(nomeSchema),
          ottieniLavorazioniTipoDebito(nomeSchema),
          ottieniCategorieTipoDebito(nomeSchema),
        ]);
        if (mappa.success) mappaturaTitoli = mappa.mappatura;
        else
          setErroreComunicazioni(
            mappa.error ?? 'Mappatura delle sezioni V.E.R.A. non disponibile.'
          );
        if (lav.success) setLavorazioni(lav.lavorazioni);
        else setErroreComunicazioni(lav.error ?? 'Lavorazioni non disponibili.');
        if (cat.success) {
          setEtichetteCategorie(
            Object.fromEntries(cat.categorie.map((x) => [x.codice, x.etichetta]))
          );
        } else {
          setErroreComunicazioni(cat.error ?? 'Categorie di debito non disponibili.');
        }
      } catch (e) {
        setErroreComunicazioni(`Parametri delle comunicazioni non caricati: ${String(e)}.`);
      }
      let fileVera: File | null = null;
      let fileDenunce: File | null = null;
      let fileDelegheDettaglio: File | null = null;
      let fileF24Aggregato: File | null = null;
      let fileInadempienze: File | null = null;
      let fileRuoli: File | null = null;
      const ETICHETTA_PROSPETTO: Record<string, string> = {
        VERA: 'Posizione V.E.R.A.',
        DENUNCE: 'Elenco denunce (DM10/UniEmens)',
        DELEGHE: 'Elenco deleghe F24 per periodo',
        F24_AGGREGATO: 'F24 aggregato per anno',
        INADEMPIENZE: 'Lista inadempienze',
        RUOLI: 'Ruoli esattoriali',
        SCONOSCIUTO: 'Struttura non riconosciuta',
      };
      const documenti: DocumentoTriage[] = [];
      if (fileVisura)
        documenti.push({ nome: fileVisura.name, tipo: 'Visura camerale', esito: 'Anagrafica' });
      for (const fx of fileXbrl)
        documenti.push({
          nome: fx.name,
          tipo: 'Bilancio XBRL',
          esito: 'Equilibrio economico-finanziario',
        });
      for (const f of fileProspetti) {
        const tipo = await riconosciProspetto(f);
        const giaVisto =
          (tipo === 'VERA' && fileVera) ||
          (tipo === 'DENUNCE' && fileDenunce) ||
          (tipo === 'DELEGHE' && fileDelegheDettaglio) ||
          (tipo === 'F24_AGGREGATO' && fileF24Aggregato) ||
          (tipo === 'INADEMPIENZE' && fileInadempienze) ||
          (tipo === 'RUOLI' && fileRuoli);
        documenti.push({
          nome: f.name,
          tipo: ETICHETTA_PROSPETTO[tipo] ?? tipo,
          esito:
            tipo === 'SCONOSCIUTO'
              ? 'Non usato'
              : giaVisto
                ? 'Non usato: secondo file dello stesso tipo'
                : tipo === 'F24_AGGREGATO'
                  ? 'Solo totali annui: non misura il ritardo'
                  : 'Letto e usato',
        });
        if (tipo === 'VERA' && !fileVera) fileVera = f;
        else if (tipo === 'DENUNCE' && !fileDenunce) fileDenunce = f;
        // Deleghe per periodo e F24 aggregato NON si contendono lo stesso
        // posto: se arrivano entrambi, il primo caricato vinceva — e se era
        // l'aggregato, il ritardo diventava non calcolabile mentre il file
        // buono veniva scartato come duplicato.
        else if (tipo === 'DELEGHE' && !fileDelegheDettaglio) fileDelegheDettaglio = f;
        else if (tipo === 'F24_AGGREGATO' && !fileF24Aggregato) fileF24Aggregato = f;
        else if (tipo === 'INADEMPIENZE' && !fileInadempienze) fileInadempienze = f;
        else if (tipo === 'RUOLI' && !fileRuoli) fileRuoli = f;
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
          const regX = await registraDocumentoOrigineAction(
            nomeSchema,
            c.aziendaId,
            'XBRL',
            await improntaFile(fx)
          );
          await salvaAnalisiXbrlAziendaAction(
            nomeSchema,
            c.aziendaId,
            esito,
            regX.success && regX.documentoId ? regX.documentoId : null
          );
        } catch (e) {
          note.push(`Bilancio «${fx.name}» non analizzabile: ${String(e)}`);
        }
      }

      // Ritardo misurato sui periodi del V.E.R.A.: ripiego quando manca la
      // Lista Inadempienze (che resta la fonte prioritaria).
      let ritardoVera: ReturnType<typeof ritardoDaVera> = null;
      if (fileVera) {
        setAvanzamento('Lettura della Posizione V.E.R.A....');
        try {
          ritardoVera = ritardoDaVera(analisiVera.sezioni, new Date(`${dataVerifica}T12:00:00Z`));
          // In triage non si chiede di classificare i trattamenti, ma la
          // mappatura delle sezioni già configurata si applica: è quella che
          // dà una tipologia alle righe e permette di indirizzarle al
          // collega giusto. Le sezioni non mappate restano senza categoria.
          const { righe } = estraiRigheVera(analisiVera.sezioni, mappaturaTitoli, {}, true);
          setRigheVera(righe);
          // Le poste del V.E.R.A. non vanno tutte nella stessa base: dirlo qui
          // evita che l'operatore si chieda perché la soglia INPS non usa il
          // totale del file.
          const totVera = totaliVera(righe);
          if (totVera.creditiAgente > 0) {
            note.push(
              `V.E.R.A.: ${Math.round(totVera.creditiAgente).toLocaleString('it-IT')} € sono crediti già affidati all’Agente della Riscossione (cartelle, al netto delle partite sospese). Contano per la soglia dell’Agente (art. 25-novies, comma 1, lett. d), non per quella INPS.`
            );
          }
          if (totVera.sanzioni > 0) {
            note.push(
              `V.E.R.A.: ${Math.round(totVera.sanzioni).toLocaleString('it-IT')} € sono sanzioni presunte. Restano fuori dalla soglia INPS, che riguarda i contributi: la base confrontata è ${Math.round(totVera.contributiInps).toLocaleString('it-IT')} €.`
            );
          }
          if (righe.length > 0) {
            const reg = await registraDocumentoOrigineAction(
              nomeSchema,
              c.aziendaId,
              'VERA',
              await improntaFile(fileVera)
            );
            await sostituisciDebitiVeraAction(
              nomeSchema,
              c.aziendaId,
              righe,
              reg.success && reg.documentoId ? reg.documentoId : null
            );
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
      let creditiAffidatiNetti: number | null = null;
      // Il ritardo della lettera a) viene dalla Lista Inadempienze quando c'è:
      // le deleghe non lo sovrascrivono.
      let ritardoDaLista = false;
      let ritardo90: boolean | null = null;
      let periodiRitardo: number | null = null;
      let mancanti: string | null = null;
      // true quando l'Elenco denunce è stato letto: anche «nessuna mancante»
      // è un esito, e va conservato (stringa vuota) perché lo Screening e
      // l'IAI non lo scambino per un dato assente.
      let denunceAnalizzate = false;
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
          denunceAnalizzate = true;
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
          // Le partite iscritte a ruolo escono dalla soglia INPS SEMPRE, non
          // solo quando c'è il file dei ruoli: consegnate all'Agente della
          // Riscossione, per l'Istituto sono chiuse — resta l'attesa del
          // riversamento (chiarimento di Ercole, come per l'INAIL). Prima si
          // escludevano solo per evitare il doppio conteggio con i ruoli, e
          // senza quel file restavano dentro la lettera a).
          const b = analizzaInadempienze(r.righe, { escludiIscritteARuolo: true });
          // Della partite rimaste all'Istituto, contano per la lettera a)
          // SOLO quelle scadute da oltre 90 giorni: importo e ritardo devono
          // riguardare lo stesso debito (regola di Ercole). Il ritardo si
          // ricava dalla partita stessa, non più dalle deleghe su tutti i
          // periodi — che comprendevano debito già passato a ruolo.
          const anz = partiteInpsPerAnzianita(r.righe, riferimento);
          const bScadute = analizzaInadempienze(anz.scadute);
          const bRecenti = analizzaInadempienze(anz.recenti);
          nonVersato = bScadute.totaleNonVersato;
          ritardo90 = bScadute.totaleNonVersato > 0;
          ritardoDaLista = true;
          if (bRecenti.totaleNonVersato > 0) {
            note.push(
              `Partite rimaste all’INPS scadute da meno di 90 giorni: ${Math.round(bRecenti.totaleNonVersato).toLocaleString('it-IT')} € — non ancora rilevanti per la soglia, che richiede un ritardo di oltre 90 giorni.`
            );
          }
          // Scritta secca, questa cifra si leggeva come IL debito anche quando
          // non lo era: chi si fermava alla prima riga non arrivava alla nota
          // che la correggeva.
          note.push(
            scelteFonti['vera:elenchi'] === 'VERA'
              ? `Lista Inadempienze: ${Math.round(nonVersato).toLocaleString('it-IT')} € — non usati come debito: la fonte scelta è il V.E.R.A., che li comprende.`
              : `Lista Inadempienze, partite rimaste all’INPS e scadute da oltre 90 giorni — quelle che contano per la soglia INPS: ${Math.round(nonVersato).toLocaleString('it-IT')} €. Il ritardo è misurato su queste stesse partite.`
          );
          if (b.esclusePerRuolo.righe > 0) {
            note.push(
              `${b.esclusePerRuolo.righe} inadempienze escluse dalla soglia INPS perché già iscritte a ruolo (${Math.round(b.esclusePerRuolo.importo).toLocaleString('it-IT')} €): consegnate all’Agente della Riscossione, per l’Istituto la partita è chiusa. Rilevano, se ne ricorrono i requisiti, per la soglia dell’Agente (art. 25-novies, comma 1, lett. d).`
            );
          }
          if (b.anniConSaldoNegativo.length > 0) {
            note.push(
              `Anni con accrediti superiori agli addebiti (non compensati): ${b.anniConSaldoNegativo.join(', ')}.`
            );
          }
        }
      }

      // ---- Ruoli esattoriali: residui aperti, credito dell'ente ----------
      // Si somma tutto il residuo, qualunque sia la data di notifica: una
      // cartella del 2021 ancora aperta è debito di oggi.
      if (fileRuoli) {
        setAvanzamento('Lettura dei Ruoli Esattoriali...');
        const ru = await leggiRuoli(fileRuoli);
        if (ru.colonneMancanti) {
          note.push(
            `Ruoli esattoriali non riconosciuti: mancano ${ru.colonneMancanti.join(', ')}.`
          );
        } else {
          // NON si sommano più al non versato INPS: vanno sulla soglia
          // dell'Agente della Riscossione, al netto della parte sospesa dal
          // giudice, che non è definitivamente accertata.
          creditiAffidatiNetti = Math.max(0, ru.residuo - ru.sospeso);
          const eu = (x: number) => Math.round(x).toLocaleString('it-IT');
          note.push(
            `Ruoli esattoriali: ${ru.cartelle} cartelle, residuo ${eu(ru.residuo)} €` +
              (ru.sospeso > 0
                ? `, di cui ${eu(ru.sospeso)} € sospesi dal giudice in attesa del merito — esclusi, perché non definitivamente accertati`
                : '') +
              `. Contano per la soglia dell’Agente della Riscossione (lettera d), non per quella INPS: ${eu(creditiAffidatiNetti)} €. Restano da verificare data di affidamento, scadenza e stato di rateizzazione, che il file non riporta.`
          );
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
          if (!ritardoDaLista) ritardo90 = periodiRitardo > 0;
          note.push(
            ritardoDaLista
              ? `Versamenti in ritardo oltre 90 giorni secondo le deleghe: ${periodiRitardo} periodi — dato complessivo, che comprende periodi già passati a ruolo. Per la soglia INPS vale il ritardo delle sole partite rimaste all’Istituto, dalla Lista Inadempienze.`
              : `Ritardo oltre 90 giorni: ${periodiRitardo} periodi, per ${Math.round(c.dovutoInRitardo).toLocaleString('it-IT')} € di contributi dovuti.`
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

      // Né Lista Inadempienze né Elenco Deleghe utilizzabile: il ritardo si
      // misura sui periodi delle partite del V.E.R.A. Prima restava «non
      // determinabile» pur avendo nel file, riga per riga, periodo e importo.
      if (ritardo90 === null && ritardoVera) {
        ritardo90 = ritardoVera.partite > 0;
        periodiRitardo = ritardoVera.periodi.length;
        note.push(
          ritardoVera.partite > 0
            ? `Ritardo oltre 90 giorni misurato sul V.E.R.A.: ${ritardoVera.partite} partite contabilizzate (${ritardoVera.periodi.length} periodi, dal ${[...ritardoVera.periodi].sort()[0]} al ${[...ritardoVera.periodi].sort().pop()}) per ${Math.round(ritardoVera.importo).toLocaleString('it-IT')} €, scadute — il 16 del mese successivo al periodo — da oltre 90 giorni alla data della verifica.`
            : 'Ritardo oltre 90 giorni misurato sul V.E.R.A.: nessuna partita contabilizzata scaduta da oltre 90 giorni alla data della verifica.'
        );
      }

      if (scelteFonti['vera:elenchi'] === 'VERA') {
        note.push(
          'Fonte del debito: il V.E.R.A., per scelta. Inadempienze e ruoli non sono stati sommati, perché già compresi.'
        );
      } else if (scelteFonti['vera:elenchi'] === 'ELENCHI') {
        note.push(
          'Fonte del debito: inadempienze e ruoli, per scelta. Il V.E.R.A. non è stato sommato: resta consultabile nella sua scheda.'
        );
      }
      setEsitoFogli(note);
      setDocumentiTriage(documenti);
      setValoriTriage({
        conLavoratori: conLavoratori === '' ? null : conLavoratori === 'si',
        annoPrecedente: annoPrec,
        contributiDovutiAnnoPrecedente:
          dovutoAnnoPrec ?? (contributiDovuti.trim() === '' ? null : Number(contributiDovuti)),
        nonVersatoOltre90: nonVersato,
        ritardoOltre90Giorni: ritardo90,
        periodiInRitardo: periodiRitardo,
        denunceNonPresentate: mancanti ?? (denunceAnalizzate ? '' : null),
        creditiAffidatiAgente: creditiAffidatiNetti,
      });

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
          // Scelto il V.E.R.A., il non versato degli elenchi NON si salva:
          // l'indicatore userà l'esposizione del V.E.R.A., che li comprende.
          // Prima gli elenchi vincevano sempre, e il V.E.R.A. spariva in
          // silenzio anche quando era la fonte che si voleva usare.
          contributiScaduti:
            scelteFonti['vera:elenchi'] === 'VERA' ? undefined : (nonVersato ?? undefined),
          ritardoOltre90Giorni: ritardo90 ?? undefined,
          creditiAffidatiAer: creditiAffidatiNetti ?? undefined,
          periodiInRitardo: periodiRitardo ?? undefined,
          denunceNonPresentate: mancanti ?? (denunceAnalizzate ? '' : undefined),
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

      // ---- Soglie di segnalazione (art. 25-novies) ----------------------
      // Stesso momento dell'indicatore, stesso oggetto: l'azienda appena
      // confermata e i valori appena salvati. Un errore qui non annulla il
      // triage — l'indicatore è già calcolato e registrato — ma non può
      // restare muto, altrimenti l'assenza dell'esito sembrerebbe un esito.
      setAvanzamento('Verifica delle soglie di segnalazione...');
      try {
        const s = await valutaSoglieAction(nomeSchema, c.aziendaId, tipoSpazio);
        if (s.success && s.esito) setEsitoSoglie(s.esito);
        else setErroreSoglie(s.error ?? 'Valutazione non riuscita per causa non riportata.');
      } catch (e) {
        setErroreSoglie(String(e));
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
    setEsitoSoglie(null);
    setErroreSoglie(null);
    setTipiProspetti({});
    setRigheVera([]);
    setLavorazioni([]);
    setEtichetteCategorie({});
    setErroreComunicazioni(null);
    setCopiato(null);
    setErroreCopia(null);
  };

  const stampaRiepilogo = () => {
    const sede = dati
      ? [
          dati.indirizzoSedeLegale,
          dati.cap,
          dati.citta,
          dati.provincia ? `(${dati.provincia})` : null,
        ]
          .filter(Boolean)
          .join(' ')
      : null;
    stampaHtml(
      `Riepilogo del triage — ${dati?.ragioneSociale ?? 'azienda'}`,
      htmlRiepilogoTriage({
        azienda: dati?.ragioneSociale ?? 'Azienda',
        codiceFiscale: dati?.codiceFiscale ?? null,
        partitaIva: dati?.partitaIva ?? null,
        sede: sede || null,
        dataVerifica,
        perimetro: dichiarazionePerimetro('TRIAGE'),
        documenti: documentiTriage,
        note: esitoFogli,
        valori: valoriTriage ?? {
          conLavoratori: conLavoratori === '' ? null : conLavoratori === 'si',
          annoPrecedente: new Date(`${dataVerifica}T12:00:00Z`).getUTCFullYear() - 1,
          contributiDovutiAnnoPrecedente:
            contributiDovuti.trim() === '' ? null : Number(contributiDovuti),
          nonVersatoOltre90: null,
          ritardoOltre90Giorni: null,
          periodiInRitardo: null,
          denunceNonPresentate: null,
          creditiAffidatiAgente: null,
        },
        attenzione,
      }),
      undefined,
      new Date().toISOString()
    );
  };

  const procedi = async () => {
    if (!aziendaId) return;
    setInCorso(true);
    setErrore(null);
    const problemi: string[] = [];

    try {
      if (!fileVisura) {
        problemi.push(
          tipoSpazio === 'NON_ENTE'
            ? 'Visura non disponibile in questa sessione: la check list non è stata pre-compilata.'
            : 'Visura non disponibile in questa sessione: per lo screening andrà caricata nella scheda Screening.'
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

        // SPAZIO ENTE: lo screening NON si genera qui. Il vincolo è che nessuna
        // funzione successiva parta prima che l'ente abbia salvato almeno un
        // suo parametro (matricola, posizione…): da lì in poi l'azienda si
        // riconosce con i riferimenti interni e non con quelli camerali. La
        // visura resta trattenuta e la prima elaborazione parte da sola al
        // salvataggio dell'Anagrafica Ente.
        if (urlVisura && tipoSpazio === 'NON_ENTE') {
          setAvanzamento('Pre-compilazione della check list — un minuto circa...');
          try {
            const g = await generaPreCompilazioneMinisterialeAction(
              nomeSchema,
              aziendaId,
              urlVisura,
              fileVisura.name
            );
            if (!g.success) {
              problemi.push(`Check List non generata: ${g.error ?? 'errore'}`);
            }
          } catch (e) {
            problemi.push(`Check List non generata: ${String(e)}`);
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
        // ENTE: si va ai parametri dell'ente, il passo che sblocca il resto.
        // NON_ENTE: alla scheda, dove la check list è pronta.
        window.location.href =
          tipoSpazio === 'NON_ENTE'
            ? `/spazio/${codice}/aziende/${aziendaId}`
            : `/spazio/${codice}/aziende/${aziendaId}/posizione-ente`;
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

  const riepilogoSoglie = esitoSoglie ? riepilogaSoglieTriage(esitoSoglie) : null;

  // Il V.E.R.A. è presente solo se il file che lo rappresenta è ancora
  // nell'elenco: toglierlo richiude il passaggio alla conferma.
  const haVera = fileProspetti.some((f) => tipiProspetti[f.name] === 'VERA');

  const comunicazioni = componiComunicazioniVera({
    azienda: dati?.ragioneSociale?.trim() || 'Azienda',
    dataVerifica,
    righe: righeVera,
    lavorazioni,
    etichette: etichetteCategorie,
  });

  // Un documento per reparto: le posizioni da lavorare e le attività di
  // contabilizzazione, da scaricare e inviare per conto proprio. Sta accanto
  // alla presa in carico, non al posto suo: chi decide di non procedere ha
  // comunque bisogno di sapere che cosa c'è da contabilizzare, e chi procede
  // deve poter consegnare i debiti ai reparti prima che il resto parta.
  const documentiReparti = preparaDocumentiReparto({
    azienda: dati?.ragioneSociale?.trim() || 'Azienda',
    dataVerifica,
    righe: righeVera,
    lavorazioni,
    etichette: etichetteCategorie,
  });

  // Il registro per reparto: l'ultima consegna e quante volte il documento è
  // uscito. Il confronto con `versione` dice se il reparto ha in mano il
  // documento che si sta guardando o una versione precedente.
  const consegnePerReparto = new Map(
    riassumiConsegne(consegneReparti).map((c) => [c.reparto.toLocaleLowerCase('it-IT'), c])
  );
  const repartiConDocumento = new Set(
    documentiReparti.documenti.map((d) => d.reparto.toLocaleLowerCase('it-IT'))
  );
  const consegneFuoriConfigurazione = Array.from(consegnePerReparto.values()).filter(
    (c) => !repartiConDocumento.has(c.reparto.toLocaleLowerCase('it-IT'))
  );

  /**
   * Il PDF si carica solo quando si scarica: jsPDF pesa quanto mezza pagina,
   * e la verifica si usa molto più spesso di quanto si scarichi il documento.
   * Un caricamento fallito non resta muto — la pagina è la stessa che deve
   * produrre quel file.
   */
  const scaricaDocumentoReparto = async (documento: DocumentoReparto) => {
    setErrorePdf(null);
    setAvvisoConsegna(null);
    setPdfInCorso(documento.reparto);
    try {
      const { scaricaPdfReparto } = await import('@/lib/lavorazioni/pdfReparto');
      scaricaPdfReparto(documento);
    } catch (e) {
      setErrorePdf(`PDF non generato: ${String(e)}`);
      setPdfInCorso(null);
      return;
    }

    // Il file è già salvato: da qui in poi nulla può toglierlo. La
    // registrazione viene dopo di proposito — un registro che non risponde
    // non deve impedire di consegnare il documento al reparto — e se fallisce
    // lo dice, perché allora la piattaforma non sa che quel foglio è uscito.
    if (aziendaId) {
      const r = await registraConsegnaRepartoAction(nomeSchema, aziendaId, {
        reparto: documento.reparto,
        dataVerifica: documento.dataVerifica,
        versione: documento.versione,
        nomeFile: documento.nomeFile,
        righe: documento.righe,
        totale: documento.totale,
        posizioniDaContabilizzare: documento.posizioniDaContabilizzare,
        importoDaContabilizzare: documento.importoDaContabilizzare,
      });
      const registrata = r.consegna;
      if (r.success && registrata) {
        setConsegneReparti((prev) => [registrata, ...prev]);
        // Il passo successivo è dichiarare l'invio: il modulo si apre da solo
        // sotto il reparto appena scaricato, con la data di oggi già dentro.
        // È una proposta, non un obbligo — chi scarica per archiviare la
        // lascia chiusa e la dichiara quando spedisce davvero.
        setInviataIl(new Date().toISOString().slice(0, 10));
        setNoteInvio('');
        setErroreInvio(null);
        setAvvisoInvio(null);
        setConfermaAperta(documento.reparto);
      } else {
        setAvvisoConsegna(
          `Documento scaricato, ma la consegna non è stata registrata: ${
            r.error ?? 'errore sconosciuto'
          }`
        );
      }
    }
    setPdfInCorso(null);
  };

  /**
   * Dichiara che il documento di un reparto è stato spedito.
   *
   * L'invio vero — la PEC, la mail, il protocollo — lo fa l'ufficio: qui se ne
   * conserva la traccia, con il nome di chi la dichiara. Se la conferma c'è
   * già, l'azione la rifiuta invece di sovrascriverla, e la pagina lo dice.
   */
  const confermaInvioReparto = async (documento: DocumentoReparto) => {
    if (!aziendaId) return;
    const riepilogo = consegnePerReparto.get(documento.reparto.toLocaleLowerCase('it-IT'));
    if (!riepilogo) return;
    setInvioInCorso(true);
    setErroreInvio(null);
    setAvvisoInvio(null);
    try {
      const r = await confermaInvioConsegnaAction(nomeSchema, aziendaId, riepilogo.ultima.id, {
        inviataIl,
        mezzo: mezzoInvio,
        note: noteInvio,
      });
      const aggiornata = r.consegna;
      if (r.success && aggiornata) {
        setConsegneReparti((prev) => prev.map((c) => (c.id === aggiornata.id ? aggiornata : c)));
        setConfermaAperta(null);
        setNoteInvio('');
        setAvvisoInvio(`Invio confermato per ${documento.reparto}.`);
      } else {
        setErroreInvio(r.error ?? 'Conferma non registrata.');
      }
    } finally {
      setInvioInCorso(false);
    }
  };

  const copiaTesto = async (chiave: string, testo: string) => {
    setErroreCopia(null);
    try {
      await navigator.clipboard.writeText(testo);
      setCopiato(chiave);
      window.setTimeout(() => {
        setCopiato((prev) => (prev === chiave ? null : prev));
      }, 2000);
    } catch {
      setErroreCopia('Copia non riuscita: seleziona il testo e copialo a mano.');
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

      {avvisoCiclo && (
        <div className="flex items-start gap-2 text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-lg p-3">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{avvisoCiclo}</p>
        </div>
      )}

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

            {!haVera && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1">
                <p className="text-[11px] font-bold text-amber-900">
                  Il file V.E.R.A. è obbligatorio
                </p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Senza il V.E.R.A. il triage non parte: caricalo tra i prospetti qui sotto e
                  attendi che compaia «Posizione V.E.R.A.» accanto al nome del file.
                </p>
              </div>
            )}

            <div className="border-t border-slate-100 pt-4">
              <DebitiTriage
                nomeSchema={nomeSchema}
                aziendaId={aziendaId}
                dataVerifica={dataVerifica}
                prospetti={fileProspetti}
                onProspetti={setFileProspetti}
                onTogliProspetto={(f) => setFileProspetti((prev) => togliFile(prev, f))}
                onRighe={setRigheDebiti}
                onTipi={setTipiProspetti}
                onConflitto={setConflittoAperto}
                onScelte={setScelteFonti}
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

          {conflittoAperto && (
            <p className="text-[11px] font-bold text-red-700">
              Conferma bloccata: c&apos;è una sovrapposizione fra documenti da risolvere, più sopra.
            </p>
          )}

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
              disabled={inCorso || !dati.ragioneSociale || conflittoAperto || !haVera}
              title={
                haVera
                  ? undefined
                  : 'Carica il file V.E.R.A.: è obbligatorio per eseguire il triage.'
              }
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
            {tipoSpazio === 'NON_ENTE'
              ? 'La check list si genera dalla scheda azienda, come si è sempre fatto: nulla è andato perduto, manca solo la preparazione automatica.'
              : 'Salva i parametri dell’ente in Posizione Ente › Anagrafica: con la visura disponibile la prima elaborazione dello screening parte da sola; altrimenti caricala nella scheda Screening.'}
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
          {/* Dichiarazione di perimetro: stesso testo che apre Screening e Relazione, al livello del data entry. */}
          <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 whitespace-pre-line mb-3">
            {dichiarazionePerimetro('TRIAGE')}
          </p>
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
          {riepilogoSoglie && (
            <div
              className={`rounded-xl border p-5 space-y-2 ${
                riepilogoSoglie.stato === 'superate'
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                Soglie di segnalazione (art. 25-novies)
              </h3>
              <p
                className={`text-xs font-bold ${
                  riepilogoSoglie.stato === 'superate' ? 'text-amber-900' : 'text-slate-700'
                }`}
              >
                {riepilogoSoglie.titolo}
              </p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {riepilogoSoglie.dettaglio}
              </p>
              {riepilogoSoglie.superate.length > 0 && (
                <ul className="space-y-1">
                  {riepilogoSoglie.superate.map((r) => (
                    <li
                      key={`${r.ente}-${r.ambito}`}
                      className="flex gap-2 text-[11px] leading-relaxed text-amber-900"
                    >
                      <span className="shrink-0 text-amber-500">—</span>
                      <span>
                        <span className="font-bold">{r.ambito}</span>: {r.valore}
                        {r.esposizione !== null && (
                          <>
                            {' '}
                            — importo confrontato{' '}
                            {Math.round(r.esposizione).toLocaleString('it-IT')} €
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {aziendaId && (
                <a
                  href={`/spazio/${codice}/aziende/${aziendaId}/posizione-ente?scheda=soglie`}
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-700 hover:text-sky-800"
                >
                  Apri le soglie di segnalazione <ArrowRight className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
          {erroreSoglie && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
              {`Soglie di segnalazione non valutate: ${erroreSoglie} Il triage resta valido; le soglie si possono verificare dalla scheda dell’azienda.`}
            </p>
          )}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-slate-500" />
              <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                Comunicazioni ai colleghi
              </h3>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Preparate dai dati del file V.E.R.A. e dalle lavorazioni configurate. Non vengono
              inviate: copia il testo e invialo tu al collega che se ne occupa.
            </p>

            {erroreComunicazioni && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
                {`${erroreComunicazioni} Le comunicazioni non sono state preparate; il triage resta valido.`}
              </p>
            )}

            {comunicazioni.comunicazioni.length === 0 ? (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {erroreComunicazioni
                  ? 'Nessuna comunicazione preparata: mancano i parametri necessari.'
                  : lavorazioni.length === 0
                    ? 'Nessuna lavorazione configurata: aggiungila nei Parametri di Spazio per preparare le comunicazioni.'
                    : 'Nessuna posizione V.E.R.A. riconducibile a una lavorazione attiva.'}
              </p>
            ) : (
              <div className="space-y-2">
                {comunicazioni.comunicazioni.map((c) => {
                  const chiave = c.destinatario;
                  return (
                    <details key={chiave} className="border border-slate-200 rounded-lg">
                      <summary className="cursor-pointer p-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900">{c.destinatario}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {c.righe} {c.righe === 1 ? 'posizione' : 'posizioni'} ·{' '}
                          {formattaImportoEuro(c.totale)}
                        </span>
                      </summary>
                      <div className="border-t border-slate-100 p-3 space-y-2">
                        <p className="text-[11px] text-slate-700">
                          <span className="font-bold">Oggetto:</span> {c.oggetto}
                        </p>
                        <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] leading-relaxed text-slate-800 font-sans">
                          {c.corpo}
                        </pre>
                        <button
                          type="button"
                          onClick={() => void copiaTesto(chiave, c.corpo)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                        >
                          {copiato === chiave ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copiato === chiave ? 'Copiato' : 'Copia testo'}
                        </button>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}

            {comunicazioni.categorieSenzaLavorazione.length > 0 && (
              <div className="border-t border-slate-100 pt-3 space-y-1">
                <p className="text-[11px] font-bold text-amber-800">Tipologie senza lavorazione</p>
                <ul className="space-y-1">
                  {comunicazioni.categorieSenzaLavorazione.map((c) => (
                    <li
                      key={c.categoria}
                      className="flex gap-2 text-[11px] leading-relaxed text-amber-800"
                    >
                      <span className="shrink-0 text-amber-500">—</span>
                      <span>
                        {c.etichetta}: {c.righe} {c.righe === 1 ? 'posizione' : 'posizioni'},{' '}
                        {formattaImportoEuro(c.totale)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Restano fuori dalle comunicazioni finché non configuri la lavorazione.
                </p>
              </div>
            )}

            {comunicazioni.righeSenzaCategoria > 0 && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
                {`${comunicazioni.righeSenzaCategoria} ${
                  comunicazioni.righeSenzaCategoria === 1
                    ? 'posizione V.E.R.A. non ha'
                    : 'posizioni V.E.R.A. non hanno'
                } una categoria: le sezioni non sono mappate e restano fuori dalle comunicazioni.`}{' '}
                {tipoSpazio === 'ENTE' && aziendaId && (
                  <a
                    href={`/spazio/${codice}/aziende/${aziendaId}/posizione-ente?scheda=vera`}
                    className="font-bold text-sky-700 hover:underline"
                  >
                    Mappa le sezioni in Posizione V.E.R.A.
                  </a>
                )}
              </p>
            )}

            {erroreCopia && <p className="text-[11px] text-red-700">{erroreCopia}</p>}

            <a
              href={`/spazio/${codice}/parametri/lavorazioni`}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-700 hover:text-sky-800"
            >
              Configura le lavorazioni <ArrowRight className="w-3 h-3" />
            </a>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={stampaRiepilogo}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase rounded-lg"
              title="Documenti caricati e letti, valori misurati, indicazione del triage e perimetro: da consegnare al responsabile"
            >
              <Printer className="w-3.5 h-3.5" /> Stampa il riepilogo del triage (PDF)
            </button>
          </div>

          {/*
            COMUNICA AI REPARTI — l'ultimo passo del triage, prima della presa
            in carico. Non è un'alternativa al «Procedi»: serve a entrambe le
            strade, perché anche chi non procede deve poter portare a
            contabilizzazione i debiti che ha in mano.
          */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-500" />
              <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                Comunica ai reparti
              </h3>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Un PDF per reparto: i debiti da lavorare, le attività di contabilizzazione e i totali.
              Si scarica da qui e lo invii tu all&apos;ufficio — la piattaforma non manda nulla, e
              questa funzione non sostituisce né impedisce la presa in carico. Ogni scaricamento
              resta registrato con data, totali e versione del documento: «consegnato» qui vuol dire
              scaricato, l&apos;invio è cosa tua. Quando lo spedisci puoi dichiararlo — data, mezzo
              e note — e il registro conserva la dichiarazione con il tuo nome.
            </p>

            {documentiReparti.documenti.length === 0 ? (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {lavorazioni.length === 0
                  ? 'Nessuna lavorazione configurata: senza una lavorazione per tipologia non c’è un reparto a cui indirizzare i debiti. Aggiungila nei Parametri di Spazio.'
                  : 'Nessuna posizione V.E.R.A. riconducibile a una lavorazione attiva: non c’è un reparto a cui indirizzare i debiti.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {' '}
                {documentiReparti.documenti.map((d) => {
                  const stato = statoConsegnaReparto(
                    consegnePerReparto.get(d.reparto.toLocaleLowerCase('it-IT')),
                    d.versione
                  );
                  // Estratto una volta: nella scheda si legge tre volte, e un
                  // `?.` ripetuto su una catena lunga è dove nascono i «forse
                  // nullo» che poi si aggiustano con un `!` di troppo.
                  const invioConfermato =
                    stato.stato === 'mai' ? null : stato.consegna.ultima.invio;
                  return (
                    <li
                      key={d.reparto}
                      className="border border-slate-200 rounded-lg p-3 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-slate-900">
                            {d.reparto}
                          </span>
                          <span className="block text-[10px] text-slate-500 font-mono">
                            {d.righe} {d.righe === 1 ? 'posizione' : 'posizioni'} ·{' '}
                            {formattaImportoEuro(d.totale)} · {d.attivita.length} attività
                            {d.posizioniDaContabilizzare > 0
                              ? ` · ${d.posizioniDaContabilizzare} da contabilizzare`
                              : ''}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void scaricaDocumentoReparto(d)}
                          disabled={pdfInCorso !== null}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <FileDown className="w-3.5 h-3.5" />{' '}
                          {pdfInCorso === d.reparto ? 'Preparazione...' : 'Scarica il PDF'}
                        </button>
                      </div>

                      {stato.stato === 'mai' ? (
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Mai scaricato: nessuna consegna registrata per questo reparto.
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                          Consegnato il {dataOraConsegna(stato.consegna.ultima.consegnatoIl)}
                          {stato.consegna.ultima.consegnatoDa
                            ? ` da ${stato.consegna.ultima.consegnatoDa}`
                            : ''}{' '}
                          · versione{' '}
                          <span className="font-mono">{stato.consegna.ultima.versione}</span> ·{' '}
                          {stato.consegna.scaricamenti === 1
                            ? '1 scaricamento'
                            : `${stato.consegna.scaricamenti} scaricamenti`}
                        </p>
                      )}

                      {stato.stato === 'superata' && (
                        <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed">
                          Il documento è cambiato dopo quella consegna (ora versione{' '}
                          <span className="font-mono">{d.versione}</span>): il reparto ha in mano la
                          precedente. Riscarica il PDF e invia la nuova versione.
                        </p>
                      )}

                      {/*
                        LA CONFERMA D'INVIO — la seconda metà della consegna.
                        Il registro sa che il foglio è uscito dalla piattaforma;
                        non sa se è arrivato al reparto. Chi lo spedisce lo
                        dichiara qui, e la dichiarazione porta la sua firma.
                        Senza, la riga resta muta: «invio non confermato» è un
                        fatto, «non inviato» sarebbe una supposizione.
                      */}
                      {stato.stato !== 'mai' &&
                        (invioConfermato ? (
                          <div className="text-[10px] text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg p-2 leading-relaxed space-y-0.5">
                            <p className="flex items-start gap-1.5">
                              <Check className="w-3 h-3 shrink-0 mt-0.5" />
                              <span>
                                <span className="font-bold">
                                  Inviato il {dataInvio(invioConfermato.inviataIl)} via{' '}
                                  {etichettaMezzo(invioConfermato.mezzo)}
                                </span>
                                {invioConfermato.confermatoDa
                                  ? ` — dichiarato da ${invioConfermato.confermatoDa}`
                                  : ''}
                                {`, registrato il ${dataOraConsegna(invioConfermato.confermatoIl)}`}
                                .
                              </span>
                            </p>
                            {invioConfermato.note && (
                              <p className="pl-5 italic text-emerald-800">
                                «{invioConfermato.note}»
                              </p>
                            )}
                          </div>
                        ) : confermaAperta === d.reparto ? (
                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                            <p className="text-[10px] text-slate-600 leading-relaxed">
                              Dichiara l&apos;invio al reparto. La piattaforma non spedisce nulla:
                              registra quello che hai fatto, così il registro sa che il documento è
                              arrivato e non solo che è uscito.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                Data di invio
                                <input
                                  type="date"
                                  value={inviataIl}
                                  max={new Date().toISOString().slice(0, 10)}
                                  onChange={(e) => setInviataIl(e.target.value)}
                                  className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-slate-900 bg-white"
                                />
                              </label>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                Mezzo
                                <select
                                  value={mezzoInvio}
                                  onChange={(e) => setMezzoInvio(e.target.value as MezzoInvio)}
                                  className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-slate-900 bg-white"
                                >
                                  {MEZZI_INVIO.map((m) => (
                                    <option key={m.valore} value={m.valore}>
                                      {m.etichetta}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
                              Note (facoltative)
                              <textarea
                                value={noteInvio}
                                onChange={(e) => setNoteInvio(e.target.value)}
                                rows={2}
                                maxLength={500}
                                placeholder="Es. protocollo n. 1234 del 21/10, consegnato all’ufficio contributi"
                                className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-slate-900 bg-white"
                              />
                            </label>
                            {erroreInvio && (
                              <p className="text-[10px] text-red-700 leading-relaxed">
                                {erroreInvio}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void confermaInvioReparto(d)}
                                disabled={invioInCorso}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <Send className="w-3.5 h-3.5" />
                                {invioInCorso ? 'Registro...' : 'Registra l’invio'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfermaAperta(null);
                                  setErroreInvio(null);
                                }}
                                disabled={invioInCorso}
                                className="px-3 py-2 rounded-lg border border-slate-300 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-white disabled:opacity-50"
                              >
                                Annulla
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setConfermaAperta(d.reparto);
                              setErroreInvio(null);
                              setAvvisoInvio(null);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50"
                          >
                            <Send className="w-3 h-3" /> Confermo l&apos;invio
                          </button>
                        ))}
                    </li>
                  );
                })}
              </ul>
            )}

            {errorePdf && <p className="text-[11px] text-red-700">{errorePdf}</p>}
            {avvisoConsegna && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
                {avvisoConsegna}
              </p>
            )}
            {avvisoInvio && (
              <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3 leading-relaxed">
                {avvisoInvio}
              </p>
            )}
            {erroreConsegne && <p className="text-[11px] text-amber-800">{erroreConsegne}</p>}

            {consegneFuoriConfigurazione.length > 0 && (
              <p className="text-[10px] text-slate-500 leading-relaxed">
                {`${
                  consegneFuoriConfigurazione.length === 1
                    ? 'Un reparto ha già ricevuto un documento'
                    : `${consegneFuoriConfigurazione.length} reparti hanno già ricevuto un documento`
                } ma non compare più fra i destinatari: `}
                {consegneFuoriConfigurazione
                  .map(
                    (c) =>
                      `${c.reparto} (${dataOraConsegna(c.ultima.consegnatoIl)}${
                        c.ultima.invio
                          ? `, inviato il ${dataInvio(c.ultima.invio.inviataIl)} via ${etichettaMezzo(
                              c.ultima.invio.mezzo
                            )}`
                          : ''
                      })`
                  )
                  .join(', ')}
                . Se la lavorazione è stata cambiata o spenta, lo storico resta qui.
              </p>
            )}

            {documentiReparti.categorieSenzaLavorazione.length > 0 && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
                {`${
                  documentiReparti.categorieSenzaLavorazione.length === 1
                    ? '1 tipologia resta fuori dai documenti'
                    : `${documentiReparti.categorieSenzaLavorazione.length} tipologie restano fuori dai documenti`
                }: senza una lavorazione configurata non si sa a quale reparto appartengono — sono elencate più sopra in «Tipologie senza lavorazione».`}
              </p>
            )}

            <a
              href={`/spazio/${codice}/parametri/lavorazioni`}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-700 hover:text-sky-800"
            >
              Configura le lavorazioni <ArrowRight className="w-3 h-3" />
            </a>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">E adesso?</h3>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              La verifica è registrata: resta consultabile anche se decidi di non proseguire, ed è
              la traccia di chi ha guardato questa posizione e quando.
            </p>
            {tipoSpazio === 'NON_ENTE' ? (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Procedendo, l&apos;azienda entra fra quelle in lavorazione e viene pre-compilata la{' '}
                <span className="font-bold">check list</span> — un minuto circa. La troverai già
                pronta nella scheda.
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Procedendo, l&apos;azienda entra fra quelle in lavorazione e si apre{' '}
                <span className="font-bold">Posizione Ente › Anagrafica</span>: salva almeno un
                parametro dell&apos;ente (matricola, posizione…) perché da lì in poi l&apos;azienda
                si riconosce con i tuoi riferimenti interni. Al salvataggio parte da sola la prima
                elaborazione dello <span className="font-bold">screening</span> con la visura
                caricata qui, che resta conservata.
              </p>
            )}
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
                  setEsitoSoglie(null);
                  setErroreSoglie(null);
                  setTipiProspetti({});
                  setRigheVera([]);
                  setLavorazioni([]);
                  setEtichetteCategorie({});
                  setErroreComunicazioni(null);
                  setCopiato(null);
                  setErroreCopia(null);
                  setConfermaAperta(null);
                  setErroreInvio(null);
                  setAvvisoInvio(null);
                  setNoteInvio('');
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
