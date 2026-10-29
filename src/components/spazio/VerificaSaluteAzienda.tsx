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
  dataRiverifica,
  htmlRiepilogoTriage,
  type DocumentoTriage,
  type ValoriTriage,
} from '@/lib/triage/riepilogoHtml';
import { stampaHtml } from '@/lib/stampaTesto';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MateriaVociVera, type VoceDaRimappare } from './MateriaVociVera';
import { ottieniMaterieVociVera } from '@/app/actions/posizioneVera';
import { chiaveVoceVera } from '@/lib/titoliEnte/materiaVera';
import {
  Stethoscope,
  Upload,
  Check,
  AlertTriangle,
  ArrowRight,
  Printer,
  Info,
  FileDown,
  Send,
  Layers,
  RotateCcw,
  X,
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
  ottieniVerificaDaRiprendereAction,
  archiviaVerificaAction,
  type RigaVerifica,
  type VerificaDaRiprendere,
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
  ottieniDebitiVera,
  impostaDuplicatoVeraAction,
} from '@/app/actions/posizioneVera';
import { denunceDuplicateVera, type StatoDuplicatoVera } from '@/lib/debitiEnte/duplicatiVera';
import { ottieniTitoliEnteAction, ottieniMaterieEnteAction } from '@/app/actions/titoliEnte';
import { ottieniLavorazioniMateria } from '@/app/actions/materieLavorazione';
import type { LavorazioneMateria } from '@/lib/titoliEnte/lavorazioniMateria';
import { ottieniCategorieTipoDebito } from '@/app/actions/categorieTipoDebito';
import {
  ottieniLavorazioniTipoDebito,
  type LavorazioneTipoDebito,
} from '@/app/actions/lavorazioniTipoDebito';
import {
  componiComunicazioniVera,
  formattaImportoEuro,
  raggruppaPerReparto,
} from '@/lib/lavorazioni/comunicazioni';
import { componiReportUo, ETICHETTE_MOTIVO, type DocumentoUo } from '@/lib/lavorazioni/reportUo';
import { testiContabilizzate } from '@/lib/lavorazioni/daLavorare';
import { instradaPerMateria, materiaDaChiave } from '@/lib/lavorazioni/instradamentoMateria';
import { chiaveDipendenza } from '@/lib/lavorazioni/dipendenze';
import { conRitorno } from '@/lib/navigazione/ritorno';
import { materiaPerRigaVera } from '@/lib/titoliEnte/materiaVera';
import { normalizzaEtichetta } from '@/lib/debitiEnte/tracciatoCore';
import { MappaturaSezioniVera } from '@/components/spazio/MappaturaSezioniVera';
import type { StatoMateria } from '@/lib/titoliEnte/materie';
import { LAVORAZIONI_TIPO_DEBITO_SOLA_LETTURA } from '@/lib/lavorazioni/solaLettura';
import {
  MEZZI_INVIO,
  causaSuperamento,
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
import {
  ottieniValoriSoglieAction,
  salvaValoriSoglieParzialeAction,
  valutaSoglieAction,
} from '@/app/actions/soglie25novies';
import { riepilogaSoglieTriage } from '@/lib/soglie25novies/triage';
import {
  baseInpsDaVera,
  GIORNI_RITARDO_SOGLIA_INPS,
  type BaseInpsVera,
} from '@/lib/soglie25novies/baseVera';
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
  /**
   * Se il V.E.R.A. è il presupposto del triage in questo spazio.
   *
   * Non è uguale per tutti: per l'INPS il file è l'unico documento che elenca
   * le posizioni da lavorare, mentre un ente che non lo emette non ha modo di
   * procurarselo. È un parametro dello spazio (Parametri → Triage), che di
   * default segue l'ente. Senza il parametro resta obbligatorio: una regola
   * non si allenta per un errore di lettura.
   */
  veraObbligatorio?: boolean;
  /**
   * L'azienda di cui RIAPRIRE la verifica, dall'URL (`?azienda=`).
   *
   * Il triage viveva soltanto nella scheda del browser: un crash, una ricarica
   * o uno sbalzo di tensione chiudevano la videata in cui si preparano le
   * comunicazioni e si decide se procedere, e da lì non si tornava. I dati
   * erano già nel database; qui c'è il modo di ricomporli.
   */
  aziendaDaRiprendere?: number | null;
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

export function VerificaSaluteAzienda({
  nomeSchema,
  codice,
  tipoSpazio,
  aziendaDaRiprendere = null,
  veraObbligatorio = true,
}: Props) {
  const [fase, setFase] = useState<Fase>('caricamento');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [avvisoCiclo, setAvvisoCiclo] = useState<string | null>(null);
  const [nonTrovati, setNonTrovati] = useState<string[]>([]);
  const [dati, setDati] = useState<AnagraficaEstratta | null>(null);
  const [aziendaId, setAziendaId] = useState<number | null>(null);
  const [attenzione, setAttenzione] = useState<Attenzione | null>(null);
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
  // La scelta sulla doppia scrittura del V.E.R.A. (F24 e denunce dello stesso
  // periodo): si registra sulla riga denunce, insieme alla posizione. L'id
  // della riga in corso di salvataggio serve solo a spegnere il pulsante.
  const [rigaInSalvataggio, setRigaInSalvataggio] = useState<number | null>(null);
  const [erroreCoppia, setErroreCoppia] = useState<string | null>(null);
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
  // ---- Report per unità operativa ---------------------------------------
  // La seconda uscita del triage non parte dalla categoria di debito ma dal
  // CODICE di partita: servono i titoli dell'ente (che dicono in quale materia
  // cade un codice e a quale ufficio si scrive), le materie (il nome da
  // stampare) e le lavorazioni delle materie (che cosa va fatto).
  const [titoliUo, setTitoliUo] = useState<
    { codice: string; materiaId: number | null; dipendenza: string | null }[]
  >([]);
  // La materia porta anche i codici indicativi e lo stato: senza, una posizione
  // il cui codice non compare tra i titoli non si può ricondurre alla materia
  // per i codici che la materia stessa dichiara.
  const [materieUo, setMaterieUo] = useState<
    { id: number; nome: string; codiciIndicativi: string | null; stato: StatoMateria }[]
  >([]);
  const [lavorazioniUo, setLavorazioniUo] = useState<LavorazioneMateria[]>([]);
  const [erroreUo, setErroreUo] = useState<string | null>(null);
  // La finestra che mappa le sezioni V.E.R.A. non riconosciute. La mappatura
  // è un dato dello SPAZIO, non dell'azienda: si fa qui, senza uscire dal
  // triage e senza aspettare che l'anagrafica sblocchi la scheda V.E.R.A.
  const [mostraMappaturaVera, setMostraMappaturaVera] = useState(false);
  // La finestra che cambia la MATERIA di una voce: è il posto da correggere
  // quando la mappatura della sezione non sposta niente, perché le voci si
  // riconducono già da sole — ma alla materia sbagliata.
  const [mostraMaterieVoci, setMostraMaterieVoci] = useState(false);
  const [scelteVociVera, setScelteVociVera] = useState<Record<string, number>>({});
  // La verifica riaperta: dice se l'azienda è ancora in verifica (si può
  // decidere) o è già stata presa in carico, e con quale data si è verificata.
  const [ripresa, setRipresa] = useState<VerificaDaRiprendere | null>(null);
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
  /**
   * Le soglie dell'art. 25-novies, in una finestra che si chiude.
   *
   * Il triage è il momento in cui si decide: mandare l'operatore nella scheda
   * dell'azienda per vedere i numeri significava farlo uscire dal lavoro, con
   * il rischio di non tornare. La finestra mostra il confronto e DA QUALI
   * DOCUMENTI vengono i numeri — non da quale matricola l'ente riconosce
   * l'azienda: il confronto non passa dai riferimenti interni, e mostrarli lì
   * faceva credere che senza quelli il calcolo non si potesse fare. Per
   * modificare si va nella scheda, ma solo se lo si sceglie.
   */
  const [mostraSoglie, setMostraSoglie] = useState(false);

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

  /**
   * Le configurazioni delle due uscite del triage, in un punto solo.
   *
   * Da una parte il destinatario per TIPOLOGIA di debito (comunicazioni e
   * documento per reparto), dall'altra le lavorazioni delle MATERIE (report
   * per unità operativa, raggruppato per codice). Servono a entrambe le strade
   * — anche a una verifica RIAPERTA, dove non c'è un file appena letto da cui
   * ricavarle — e una lettura fallita non deve azzerare l'altra.
   */
  const caricaConfigurazioni = async (): Promise<{
    mappatura: Record<string, string>;
    scelteVoci: Record<string, number>;
  }> => {
    let mappatura: Record<string, string> = {};
    try {
      const [mappa, lav, cat] = await Promise.all([
        ottieniMappaturaTitoliVera(nomeSchema),
        ottieniLavorazioniTipoDebito(nomeSchema),
        ottieniCategorieTipoDebito(nomeSchema),
      ]);
      if (mappa.success) mappatura = mappa.mappatura;
      if (lav.success) setLavorazioni(lav.lavorazioni);
      if (cat.success) {
        setEtichetteCategorie(
          Object.fromEntries(cat.categorie.map((x) => [x.codice, x.etichetta]))
        );
      }
    } catch {
      // Un parametro mancante non ferma il triage: il report dice che cosa
      // manca, e le lavorazioni restano vuote.
    }

    try {
      const [titoli, materie, perMateria] = await Promise.all([
        ottieniTitoliEnteAction(nomeSchema),
        ottieniMaterieEnteAction(nomeSchema),
        ottieniLavorazioniMateria(nomeSchema),
      ]);
      if (titoli.success) {
        setTitoliUo(
          titoli.titoli.map((t) => ({
            codice: t.codice,
            materiaId: t.materiaId ?? null,
            dipendenza: t.dipendenza ?? null,
          }))
        );
      }
      if (materie.success) {
        setMaterieUo(
          materie.materie
            .filter((m): m is typeof m & { id: number } => m.id !== null)
            .map((m) => ({
              id: m.id,
              nome: m.nome,
              codiciIndicativi: m.codiciIndicativi,
              stato: m.stato,
            }))
        );
      }
      if (perMateria.success) setLavorazioniUo(perMateria.lavorazioni);
      const problemi = [
        !titoli.success && titoli.error,
        !materie.success && materie.error,
        !perMateria.success && perMateria.error,
      ].filter((x): x is string => Boolean(x));
      setErroreUo(
        problemi.length > 0
          ? `Report per unità operativa non disponibile: ${problemi.join(' ')}`
          : null
      );
    } catch (e) {
      setErroreUo(`Report per unità operativa non disponibile: ${String(e)}`);
    }

    // LE MATERIE SCELTE SULLE VOCI. Valgono più di ogni deduzione automatica e
    // servono qui, non solo alla finestra: le righe appena lette devono
    // portarle con sé, altrimenti la scelta salvata ieri non cambierebbe il
    // report di oggi.
    let scelteVoci: Record<string, number> = {};
    try {
      const scelte = await ottieniMaterieVociVera(nomeSchema);
      if (scelte.success) {
        scelteVoci = scelte.scelte;
        setScelteVociVera(scelte.scelte);
      }
    } catch {
      // Senza scelte salvate si legge la sola deduzione automatica.
    }

    return { mappatura, scelteVoci };
  };

  /**
   * RIAPRE una verifica già eseguita, ricomponendo la videata dai dati salvati.
   *
   * Non è un «rifai la verifica»: quello riparte dalla visura e apre un ciclo
   * nuovo, archiviando il lavoro precedente. Qui si torna esattamente dove si
   * era — l'esito, le comunicazioni, i documenti per i reparti, la decisione —
   * con l'unica differenza che i file caricati allora non ci sono più: sono
   * stati letti e trasformati in righe di database, ed è da lì che si riparte.
   *
   * Indicatore e soglie si RICALCOLANO invece di essere letti: costano poco e
   * riflettono i valori salvati, mentre un esito congelato in una sessione
   * morta potrebbe non corrispondere più a ciò che la scheda mostra.
   */
  const riprendi = async (id: number) => {
    setInCorso(true);
    setErrore(null);
    setAvanzamento('Riapertura della verifica...');
    try {
      const r = await ottieniVerificaDaRiprendereAction(nomeSchema, id);
      if (!r.success || !r.verifica) {
        setErrore(r.error ?? 'La verifica non è stata riaperta.');
        return;
      }
      const v = r.verifica;
      setRipresa(v);
      setAziendaId(v.aziendaId);
      setDati(v.anagrafica);
      setDataVerifica(v.dataVerifica);
      await caricaConfigurazioni();

      setAvanzamento('Lettura delle posizioni V.E.R.A....');
      const debiti = await ottieniDebitiVera(nomeSchema, id);
      if (debiti.success) setRigheVera(debiti.righe);
      else setErrore(debiti.error ?? 'Posizioni V.E.R.A. non leggibili.');

      setAvanzamento('Ricalcolo dell’indicatore...');
      // SENZA IL BILANCIO: la verifica riaperta è sempre un triage, e in
      // triage i bilanci non sono stati chiesti (vedi `indicatore.ts`).
      const a = await ottieniAttenzioneScreeningAction(nomeSchema, id, { senzaBilancio: true });
      if (a.success && a.attenzione) setAttenzione(a.attenzione);
      else setErrore(a.error ?? 'Indicatore non calcolato: causa non riportata dal server.');

      try {
        const s = await valutaSoglieAction(nomeSchema, id, tipoSpazio);
        if (s.success && s.esito) setEsitoSoglie(s.esito);
        else setErroreSoglie(s.error ?? 'Valutazione non riuscita per causa non riportata.');
      } catch (e) {
        setErroreSoglie(String(e));
      }

      // I VALORI DEL RIEPILOGO, ANCHE IN RIAPERTURA.
      //
      // I file non ci sono più, i numeri sì: sono quelli conservati con la
      // verifica. Senza questo passaggio il foglio — ora stampabile anche da
      // qui — direbbe «non rilevato» dove la videata mostra il dovuto
      // dell'anno precedente e il ritardo accertato.
      const salvati = await ottieniValoriSoglieAction(nomeSchema, id);
      if (salvati.success && salvati.valori) {
        const g = salvati.valori;
        setValoriTriage({
          conLavoratori: g.conLavoratoriSubordinati,
          annoPrecedente:
            g.annoContributiDovuti ?? new Date(`${v.dataVerifica}T12:00:00Z`).getUTCFullYear() - 1,
          contributiDovutiAnnoPrecedente: g.contributiDovutiAnnoPrecedente,
          nonVersatoOltre90: g.contributiScaduti,
          ritardoOltre90Giorni: g.ritardoOltre90Giorni,
          periodiInRitardo: g.periodiInRitardo,
          denunceNonPresentate: g.denunceNonPresentate,
          creditiAffidatiAgente: g.creditiAffidatiAer,
        });
      }

      setFase('esito');
    } finally {
      setInCorso(false);
      setAvanzamento(null);
    }
  };

  // La riapertura si tenta una volta sola, all'apertura della pagina: un
  // secondo giro rileggerebbe tutto a ogni render.
  const ripresaAvviata = useRef(false);
  useEffect(() => {
    if (!aziendaDaRiprendere || ripresaAvviata.current) return;
    ripresaAvviata.current = true;
    void riprendi(aziendaDaRiprendere);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aziendaDaRiprendere]);

  const confermaEValuta = async () => {
    if (!dati) return;
    setInCorso(true);
    setErrore(null);
    setEsitoSoglie(null);
    setErroreSoglie(null);
    setRigheVera([]);
    setLavorazioni([]);
    setEtichetteCategorie({});
    try {
      // ---- Presupposto: il V.E.R.A. --------------------------------------
      // Non basta che il file sia nell'elenco: deve essere riconosciuto e
      // leggibile. Il controllo si fa PRIMA di creare l'azienda, così un
      // triage senza V.E.R.A. non lascia una pratica a metà.
      const tipi = await Promise.all(fileProspetti.map((f) => riconosciProspetto(f)));
      const indiceVera = tipi.indexOf('VERA');
      // Il V.E.R.A. è un presupposto, non una condizione di esistenza del
      // triage: dove lo spazio lo richiede senza file non si parte; dove è
      // facoltativo la visita si fa lo stesso, e mancano le posizioni.
      if (indiceVera < 0 && veraObbligatorio) {
        setErrore(
          'Il file V.E.R.A. è obbligatorio in questo spazio: senza, il triage non parte. Caricalo tra i prospetti e attendi che compaia «Posizione V.E.R.A.».'
        );
        return;
      }
      let analisiVera: Awaited<ReturnType<typeof analizzaVera>> | null = null;
      if (indiceVera >= 0) {
        setAvanzamento('Lettura del file V.E.R.A....');
        try {
          analisiVera = await analizzaVera(fileProspetti[indiceVera]);
        } catch (e) {
          setErrore(`File V.E.R.A. non leggibile: ${String(e)}`);
          return;
        }
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
      const { mappatura: mappaturaTitoli, scelteVoci } = await caricaConfigurazioni();
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

      // Ritardo misurato sui periodi del V.E.R.A.: ripiego quando manca la
      // Lista Inadempienze (che resta la fonte prioritaria).
      let ritardoVera: ReturnType<typeof ritardoDaVera> = null;
      // Il debito che concorre alla soglia INPS, separato per anzianità (vedi
      // `baseVera.ts`): non è l'esposizione, è la parte scaduta da oltre 90
      // giorni.
      let sogliaVera: BaseInpsVera | null = null;
      if (fileVera && analisiVera) {
        setAvanzamento('Lettura della Posizione V.E.R.A....');
        try {
          ritardoVera = ritardoDaVera(analisiVera.sezioni, new Date(`${dataVerifica}T12:00:00Z`));
          // In triage non si chiede di classificare i trattamenti, ma la
          // mappatura delle sezioni già configurata si applica: è quella che
          // dà una tipologia alle righe e permette di indirizzarle al
          // collega giusto. Le sezioni non mappate restano senza categoria.
          const { righe } = estraiRigheVera(analisiVera.sezioni, mappaturaTitoli, {}, true);
          sogliaVera = baseInpsDaVera(righe, dataVerifica);
          setRigheVera(
            righe.map((r) => ({
              ...r,
              materiaId: scelteVoci[chiaveVoceVera(r.sezione, r.voce)] ?? null,
            }))
          );
          // Le poste del V.E.R.A. non vanno tutte nella stessa base: dirlo qui
          // evita che l'operatore si chieda perché la soglia INPS non usa il
          // totale del file.
          const totVera = totaliVera(righe);
          // LO STESSO DEBITO SCRITTO DUE VOLTE. Il file può descrivere la
          // stessa obbligazione come «F24 non presentato» e come «Denunce non
          // trasmesse», stesso periodo e stesso importo. L'esposizione la conta
          // una volta sola: se il conto non tornasse con la somma delle righe,
          // chi legge penserebbe a un errore invece che al file.
          const doppie = denunceDuplicateVera(righe);
          if (doppie.righe > 0) {
            const importi =
              doppie.righe === 1 ? 'un importo compare' : `${doppie.righe} importi compaiono`;
            note.push(
              `V.E.R.A.: ${importi} due volte — come «F24 non presentato» e come «Denunce non trasmesse», nello stesso periodo (${doppie.periodi.join(', ')}) e per lo stesso importo (${Math.round(doppie.totale).toLocaleString('it-IT')} €). È la stessa obbligazione descritta due volte: l’esposizione la conta una volta sola. La riga «Denunce non trasmesse» resta in elenco perché dice una cosa che l’altra non dice — la denuncia va trasmessa — ma la sua cifra non si somma a quella del F24.`
            );
          }
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
            // Le righe appena salvate si rileggono dal database: sono loro ad
            // avere l'id con cui si registra la scelta sulla coppia
            // F24/denunce. I valori sono quelli appena scritti — è la stessa
            // estrazione — e la verifica riaperta farà lo stesso giro.
            const salvate = await ottieniDebitiVera(nomeSchema, c.aziendaId);
            if (salvate.success) setRigheVera(salvate.righe);
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

      // ---- IL DEBITO CHE CONCORRE ALLA SOGLIA INPS ----------------------
      //
      // L'art. 25-novies, comma 1, lett. a) confronta i contributi scaduti da
      // OLTRE 90 GIORNI con il 30% dei dovuti dell'anno precedente e con
      // 15.000 euro: non l'esposizione complessiva. Con quattro anni di denunce
      // nel file la differenza non è un dettaglio — l'esposizione comprende i
      // periodi appena scaduti, che il requisito temporale non lo soddisfano
      // ancora, e dichiarare superato un requisito che non lo è farebbe partire
      // una segnalazione che non andava fatta.
      if (sogliaVera?.misurabile) {
        const eu = (x: number) => Math.round(x).toLocaleString('it-IT');
        if (!fileInadempienze) nonVersato = sogliaVera.scadutiOltre90;
        if (ritardo90 === null) ritardo90 = sogliaVera.scadutiOltre90 > 0;
        if (!fileInadempienze && sogliaVera.scadutiOltre90 > 0) {
          periodiRitardo = sogliaVera.periodiOltre90.length;
        }
        note.push(
          `Soglia INPS misurata sul V.E.R.A.: concorrono solo i contributi scaduti da oltre ${GIORNI_RITARDO_SOGLIA_INPS} giorni, ${eu(sogliaVera.scadutiOltre90)} € su ${sogliaVera.partiteOltre90} ${
            sogliaVera.partiteOltre90 === 1 ? 'partita' : 'partite'
          }${
            sogliaVera.periodiOltre90.length > 0
              ? ` (periodi ${sogliaVera.periodiOltre90.join(', ')})`
              : ''
          }.` +
            (sogliaVera.recenti > 0
              ? ` Altri ${eu(sogliaVera.recenti)} € riguardano periodi scaduti da meno di ${GIORNI_RITARDO_SOGLIA_INPS} giorni: restano fuori dal confronto, perché il requisito è congiunto e riguarda lo stesso debito.`
              : '') +
            (sogliaVera.partiteSenzaPeriodo > 0
              ? ` ${sogliaVera.partiteSenzaPeriodo} ${
                  sogliaVera.partiteSenzaPeriodo === 1
                    ? 'partita non è databile'
                    : 'partite non sono databili'
                } (senza periodo nel file): ${eu(
                  sogliaVera.senzaPeriodo
                )} € restano fuori dal conteggio del ritardo.`
              : '')
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
          // Con il V.E.R.A. come fonte il valore è la parte scaduta da oltre 90
          // giorni, non l'esposizione intera: è quella che la norma confronta.
          contributiScaduti:
            scelteFonti['vera:elenchi'] === 'VERA'
              ? sogliaVera?.misurabile
                ? sogliaVera.scadutiOltre90
                : undefined
              : (nonVersato ?? undefined),
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
      const a = await ottieniAttenzioneScreeningAction(nomeSchema, c.aziendaId, {
        senzaBilancio: true,
      });
      if (a.success && a.attenzione) {
        setAttenzione(a.attenzione);
        // Con l'esito si conserva la data a cui si riferiscono i conti: è
        // l'unico dato del triage che il database non aveva, e senza di essa
        // una verifica riaperta ricostruirebbe i documenti su un'altra data.
        await registraEsitoVerificaAction(
          nomeSchema,
          c.aziendaId,
          a.attenzione.esito,
          dataVerifica
        );
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
        // I VALORI APPENA LETTI VIAGGIANO CON LA RICHIESTA.
        //
        // Questa videata ha in mano i numeri estratti dai fogli; il database
        // può ancora avere i campi vuoti, o averli ricevuti un istante prima da
        // un salvataggio che non è arrivato. Leggendo solo dal database, la
        // pagina mostrava 242.107 € di dovuto e la finestra delle soglie
        // dichiarava il confronto «non determinabile»: due schermate, due
        // verità, sullo stesso fascicolo e nello stesso minuto.
        const s = await valutaSoglieAction(nomeSchema, c.aziendaId, tipoSpazio, {
          conLavoratori: conLavoratori === '' ? undefined : conLavoratori === 'si',
          contributiDovutiAnnoPrecedente:
            dovutoAnnoPrec ??
            (contributiDovuti.trim() === '' ? undefined : Number(contributiDovuti)),
          contributiScaduti:
            scelteFonti['vera:elenchi'] === 'VERA'
              ? sogliaVera?.misurabile
                ? sogliaVera.scadutiOltre90
                : undefined
              : (nonVersato ?? undefined),
          ritardoOltre90Giorni: ritardo90 ?? undefined,
          creditiAffidati: creditiAffidatiNetti ?? undefined,
        });
        if (s.success && s.esito) setEsitoSoglie(s.esito);
        else setErroreSoglie(s.error ?? 'Valutazione non riuscita per causa non riportata.');
      } catch (e) {
        setErroreSoglie(String(e));
      }
      // L'azienda finisce nell'URL: da questo momento ricaricare la pagina —
      // per un crash, uno sbalzo di tensione, un aggiornamento del browser —
      // non riporta alla visura, riapre questa stessa videata. È il pezzo di
      // ripresa che non dipende da un gesto dell'operatore.
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('azienda', String(c.aziendaId));
        window.history.replaceState(null, '', url.toString());
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
    setRipresa(null);
    // Come «Verifica un'altra azienda»: la videata di caricamento sta in cima.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    setDati(null);
    setAttenzione(null);
    setAziendaId(null);
    setEsitoSoglie(null);
    setErroreSoglie(null);
    setTipiProspetti({});
    setRigheVera([]);
    setLavorazioni([]);
    setEtichetteCategorie({});
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
        // In riapertura i file non esistono più: il foglio lo dice, invece di
        // far credere che il triage sia stato fatto senza documenti.
        documentiNota: ripresa
          ? 'In riapertura i file caricati non sono più disponibili: sono stati letti e trasformati in posizioni di database. I valori qui sopra sono quelli conservati con la verifica.'
          : null,
        // IN TESTA, NON IN NOTA. Una ricostruzione che non lo dichiara sembra un
        // documento emesso nella stessa seduta della verifica: le due date —
        // quella dei conti e quella della ristampa — sono ciò che rende il
        // foglio leggibile fra sei mesi, quando la configurazione sarà cambiata.
        ristampa: ripresa ? { ricostruitaIl: new Date().toISOString() } : null,
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
        // Le soglie riga per riga, con l'alert quando è superata: il foglio
        // deve dire su quale parametro e con quale importo, non solo che
        // «qualcosa» è oltre.
        soglie: esitoSoglie
          ? esitoSoglie.righe
              .filter((r) => r.applicabile)
              .map((r) => ({
                ambito: r.ambito,
                valore: r.valore,
                esito: r.esito,
                esposizione: r.esposizione,
              }))
          : [],
        alertSoglie:
          riepilogoSoglie && riepilogoSoglie.stato !== 'nessuna_superata'
            ? { titolo: riepilogoSoglie.titolo, dettaglio: riepilogoSoglie.dettaglio }
            : null,
        // Le evidenze che partono per i reparti: chi riceve il riepilogo deve
        // sapere che cosa è stato mandato a chi, e quanto vale.
        uffici: reportUo.documenti.map((d) => ({
          dipendenza: d.dipendenza,
          righe: d.righe,
          totale: d.totale,
          voci: d.codici.map((c) =>
            c.codice ? `Codice ${c.codice}` : (c.materia ?? 'senza materia')
          ),
        })),
        // Trenta giorni: la data entro cui tornare a vedere se i reparti si
        // sono attivati. Si conta dalla data della verifica, non da oggi.
        prossimaVerifica: dataRiverifica(dataVerifica),
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

  // UN CALCOLO SOLO, CONDIVISO FRA LE DUE USCITE.
  //
  // Prima erano due chiamate nel corpo del componente e ognuna rifaceva il
  // proprio raggruppamento: ogni cambio di stato della scheda (la data della
  // verifica, una nota digitata, il messaggio «copiato» che si spegne dopo due
  // secondi) ripassava tutto il V.E.R.A. due volte. Con `useMemo` il lavoro si
  // fa quando cambia qualcosa che conta davvero, e il raggruppamento è uno:
  // le due uscite non possono partire da due letture diverse degli stessi dati.
  // CHI LAVORA IL DEBITO: prima la MATERIA, poi la vecchia categoria.
  //
  // Le posizioni arrivano dal file V.E.R.A. con la categoria della sezione, se
  // qualcuno l'ha mappata nella vecchia tabella. Ma la configurazione viva è
  // quella delle materie: ognuna porta i presupposti legali e le lavorazioni,
  // e ogni lavorazione dice l'ufficio che la esegue. Instradare solo per
  // categoria lasciava fuori dalle comunicazioni — e quindi dai PDF per le
  // dipendenze — le posizioni di un ente che aveva configurato le materie e
  // non la vecchia tabella, dichiarando «sezioni non mappate» quando la
  // materia c'era. Qui la materia diventa la chiave del raggruppamento; la
  // categoria resta il ripiego per gli spazi configurati prima.
  const instradamento = useMemo(
    () =>
      instradaPerMateria(righeVera, {
        titoli: titoliUo,
        materie: materieUo,
        lavorazioni: lavorazioniUo,
        lavorazioniCategoria: lavorazioni,
        etichetteCategoria: etichetteCategorie,
      }),
    [righeVera, titoliUo, materieUo, lavorazioniUo, lavorazioni, etichetteCategorie]
  );

  const raggruppamentoReparti = useMemo(
    () =>
      raggruppaPerReparto({
        righe: instradamento.righe,
        lavorazioni: instradamento.lavorazioni,
        etichette: instradamento.etichette,
      }),
    [instradamento]
  );

  const aziendaMostrata = dati?.ragioneSociale?.trim() || 'Azienda';

  const comunicazioni = useMemo(
    () =>
      componiComunicazioniVera(
        {
          azienda: aziendaMostrata,
          dataVerifica,
          righe: instradamento.righe,
          lavorazioni: instradamento.lavorazioni,
          etichette: instradamento.etichette,
        },
        raggruppamentoReparti
      ),
    [aziendaMostrata, dataVerifica, instradamento, raggruppamentoReparti]
  );

  // UNA USCITA SOLA. Il documento per reparto è stato ritirato: il report
  // per unità operativa dice le stesse cose e in più legge le lavorazioni
  // delle materie — la procedura che l'ufficio deve eseguire. Due documenti
  // per lo stesso destinatario erano due versioni da tenere allineate, e la
  // seconda era la meno informata delle due.

  // LA SECONDA USCITA: un report per unità operativa, raggruppato per codice
  // di partita. Le lavorazioni sono quelle della materia in cui il codice
  // cade, la dipendenza viene dal codice se c'è e dalla materia altrimenti.
  const reportUo = useMemo(
    () =>
      componiReportUo({
        azienda: aziendaMostrata,
        dataVerifica,
        righe: righeVera,
        titoli: titoliUo,
        materie: materieUo,
        lavorazioni: lavorazioniUo,
        // LA MAPPATURA VALE PER ENTRAMBI I DOCUMENTI. Una sezione si mappa su
        // una materia o su una categoria di debito: senza questa seconda via,
        // la scelta appena salvata sposterebbe le posizioni nelle comunicazioni
        // e non nel report, e l'ufficio resterebbe senza foglio.
        categorie: lavorazioni
          .filter((l) => l.attivo !== false && l.categoria.trim() && l.destinatario.trim())
          .map((l) => ({
            codice: l.categoria.trim(),
            dipendenza: l.destinatario.trim(),
            etichetta: etichetteCategorie[l.categoria.trim()],
          })),
      }),
    [
      aziendaMostrata,
      dataVerifica,
      righeVera,
      titoliUo,
      materieUo,
      lavorazioniUo,
      lavorazioni,
      etichetteCategorie,
    ]
  );

  // LE SEZIONI CHE NON SANNO DOVE ANDARE, e la mappatura che si può fare qui.
  //
  // La mappatura sezione → materia (o categoria) è un dato dello spazio: vale
  // per tutti i caricamenti, di tutte le aziende. Chiederla passando per la
  // scheda dell'azienda significava uscire dal triage e tornare indietro, e in
  // quella scheda la sezione si apriva solo dopo l'anagrafica. Qui si aprono
  // solo le sezioni che davvero non si riconducono a niente: quelle a cui
  // manca una lavorazione hanno già il loro rimando, che è un'altra cosa.
  const sezioniDaMappare = useMemo(() => {
    const perSezione = new Map<
      string,
      { norm: string; titolo: string; righe: number; totale: number }
    >();
    righeVera.forEach((r, i) => {
      const categoria = (instradamento.righe[i]?.categoria ?? r.categoria ?? '').trim();
      if (categoria) return;
      if (r.trattamento === 'ignora') return;
      if (materiaPerRigaVera(r.voce, r.sezione, titoliUo, materieUo) !== null) return;
      const norm = normalizzaEtichetta(r.sezione);
      if (!norm) return;
      const voce = perSezione.get(norm) ?? {
        norm,
        titolo: r.sezione.trim() || '(sezione senza titolo)',
        righe: 0,
        totale: 0,
      };
      voce.righe += 1;
      voce.totale += r.importo;
      perSezione.set(norm, voce);
    });
    return Array.from(perSezione.values()).sort((a, b) =>
      a.titolo.localeCompare(b.titolo, 'it-IT')
    );
  }, [righeVera, instradamento, titoliUo, materieUo]);

  // LE VOCI CHE IL REPORT MANDA A UN UFFICIO, con la materia che le accompagna.
  //
  // Serve alla correzione: quando una mappatura di sezione non sposta niente, il
  // posto da sistemare è la voce. Si elencano le voci delle sezioni inerti e
  // quelle su cui una scelta è già stata presa (per poterla togliere) — non
  // tutte quelle del file, che sarebbero un secondo elenco del V.E.R.A.
  const vociDaRimappare = useMemo<VoceDaRimappare[]>(() => {
    const sezioniInerti = new Set(
      reportUo.mappatureSenzaEffetto.map((m) => normalizzaEtichetta(m.sezione))
    );
    const perVoce = new Map<string, VoceDaRimappare>();
    for (const r of righeVera) {
      if (r.trattamento === 'ignora') continue;
      const chiave = chiaveVoceVera(r.sezione, r.voce);
      const scelta = scelteVociVera[chiave] ?? null;
      if (scelta === null && !sezioniInerti.has(normalizzaEtichetta(r.sezione))) continue;
      const materia =
        scelta !== null
          ? (materieUo.find((m) => m.id === scelta)?.nome ?? `Materia ${scelta}`)
          : (materiaPerRigaVera(r.voce, r.sezione, titoliUo, materieUo)?.nome ?? null);
      const voce = perVoce.get(chiave) ?? {
        sezione: r.sezione,
        voce: r.voce,
        righe: 0,
        importo: 0,
        materiaAttuale: materia,
        materiaScelta: scelta,
      };
      voce.righe += 1;
      voce.importo += r.importo;
      perVoce.set(chiave, voce);
    }
    return Array.from(perVoce.values()).sort(
      (a, b) => a.sezione.localeCompare(b.sezione, 'it-IT') || a.voce.localeCompare(b.voce, 'it-IT')
    );
  }, [righeVera, reportUo, scelteVociVera, materieUo, titoliUo]);

  // ---- LE COMUNICAZIONI PER LE UNITÀ OPERATIVE -------------------------
  // Il triage serviva a decidere; da quando produce documenti per gli uffici
  // serve anche a dire se quei documenti ci sono e per quali uffici. Un «puoi
  // procedere» senza numeri sarebbe una frase di cortesia: qui ci sono gli
  // uffici, le posizioni e l'importo, oppure il motivo per cui mancano.
  // Ciò che il report non elenca — perché è già in contabilità — si dice nello
  // stesso avviso che annuncia i documenti: altrimenti il suo totale sembra più
  // basso del debito e nessuno sa dove sia finita la differenza.
  const avanzamentoUo = {
    uffici: reportUo.documenti.length,
    posizioni: reportUo.documenti.reduce((a, d) => a + d.righe, 0),
    totale: reportUo.documenti.reduce((a, d) => a + d.totale, 0),
    contabilizzate: reportUo.contabilizzate,
    contabilizzateAdr: reportUo.contabilizzateAdr,
    codiciAdr: reportUo.codiciAdr,
    duplicati: reportUo.duplicati,
    adempimenti: reportUo.adempimenti,
  };
  const notaContabilizzate = testiContabilizzate(avanzamentoUo, formattaImportoEuro).collegiale;

  // ---- LA STESSA CIFRA SCRITTA DUE VOLTE ---------------------------------
  // Il riconoscimento è un criterio, non una verità: due righe con lo stesso
  // periodo e lo stesso importo possono descrivere due obbligazioni diverse.
  // Chi vede la posizione decide, e la decisione si registra sulla riga
  // denunce: da lì la rileggono l'esposizione, i documenti per gli uffici e la
  // verifica riaperta. Il conteggio qui sotto è lo stesso che usano le soglie,
  // l'esposizione e il fascicolo: se cambia la scelta, cambiano tutti insieme.
  const coppieVera = denunceDuplicateVera(righeVera).coppie;

  const decidiCoppia = async (rigaVeraId: number, stato: StatoDuplicatoVera | '') => {
    if (!aziendaId) {
      setErroreCoppia('Azienda non ancora determinata: la scelta non è stata registrata.');
      return;
    }
    setRigaInSalvataggio(rigaVeraId);
    setErroreCoppia(null);
    try {
      const r = await impostaDuplicatoVeraAction(nomeSchema, aziendaId, rigaVeraId, stato);
      if (!r.success) {
        setErroreCoppia(r.error ?? 'Scelta non registrata.');
        return;
      }
      setRigheVera((precedenti) =>
        precedenti.map((x) => (x.id === rigaVeraId ? { ...x, duplicatoStato: stato } : x))
      );
    } catch (e) {
      setErroreCoppia(`Scelta non registrata: ${String(e)}`);
    } finally {
      setRigaInSalvataggio(null);
    }
  };

  // LE MATERIE DA COMPLETARE, dall'elenco di ciò che resta fuori: una
  // lavorazione senza ufficio, o una tipologia senza lavorazione. I link ai
  // Parametri devono portare LÌ, e dire il nome di cosa manca.
  const materieDaCompletare = Array.from(
    new Set<number>([
      ...comunicazioni.categorieSenzaLavorazione
        .map((c) => materiaDaChiave(c.categoria))
        .filter((x): x is number => x !== null),
      ...reportUo.senzaDipendenza.map((s) => s.materiaId).filter((x): x is number => x !== null),
    ])
  );
  const nomiMaterieDaCompletare = materieDaCompletare.map(
    (id) => materieUo.find((m) => m.id === id)?.nome ?? `Materia ${id}`
  );
  // LA VIA DEL RITORNO.
  //
  // Ogni rimando ai Parametri porta con sé questa verifica — con la sua
  // azienda — perché l'uscita di quelle pagine riporti qui e non alla
  // dashboard dei parametri. È il punto da cui la gestione è stata richiamata,
  // e quello che si stava guardando prima di andare a sistemare una materia.
  const ritornoDaTriage = `/spazio/${codice}/verifica-salute${
    aziendaId ? `?azienda=${aziendaId}` : ''
  }`;
  const linkLavorazioni = conRitorno(
    materieDaCompletare.length > 0
      ? `/spazio/${codice}/parametri/materie-lavorazione?materia=${materieDaCompletare[0]}`
      : `/spazio/${codice}/parametri/lavorazioni`,
    ritornoDaTriage
  );
  // «Vedi le lavorazioni» era un vicolo cieco: la pagina dei Parametri mostra
  // le stesse righe, e la tabella dei destinatari è in sola lettura. Resta il
  // solo rimando su cui si può agire — quello che nomina la materia da
  // completare — e sparisce quando non c'è nessuna materia da completare.
  const etichettaLavorazioni =
    materieDaCompletare.length > 0
      ? `Configura la lavorazione di «${nomiMaterieDaCompletare.join('», «')}»`
      : null;

  // Il registro per destinatario: l'ultima consegna e quante volte il documento
  // è uscito. La chiave porta il TIPO di documento: le due impronte di versione
  // non sono confrontabili, e un ufficio che si chiama come un reparto non deve
  // far risultare «superato» un foglio che nessuno ha mai ricevuto.
  // La chiave dell'ufficio, non la sua grafia: le consegne dello stesso ufficio
  // scritto in due modi sono le consegne di un ufficio solo.
  const chiaveConsegna = (tipo: 'reparto' | 'dipendenza', nome: string) =>
    `${tipo}|${chiaveDipendenza(nome)}`;
  const riepilogoConsegne = riassumiConsegne(consegneReparti);
  const consegnePerDestinatario = new Map(
    riepilogoConsegne.map((c) => [chiaveConsegna(c.tipo, c.reparto), c])
  );
  /**
   * Scarica il report di un'unità operativa e ne lascia traccia nel registro.
   *
   * Stessa regola del documento per reparto: prima il file, poi la riga. Un
   * registro muto non deve impedire di consegnare il foglio — ma se la
   * scrittura fallisce lo si dice, perché allora la piattaforma non sa che
   * quel documento è uscito.
   */
  const scaricaReportUo = async (documento: DocumentoUo): Promise<void> => {
    setErrorePdf(null);
    setAvvisoConsegna(null);
    setPdfInCorso(documento.dipendenza);
    try {
      const { scaricaPdfReportUo } = await import('@/lib/lavorazioni/pdfReportUo');
      scaricaPdfReportUo(documento);
    } catch (e) {
      setErrorePdf(`PDF non generato: ${String(e)}`);
      setPdfInCorso(null);
      return;
    }

    if (aziendaId) {
      const r = await registraConsegnaRepartoAction(nomeSchema, aziendaId, {
        reparto: documento.dipendenza,
        tipo: 'dipendenza',
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
        setInviataIl(new Date().toISOString().slice(0, 10));
        setNoteInvio('');
        setErroreInvio(null);
        setAvvisoInvio(null);
        setConfermaAperta(chiaveConsegna('dipendenza', documento.dipendenza));
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
  const confermaInvioDestinatario = async (tipo: 'reparto' | 'dipendenza', nome: string) => {
    if (!aziendaId) return;
    const riepilogo = consegnePerDestinatario.get(chiaveConsegna(tipo, nome));
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
        setAvvisoInvio(`Invio confermato per ${nome}.`);
      } else {
        setErroreInvio(r.error ?? 'Conferma non registrata.');
      }
    } finally {
      setInvioInCorso(false);
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
                Il triage si regge su documenti pubblici, recuperabili da chiunque: la visura. Basta
                a leggere l&apos;azienda e a collocarla sulla soglia del CCII senza entrarci — per
                quello serve la posizione debitoria, più sotto. Il bilancio XBRL non si carica qui:
                è un approfondimento, e si carica dallo screening in poi, se si decide di
                proseguire.
              </p>
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

            {veraObbligatorio && !haVera && (
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

            {!veraObbligatorio && !haVera && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
                <p className="text-[11px] font-bold text-slate-700">
                  Il V.E.R.A. non è richiesto in questo spazio
                </p>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Il triage parte anche senza il file. Senza, però, restano fuori le posizioni
                  dell’ente: nessun elenco da instradare alle unità operative e nessun report per
                  ufficio. Se questo spazio è dell’INPS, l’obbligo si riaccende da Parametri di
                  Spazio → Triage.
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
              disabled={
                inCorso || !dati.ragioneSociale || conflittoAperto || (veraObbligatorio && !haVera)
              }
              title={
                haVera || !veraObbligatorio
                  ? undefined
                  : 'Carica il file V.E.R.A.: è obbligatorio in questo spazio per eseguire il triage.'
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
          {/* L'avviso che mancava in questa pagina: una verifica in sospeso non
              è un elenco da consultare, è un lavoro da finire — e il punto in
              cui si finisce sono le comunicazioni per le unità operative. */}
          <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
            Una verifica in sospeso si riapre qui:{' '}
            <span className="font-bold text-slate-700">
              è da lì che si procede alle comunicazioni per le unità operative
            </span>{' '}
            — i report per ufficio si ricompongono dai dati salvati e dalle lavorazioni configurate.
          </p>
          <div className="divide-y divide-slate-100">
            {storico.slice(0, 15).map((v) => (
              // Cliccabile: una verifica che non si può riaprire è un elenco
              // di sola lettura, non una traccia consultabile.
              <a
                key={v.id}
                // Una verifica ancora in sospeso si RIAPRE nel triage — è lì che
                // ci sono le comunicazioni e la decisione. Una già decisa porta
                // alla scheda: lì non c'è più niente da decidere.
                href={
                  !v.presaInCarico && !v.archiviata
                    ? `/spazio/${codice}/verifica-salute?azienda=${v.id}`
                    : `/spazio/${codice}/aziende/${v.id}`
                }
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
          {ripresa && (
            <div className="flex items-start gap-2 text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded-lg p-3 leading-relaxed">
              <RotateCcw className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>
                  <span className="font-bold">Verifica riaperta</span> dai dati salvati
                  {ripresa.eseguitaIl
                    ? `: eseguita il ${new Date(ripresa.eseguitaIl).toLocaleDateString('it-IT')}`
                    : ''}
                  . Comunicazioni, documenti per i reparti e report per unità operativa si
                  ricompongono dalle posizioni e dalle configurazioni attuali.
                </p>
                <p>
                  I file caricati allora non ci sono più — sono stati letti e trasformati in righe
                  di database. Il riepilogo resta stampabile: porta i valori conservati con la
                  verifica, e dichiara al posto dell’elenco dei file che quelli non sono più
                  disponibili.
                </p>
                {ripresa.dataApprossimata && (
                  <p>
                    La data di riferimento della verifica non era stata registrata: si usa il giorno
                    dell&apos;esecuzione, o quello di oggi se la verifica non è stata completata (
                    {ripresa.dataVerifica}).
                  </p>
                )}
                {!ripresa.inVerifica && (
                  <p className="font-bold">
                    L&apos;azienda è già stata presa in carico: la verifica si consulta e i
                    documenti si ricostruiscono, ma la decisione è presa e non si ripete.
                  </p>
                )}
                {ripresa.archiviata && (
                  <p className="font-bold">
                    La verifica è stata archiviata
                    {ripresa.motivo ? `: ${ripresa.motivo}` : ''}.
                  </p>
                )}
              </div>
            </div>
          )}
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
          {coppieVera.length > 0 && (
            <div className="bg-white border border-amber-200 rounded-xl p-5">
              <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                La stessa cifra scritta due volte nel V.E.R.A.
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed mt-2">
                Il file descrive la stessa obbligazione due volte — il versamento non eseguito («F24
                non presentato») e la denuncia non trasmessa, stesso periodo e stesso importo — e la
                cifra è contata una volta sola: l&apos;esposizione, i documenti per gli uffici e il
                fascicolo di evidenza leggono tutti questo conteggio. Se per questa posizione sono
                due debiti distinti, dillo qui.
              </p>
              <ul className="mt-3 space-y-2">
                {coppieVera.map((c) => {
                  const rigaF24 = righeVera[c.f24];
                  const rigaDenunce = righeVera[c.denunce];
                  const id = rigaDenunce?.id;
                  const stato = rigaDenunce?.duplicatoStato ?? '';
                  const inCorso = id !== undefined && rigaInSalvataggio === id;
                  const etichetta =
                    stato === 'NEGATO'
                      ? 'Dichiarati due debiti distinti: le due cifre contano entrambe.'
                      : stato === 'CONFERMATO'
                        ? 'Confermato a mano: è lo stesso debito, contato una volta sola.'
                        : 'Riconosciuto automaticamente: contato una volta sola.';
                  return (
                    <li
                      key={`${c.f24}-${c.denunce}`}
                      className="border border-slate-200 rounded-lg p-3"
                    >
                      <div className="text-[11px] text-slate-800">
                        <span className="font-bold">{formattaImportoEuro(c.importo)}</span> —
                        periodo {c.periodo}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                        {rigaF24?.sezione ?? 'V.E.R.A.'}: {rigaF24?.voce ?? 'riga F24'}
                        {rigaF24?.periodo ? ` (${rigaF24.periodo})` : ''} ↔{' '}
                        {rigaDenunce?.sezione ?? 'V.E.R.A.'}:{' '}
                        {rigaDenunce?.voce ?? 'riga della denuncia'}
                        {rigaDenunce?.periodo ? ` (${rigaDenunce.periodo})` : ''}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                          {etichetta}
                        </span>
                        <button
                          type="button"
                          disabled={id === undefined || inCorso || stato === 'CONFERMATO'}
                          onClick={() => id !== undefined && void decidiCoppia(id, 'CONFERMATO')}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          Sì, è lo stesso debito
                        </button>
                        <button
                          type="button"
                          disabled={id === undefined || inCorso || stato === 'NEGATO'}
                          onClick={() => id !== undefined && void decidiCoppia(id, 'NEGATO')}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          No, sono due debiti
                        </button>
                        {stato !== '' && (
                          <button
                            type="button"
                            disabled={id === undefined || inCorso}
                            onClick={() => id !== undefined && void decidiCoppia(id, '')}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-transparent text-slate-500 hover:text-slate-800"
                          >
                            Torna all&apos;automatico
                          </button>
                        )}
                      </div>
                      {id === undefined && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          La scelta si registra dopo il salvataggio della posizione.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {erroreCoppia && <p className="text-[11px] text-red-700 mt-2">{erroreCoppia}</p>}
              <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                La scelta vale da subito nei totali e nei documenti; il conteggio letto dai fogli
                resta quello del momento della lettura del file. Le due righe restano entrambe in
                elenco: la denuncia non trasmessa è comunque lavoro da fare. Un nuovo import del
                V.E.R.A. ricostruisce la posizione e riparte dal riconoscimento automatico.
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
              {/* Il confronto si apre QUI. Portare l'operatore nella scheda
                  dell'azienda, a metà triage, significava fargli perdere il
                  punto in cui era — e la scheda parla di screening, non di una
                  verifica appena fatta. */}
              {esitoSoglie && (
                <button
                  type="button"
                  onClick={() => setMostraSoglie(true)}
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-700 hover:text-sky-800"
                >
                  Apri le soglie di segnalazione <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          {erroreSoglie && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
              {`Soglie di segnalazione non valutate: ${erroreSoglie} Il triage resta valido; le soglie si possono verificare dalla scheda dell’azienda.`}
            </p>
          )}

          {/*
            LE SOGLIE, IN UNA FINESTRA.

            Il pulsante portava nella scheda dell'azienda — cioè fuori dal
            triage, verso lo screening. Ma qui non si sta navigando: si sta
            chiedendo «con quali numeri, e riconosciuti come chi?». La finestra
            risponde: il confronto riga per riga e gli identificativi salvati
            per questa azienda, con la loro etichetta. Nessun valore vive solo
            nella videata — quelli delle soglie stanno in anagrafica aziendale,
            gli identificativi nell'Anagrafica Ente — e il posto dove si
            cambiano è detto in fondo, come scelta e non come passaggio
            obbligato.
          */}
          {mostraSoglie && esitoSoglie && (
            <div
              className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4"
              role="presentation"
              onClick={() => setMostraSoglie(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="soglie-titolo"
                onClick={(e) => e.stopPropagation()}
                className="mx-auto my-8 w-full max-w-2xl bg-white rounded-xl border border-slate-200 shadow-xl p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3
                      id="soglie-titolo"
                      className="font-bold text-slate-900 uppercase text-xs tracking-wider"
                    >
                      Soglie di segnalazione — i valori del confronto
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      Art. 25-novies. Il triage confronta le soglie con i dati già salvati per
                      questa azienda: qui si vede che cosa è stato confrontato e con quali
                      riferimenti.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMostraSoglie(false)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                    aria-label="Chiudi"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Da dove vengono i numeri
                  </p>
                  <ul className="space-y-1 text-[11px] text-slate-700 leading-relaxed">
                    <li>
                      <span className="font-bold">V.E.R.A.</span> — i debiti certi e in divenire: è
                      l’esposizione che si confronta con le soglie di importo.
                    </li>
                    <li>
                      <span className="font-bold">Denunce e flussi inviati</span> — il dovuto
                      dell’anno precedente, che è la base del 30%.
                    </li>
                    <li>
                      <span className="font-bold">Deleghe F24 e pagamenti</span> — da quanto il
                      versamento è scoperto: è il requisito dei 90 giorni.
                    </li>
                  </ul>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Il confronto non passa dalla matricola né da altri riferimenti con cui l’ente
                    identifica l’azienda: si misura sui documenti caricati, e l’unica anagrafica che
                    serve è quella camerale (denominazione e partita IVA).
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <th className="py-1.5 pr-2">Parametro</th>
                        <th className="py-1.5 pr-2">Soglia</th>
                        <th className="py-1.5 pr-2">Importo confrontato</th>
                        <th className="py-1.5">Esito</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {esitoSoglie.righe
                        .filter((r) => r.applicabile)
                        .map((r) => (
                          <tr key={`${r.ente}-${r.ambito}`}>
                            <td className="py-1.5 pr-2 text-slate-900">{r.ambito}</td>
                            <td className="py-1.5 pr-2 text-slate-700">{r.valore}</td>
                            <td className="py-1.5 pr-2 text-slate-700">
                              {r.esposizione === null ? '—' : formattaImportoEuro(r.esposizione)}
                            </td>
                            <td
                              className={`py-1.5 font-bold ${
                                r.esito === 'sopra' ? 'text-red-700' : 'text-slate-700'
                              }`}
                            >
                              {r.esito === 'sopra'
                                ? 'Superata'
                                : r.esito === 'sotto'
                                  ? 'Non superata'
                                  : 'Non determinabile'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* PERCHÉ UN ESITO RESTA APERTO. «Non determinabile» da solo è
                    un diniego: qui si legge quale dato manca, e la frase sotto
                    dice che il confronto usa ciò che la pagina ha già. */}
                {esitoSoglie.righe.some(
                  (r) => r.applicabile && r.esito === 'non_determinabile'
                ) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
                      Perché un esito resta da accertare
                    </p>
                    <ul className="space-y-1">
                      {esitoSoglie.righe
                        .filter((r) => r.applicabile && r.esito === 'non_determinabile')
                        .map((r) => (
                          <li
                            key={`motivo-${r.ente}-${r.ambito}`}
                            className="text-[10px] text-amber-900 leading-relaxed"
                          >
                            <span className="font-bold">{r.ambito}</span>: {r.motivo}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Gli importi vengono dai documenti letti nel triage (V.E.R.A., denunce, deleghe,
                  ruoli) e dai valori salvati per l’azienda. Per cambiarli si apre la scheda
                  dell’azienda, in «Soglie di segnalazione» — da qui non si esce e non si modifica
                  nulla.
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  {aziendaId ? (
                    <a
                      href={`/spazio/${codice}/aziende/${aziendaId}/posizione-ente?scheda=soglie`}
                      className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                    >
                      Apri nella scheda dell’azienda
                    </a>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => setMostraSoglie(false)}
                    className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800"
                  >
                    Chiudi
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* LA MAPPATURA, SENZA USCIRE DAL TRIAGE. Le scelte tornano qui e
              si applicano alle righe già lette: comunicazioni e report si
              ricompongono subito, senza ricaricare il file né la pagina. */}
          {mostraMappaturaVera && (
            <MappaturaSezioniVera
              nomeSchema={nomeSchema}
              sezioni={sezioniDaMappare}
              onChiudi={() => setMostraMappaturaVera(false)}
              onSalvate={(scelte) => {
                setRigheVera((precedenti) =>
                  precedenti.map((r) => {
                    const scelta = scelte[normalizzaEtichetta(r.sezione)];
                    return scelta ? { ...r, categoria: scelta } : r;
                  })
                );
                setMostraMappaturaVera(false);
              }}
            />
          )}

          {/* LA MATERIA DELLA VOCE, DAL REPORT CHE LA MOSTRA SBAGLIATA. */}
          {mostraMaterieVoci && (
            <MateriaVociVera
              nomeSchema={nomeSchema}
              voci={vociDaRimappare}
              onChiudi={() => setMostraMaterieVoci(false)}
              onSalvate={(scelte) => {
                setScelteVociVera(scelte);
                setRigheVera((precedenti) =>
                  precedenti.map((r) => ({
                    ...r,
                    materiaId: scelte[chiaveVoceVera(r.sezione, r.voce)] ?? null,
                  }))
                );
                setMostraMaterieVoci(false);
              }}
            />
          )}

          {/*
            «NON PROCEDO» — LA FINESTRA DEL MOTIVO.

            Il pulsante esisteva, il motivo si raccoglieva in uno stato e poi
            nessuno lo chiedeva: la finestra era sparita in una rifattorizzazione
            e il comando era rimasto a schermo, inerte. Una decisione
            amministrativa senza traccia è peggio di una decisione non presa,
            perché nessuno può ricostruire chi ha guardato cosa. Il motivo è
            obbligatorio per la stessa ragione: «archiviata» da sola è
            indistinguibile da una dimenticanza.
          */}
          {mostraArchiviazione && (
            <div
              className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4"
              role="presentation"
              onClick={() => setMostraArchiviazione(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="archivia-titolo"
                onClick={(e) => e.stopPropagation()}
                className="mx-auto my-8 w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-xl p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3
                      id="archivia-titolo"
                      className="font-bold text-slate-900 uppercase text-xs tracking-wider"
                    >
                      Non procedo — archivia la verifica
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      La verifica resta consultabile nello storico con il suo esito e con il motivo
                      che scrivi qui. L&apos;azienda non entra fra quelle in lavorazione.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMostraArchiviazione(false)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                    aria-label="Chiudi"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="motivo-archiviazione"
                    className="block text-[10px] font-bold uppercase tracking-wider text-slate-600"
                  >
                    Motivo della decisione
                  </label>
                  <textarea
                    id="motivo-archiviazione"
                    value={motivoArchiviazione}
                    onChange={(e) => setMotivoArchiviazione(e.target.value)}
                    rows={3}
                    placeholder="es. Debito sotto soglia e già in rateizzazione: nessun seguito da dare."
                    className="w-full p-2 text-xs border border-slate-200 rounded-lg text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Almeno qualche parola: è ciò che vedrà chi riapre questa posizione.
                  </p>
                </div>

                {errore && <p className="text-[11px] text-red-700">{errore}</p>}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setMostraArchiviazione(false)}
                    className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    onClick={() => void archivia()}
                    disabled={inCorso || motivoArchiviazione.trim().length < 3}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold uppercase tracking-wider hover:bg-slate-800 disabled:bg-slate-300"
                  >
                    {inCorso ? 'Archivio…' : 'Archivia la verifica'}
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* C'È ANCHE NELLA RIAPERTURA. Prima il comando era nascosto lì
              perché mancavano i file: ma al foglio non servono i file, servono
              i numeri — soglie, attenzione, evidenze per ufficio — che la
              riapertura ha e mostra già a schermo. Il documento dice che i
              file non sono più disponibili, invece di non esistere. */}
          {!inCorso && (
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
          )}

          {/*
            L'AVVISO CHE MANCAVA.

            Il triage produce tre cose per gli uffici — le comunicazioni ai
            colleghi, un documento per reparto e un report per unità operativa
            — e finora non diceva mai «ci sono, puoi mandarli». Chi arrivava in
            fondo doveva dedurlo da due riquadri che a configurazione vuota
            sembrano uguali a quelli di una verifica senza debiti. Qui si dice
            se si può procedere, con quante posizioni e per quali uffici; se
            non si può, si dice che cosa manca e dove.
          */}
          {(() => {
            const pronte = avanzamentoUo.uffici > 0;
            const motivo = !pronte
              ? instradamento.lavorazioni.length === 0
                ? 'non c’è ancora una lavorazione configurata con il suo ufficio'
                : materieDaCompletare.length > 0
                  ? 'manca l’ufficio o la lavorazione alle materie elencate qui sotto'
                  : 'nessuna posizione V.E.R.A. di questa verifica arriva a un ufficio'
              : null;
            return (
              <div
                className={`rounded-xl border p-4 space-y-1 ${
                  pronte ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
                }`}
              >
                <p
                  className={`text-xs font-bold ${pronte ? 'text-emerald-900' : 'text-amber-900'}`}
                >
                  {pronte
                    ? 'Puoi procedere alle comunicazioni per le unità operative'
                    : 'Le comunicazioni per le unità operative non sono pronte'}
                </p>
                {pronte ? (
                  <p
                    className={`text-[11px] leading-relaxed ${
                      pronte ? 'text-emerald-800' : 'text-amber-800'
                    }`}
                  >
                    {`${avanzamentoUo.uffici} ${
                      avanzamentoUo.uffici === 1 ? 'ufficio' : 'uffici'
                    }, ${avanzamentoUo.posizioni} ${
                      avanzamentoUo.posizioni === 1 ? 'posizione' : 'posizioni'
                    }, ${formattaImportoEuro(avanzamentoUo.totale)}: per ognuno un report per
                    unità operativa, qui sotto. Si scarica e lo invii tu — la piattaforma non
                    manda nulla e registra ogni scaricamento.`}
                    {/* Ciò che resta fuori si dichiara una volta sola, nel
                        riquadro del report che lo esclude: ripeterlo qui era
                        la terza copia della stessa frase nella stessa
                        schermata. */}
                    <a href="#report-uo" className="font-bold underline">
                      Vai ai report per unità operativa
                    </a>
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    {`Non si può ancora procedere: ${motivo}. Il triage resta valido — l’esito e
                    la decisione non dipendono da questo — ma senza un ufficio non c’è a chi
                    indirizzare i debiti.`}{' '}
                    {etichettaLavorazioni && (
                      <a href={linkLavorazioni} className="font-bold underline">
                        {etichettaLavorazioni}
                      </a>
                    )}
                  </p>
                )}
                {notaContabilizzate && (
                  <p className="text-[11px] text-slate-600 leading-relaxed">{notaContabilizzate}</p>
                )}
              </div>
            );
          })()}

          {/*
            SECONDA USCITA — IL REPORT PER UNITÀ OPERATIVA.
            Non sostituisce il documento per reparto: risponde a un'altra
            domanda. Là si dice «questi sono i debiti di questo ufficio»; qui si
            dice «questo codice, questa è la procedura, e queste sono le
            inadempienze che lo compongono». Resta accanto alla presa in
            carico, e resta raggiungibile anche dopo: è il motivo per cui la
            pagina sa riaprire una verifica già eseguita.
          */}
          <div id="report-uo" className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-500" />
              <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                Report per unità operativa
              </h3>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Un PDF per ufficio, raggruppato per{' '}
              <span className="font-bold">codice di partita</span> e, quando la voce non ne porta
              uno, per <span className="font-bold">materia</span>: per ogni voce la materia, le
              lavorazioni da svolgere con i passi e l&apos;esito, e le inadempienze che la
              compongono — periodo, stato e importo. L&apos;ufficio è la dipendenza del codice, o
              quella della sua materia quando il codice non ne ha una propria. Si scarica da qui e
              lo invii tu: la piattaforma non manda nulla, e ogni scaricamento resta registrato.
            </p>

            {erroreUo && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
                {erroreUo}
              </p>
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

            {reportUo.documenti.length === 0 ? (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {titoliUo.length === 0
                  ? 'Nessun codice dell’ente configurato: senza il titolo del codice non si sa in quale materia cada, né quale ufficio lo lavori. I titoli si configurano nei Parametri di Spazio.'
                  : 'Nessuna posizione V.E.R.A. ha una materia con una dipendenza configurata: qui non c’è un ufficio a cui indirizzare il report.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {reportUo.documenti.map((d) => {
                  const stato = statoConsegnaReparto(
                    consegnePerDestinatario.get(chiaveConsegna('dipendenza', d.dipendenza)),
                    d.versione
                  );
                  const invioConfermato =
                    stato.stato === 'mai' ? null : stato.consegna.ultima.invio;
                  const chiave = chiaveConsegna('dipendenza', d.dipendenza);
                  const codiciNoti = d.codici.filter((c) => c.codice).length;
                  const vociSenzaCodice = d.codici.length - codiciNoti;
                  // LE VOCI DEL V.E.R.A. DI QUESTO UFFICIO, e la via per cui ci
                  // sono arrivate: il codice, la voce stessa, il titolo della
                  // sezione, o una mappatura. È ciò che rende il report
                  // controllabile prima di scaricarlo, e distingue una
                  // mappatura che ha deciso da una che non è servita a niente.
                  const origini = d.codici.flatMap((c) => c.origini);
                  return (
                    <li
                      key={d.dipendenza}
                      className="border border-slate-200 rounded-lg p-3 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-slate-900">
                            {d.dipendenza}
                          </span>
                          <span className="block text-[10px] text-slate-500 font-mono">
                            {codiciNoti} {codiciNoti === 1 ? 'codice' : 'codici'}
                            {vociSenzaCodice > 0
                              ? ` + ${vociSenzaCodice} ${
                                  vociSenzaCodice === 1 ? 'voce' : 'voci'
                                } senza codice`
                              : ''}{' '}
                            · {d.righe} {d.righe === 1 ? 'posizione' : 'posizioni'} ·{' '}
                            {formattaImportoEuro(d.totale)}
                            {d.posizioniDaContabilizzare > 0
                              ? ` · ${d.posizioniDaContabilizzare} da contabilizzare`
                              : ''}
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            {codiciNoti > 0 ? 'Codici' : 'Voci'}:{' '}
                            {d.codici
                              .map(
                                (c) =>
                                  c.codice ??
                                  `senza codice (${c.materia ?? 'materia non indicata'})`
                              )
                              .join(', ')}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void scaricaReportUo(d)}
                          disabled={pdfInCorso !== null}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <FileDown className="w-3.5 h-3.5" />{' '}
                          {pdfInCorso === d.dipendenza ? 'Preparazione...' : 'Scarica il PDF'}
                        </button>
                      </div>

                      {origini.length > 0 && (
                        <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5 space-y-0.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Voci del V.E.R.A. assegnate, e perché
                          </p>
                          {origini.map((o) => (
                            <p
                              key={`${o.sezione}|${o.voce}|${o.motivo}`}
                              className="text-[10px] text-slate-600 leading-relaxed"
                            >
                              <span className="font-bold text-slate-800">
                                {o.voce || 'voce senza denominazione'}
                              </span>{' '}
                              · {o.righe} {o.righe === 1 ? 'posizione' : 'posizioni'} ·{' '}
                              {formattaImportoEuro(o.importo)} ·{' '}
                              <span className="italic">{ETICHETTE_MOTIVO[o.motivo]}</span>
                              {o.sezione ? (
                                <span className="text-slate-400"> — sezione «{o.sezione}»</span>
                              ) : null}
                            </p>
                          ))}
                        </div>
                      )}

                      {stato.stato === 'mai' ? (
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          Mai scaricato: nessuna consegna registrata per questo ufficio.
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                          Scaricato il {dataOraConsegna(stato.consegna.ultima.consegnatoIl)}
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
                          L&apos;ufficio ha in mano la versione{' '}
                          <span className="font-mono">{stato.consegna.ultima.versione}</span>, non
                          questa (ora <span className="font-mono">{d.versione}</span>):{' '}
                          {causaSuperamento(stato.consegna.ultima, d)}. Riscarica il PDF e invia la
                          nuova versione.
                        </p>
                      )}

                      {stato.stato !== 'mai' &&
                        (invioConfermato ? (
                          <p className="text-[10px] text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg p-2 leading-relaxed">
                            <span className="font-bold">
                              Inviato il {dataInvio(invioConfermato.inviataIl)} via{' '}
                              {etichettaMezzo(invioConfermato.mezzo)}
                            </span>
                            {invioConfermato.confermatoDa
                              ? ` — dichiarato da ${invioConfermato.confermatoDa}`
                              : ''}
                          </p>
                        ) : confermaAperta === chiave ? (
                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
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
                                onClick={() =>
                                  void confermaInvioDestinatario('dipendenza', d.dipendenza)
                                }
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
                              setConfermaAperta(chiave);
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

            {/* UNA MAPPATURA CHE NON SPOSTA NULLA. La mappatura di sezione è
                un ripiego: quando le voci si riconducono già da sole alla loro
                materia, la scelta salvata non cambia il documento. Dirlo qui
                evita di cercare perché «la mappatura non ha funzionato». */}
            {reportUo.mappatureSenzaEffetto.length > 0 && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-1">
                <p className="text-[11px] font-bold text-sky-900">
                  {reportUo.mappatureSenzaEffetto.length === 1
                    ? 'Una mappatura di sezione non sposta nessuna posizione'
                    : `${reportUo.mappatureSenzaEffetto.length} mappature di sezione non spostano nessuna posizione`}
                </p>
                <ul className="space-y-0.5">
                  {reportUo.mappatureSenzaEffetto.map((m) => (
                    <li
                      key={`${m.sezione}|${m.destinazione}`}
                      className="text-[11px] text-sky-900 leading-relaxed"
                    >
                      — Sezione «{m.sezione}» → «{m.destinazione}»: {m.righe}{' '}
                      {m.righe === 1 ? 'posizione' : 'posizioni'} per{' '}
                      {formattaImportoEuro(m.totale)}. Le voci si riconducono già da sole alla loro
                      materia, quindi la mappatura non le ha spostate.
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-sky-800 leading-relaxed">
                  La mappatura resta salvata e vale per le voci che nessuna materia riconosce. Se
                  queste posizioni devono andare altrove, il posto da cambiare è la materia della
                  voce, non la mappatura della sezione.
                </p>
                {vociDaRimappare.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMostraMaterieVoci(true)}
                    className="text-[11px] font-bold text-sky-800 hover:underline"
                  >
                    Cambia la materia delle voci
                  </button>
                )}
              </div>
            )}

            {reportUo.senzaDipendenza.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1">
                <p className="text-[11px] font-bold text-amber-900">
                  {reportUo.senzaDipendenza.length === 1
                    ? 'Una voce non ha una dipendenza a cui andare'
                    : `${reportUo.senzaDipendenza.length} voci non hanno una dipendenza a cui andare`}
                </p>
                <ul className="space-y-0.5">
                  {reportUo.senzaDipendenza.map((c) => (
                    <li
                      key={c.codice ?? `materia:${c.materia}`}
                      className="text-[11px] text-amber-900 leading-relaxed"
                    >
                      — {c.codice ? `Codice ${c.codice}` : 'Posizioni senza codice'}
                      {c.materia ? ` (${c.materia})` : ' (nessuna materia)'}: {c.righe}{' '}
                      {c.righe === 1 ? 'posizione' : 'posizioni'}, {formattaImportoEuro(c.totale)}
                      {c.materiaId !== null && (
                        <>
                          {' '}
                          <a
                            href={conRitorno(
                              `/spazio/${codice}/parametri/materie-lavorazione?materia=${c.materiaId}`,
                              ritornoDaTriage
                            )}
                            className="font-bold underline"
                          >
                            Indica l’ufficio
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-amber-800 leading-relaxed">
                  Restano fuori dai report finché la dipendenza non è indicata sul codice, o sulla
                  lavorazione della sua materia: senza un ufficio non si sa a chi mandare il foglio.
                </p>
              </div>
            )}

            {(reportUo.senzaCodice.righe > 0 || reportUo.codiciSenzaLavorazione > 0) && (
              <div className="text-[10px] text-slate-500 leading-relaxed space-y-1">
                {reportUo.senzaCodice.righe > 0 && (
                  <p>
                    {`${reportUo.senzaCodice.righe} ${
                      reportUo.senzaCodice.righe === 1
                        ? 'posizione non porta né un codice di partita né una materia riconoscibile: resta fuori dal report'
                        : 'posizioni non portano né un codice di partita né una materia riconoscibile: restano fuori dal report'
                    } (${formattaImportoEuro(reportUo.senzaCodice.totale)}).`}{' '}
                    {/* LA MAPPATURA SI APRE ANCHE DA QUI. Chi guarda il report per
                        primo arriva a questo avviso, non a quello delle
                        comunicazioni: se il comando vivesse solo là, l'ingresso
                        dipenderebbe dal riquadro in cui si passa prima. La
                        finestra è la stessa, e il salvataggio aggancia le righe
                        già lette allo stesso modo. */}
                    {sezioniDaMappare.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMostraMappaturaVera(true)}
                        className="font-bold text-sky-700 hover:underline"
                      >
                        Mappa le sezioni qui
                      </button>
                    )}
                  </p>
                )}
                {reportUo.codiciSenzaLavorazione > 0 && (
                  <p>
                    {`${reportUo.codiciSenzaLavorazione} ${
                      reportUo.codiciSenzaLavorazione === 1
                        ? 'voce è elencata'
                        : 'voci sono elencate'
                    } senza lavorazioni configurate sulla materia: il foglio lo dichiara, e la procedura va indicata nei Parametri di Spazio.`}
                  </p>
                )}
              </div>
            )}

            {/* LE SOSPESE DA UN PROVVEDIMENTO. Non si contabilizzano, ma non
                spariscono: il foglio dell'ufficio che le segue le dichiara con
                il loro importo, così quando il ricorso si chiude non si
                riparte da zero. */}
            {reportUo.sospese.righe > 0 && (
              <p className="text-[11px] text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-lg p-3 leading-relaxed">
                {`${reportUo.sospese.righe} ${
                  reportUo.sospese.righe === 1 ? 'posizione sospesa' : 'posizioni sospese'
                } da un provvedimento giudiziario per ${formattaImportoEuro(
                  reportUo.sospese.totale
                )}: non si contabilizzano finché la sospensione è in essere e non entrano nei totali. Restano sul foglio dell'ufficio che le segue, con il loro stato, così quando la sospensione cade la posizione è già assegnata.`}
              </p>
            )}
            {reportUo.posizioniEscluse.righe > 0 && (
              <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 leading-relaxed">
                {`${reportUo.posizioniEscluse.righe} ${
                  reportUo.posizioniEscluse.righe === 1 ? 'posizione resta' : 'posizioni restano'
                } fuori dai report per ${formattaImportoEuro(
                  reportUo.posizioniEscluse.totale
                )}: sono fuori perimetro (trattamento «Ignora») e non vanno contabilizzate. Non entrano nei totali.`}
              </p>
            )}

            {etichettaLavorazioni && (
              <a
                href={linkLavorazioni}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-700 hover:text-sky-800"
              >
                {etichettaLavorazioni} <ArrowRight className="w-3 h-3" />
              </a>
            )}
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
                pronta nella scheda. I bilanci <span className="font-bold">XBRL</span> si chiedono
                dopo, nell’analisi di bilancio: qui non sono un requisito.
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Procedendo, l&apos;azienda entra fra quelle in lavorazione e si apre{' '}
                <span className="font-bold">Posizione Ente › Anagrafica</span>: salva almeno un
                parametro dell&apos;ente (matricola, posizione…) perché da lì in poi l&apos;azienda
                si riconosce con i tuoi riferimenti interni. Al salvataggio parte da sola la prima
                elaborazione dello <span className="font-bold">screening</span> con la visura
                caricata qui, che resta conservata. I bilanci{' '}
                <span className="font-bold">XBRL</span> si chiedono dopo, nell’analisi di bilancio:
                in questa fase l’unico documento esterno è la visura, e la sua assenza di bilanci
                non è un allarme.
              </p>
            )}
            {avanzamento && <p className="text-[11px] font-mono text-slate-500">{avanzamento}</p>}
            <div className="flex flex-wrap gap-3">
              {/* La decisione si ripropone solo se è ancora da prendere. Una
                  verifica riaperta su un'azienda già presa in carico non deve
                  offrire di nuovo «Procedi»: sarebbe un secondo ciclo. */}
              {ripresa && (!ripresa.inVerifica || ripresa.archiviata) ? (
                <a
                  href={`/spazio/${codice}/aziende/${aziendaId}`}
                  className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-800"
                >
                  <ArrowRight className="w-3.5 h-3.5" /> Vai alla scheda azienda
                </a>
              ) : (
                <>
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
                      setMostraArchiviazione(true);
                    }}
                    className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    Non procedo
                  </button>
                </>
              )}
              {/* In una verifica riaperta non si torna alla conferma: i file
                  caricati allora non esistono più, quindi il passo sarebbe un
                  vicolo cieco (nessun V.E.R.A. da confermare). */}
              {!ripresa && (
                <button
                  onClick={() => {
                    setFase('conferma');
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  ← Indietro
                </button>
              )}
              <button
                onClick={() => {
                  setFase('caricamento');
                  setRipresa(null);
                  // L'azienda esce dall'URL: senza, ricaricare la pagina
                  // riaprirebbe la verifica che si è appena lasciata.
                  if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('azienda');
                    window.history.replaceState(null, '', url.toString());
                    // La videata nuova sta in cima: restando allo scorrimento di
                    // prima si finiva su uno spazio vuoto, e il comando sembrava
                    // non aver fatto nulla.
                    window.scrollTo({ top: 0 });
                  }
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
