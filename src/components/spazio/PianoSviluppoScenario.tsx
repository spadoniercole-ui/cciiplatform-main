'use client';

// PIANO DI SVILUPPO — la tabella: righe del bilancio, colonne degli anni
// (storico, poi il piano). Le righe di ipotesi si compilano cella per cella,
// in % sull'anno prima o in valore assoluto; le righe derivate si calcolano.
// Uguale per Redigente e Ricevente. Varianti per «giocare con gli scenari».

import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  Save,
  AlertTriangle,
  Plus,
  Trash2,
  Printer,
  Sparkles,
  RefreshCw,
  Lock,
} from 'lucide-react';
import {
  commentaSoluzionePianoAction,
  eliminaVariantePianoAction,
  elaboraPianoConAiAction,
  ottieniAttenzioneContabilePianoAction,
  ottieniPianoSviluppoAction,
  rendiProgettoPianoAction,
  salvaPianoSviluppoAction,
  type DatiPianoSviluppo,
} from '@/app/actions/pianoSviluppo';
import {
  ETICHETTA_PROCEDURA,
  LANCIO_PREDEFINITO,
  testoLancio,
  type LancioSimulazione,
} from '@/lib/piano/contestoContabile';
import {
  aliquotaImplicita,
  ETICHETTA_RIGA,
  RIGHE_FLUSSO,
  RIGHE_INPUT,
  calcolaPiano,
  euro,
  type Ipotesi,
  type IpotesiPiano,
  type RigaInput,
  type RigaIpotesi,
} from '@/lib/piano/piano';
import { calcolaPianoConLeve } from '@/lib/piano/levePiano';
import { confermaApp } from '@/components/FinestreApp';
import { stampaHtml } from '@/lib/stampaTesto';
import {
  ConfrontoPianoAziendale,
  type ContestoConfronto,
} from '@/components/spazio/ConfrontoPianoAziendale';
import { ottieniConfrontoPianoAction } from '@/app/actions/pianoAziendale';
import { crescitaDiRiferimento } from '@/lib/piano/automatico';
import { VARIANTE_AI } from '@/lib/piano/elaborazioneAi';
import {
  LEVE,
  LEVE_PREDEFINITE,
  contaLeve,
  leveAccese,
  type LeveSimulazione,
} from '@/lib/piano/leveSimulazione';
import { testoPianoVerifica } from '@/lib/piano/pianoDaVerifica';
import {
  applicaManopola,
  definizioniManopole,
  letturaManopola,
  luceDellaLeva,
  type DefinizioneManopola,
} from '@/lib/piano/statoAttuale';
import { Manopola } from '@/components/spazio/Manopola';
import {
  applicaRettifiche,
  definizioneRettifica,
  righeDelPianoAzienda,
  type Rettifiche,
} from '@/lib/piano/rettifiche';
import { ipotesiDaPianoAzienda } from '@/lib/piano/pianoAziendale';
import { ipotesiAutomatiche } from '@/lib/piano/automatico';
import {
  ORIZZONTE_MASSIMO,
  cercaSoluzioneVerde,
  differenzeSoluzione,
  estendiConTrend,
  ipotesiAssoluteDa,
  luceManopola,
  rateDaPianoRientro,
  type PianoRientro,
} from '@/lib/piano/ricevente';
import {
  indicatori,
  testoSoluzione,
  type SoluzioneSalvata,
} from '@/lib/piano/riceventeSalvataggio';
import { PassiPianoRicevente } from '@/components/spazio/PassiPianoRicevente';
import { ConfrontaPianiScenario } from '@/components/spazio/ConfrontaPianiScenario';

const GRUPPI: DefinizioneManopola['gruppo'][] = ['Ricavi', 'Costi', 'Circolante', 'Finanza'];

/** Allunga le ipotesi quando cresce l'orizzonte: l'ultimo valore di ogni riga prosegue. */
function estendiIpotesi(ip: IpotesiPiano, orizzonte: number): IpotesiPiano {
  const out: IpotesiPiano = {};
  for (const [r, arr] of Object.entries(ip) as [RigaIpotesi, (Ipotesi | null)[]][]) {
    const a = [...(arr ?? [])].slice(0, orizzonte);
    const ultimo = [...a].reverse().find(Boolean) ?? null;
    while (a.length < orizzonte)
      a.push(ultimo ? { tipo: ultimo.tipo, valore: ultimo.valore } : null);
    out[r] = a;
  }
  return out;
}

function Spia({
  etichetta,
  valore,
  ok,
}: {
  etichetta: string;
  valore: string;
  ok: boolean | null;
}) {
  const colore = ok === null ? 'bg-slate-300' : ok ? 'bg-emerald-500' : 'bg-red-500';
  return (
    <div className="flex-1 min-w-[120px] bg-white border border-slate-200 rounded-lg px-3 py-2">
      <span className="text-[9px] text-slate-400 uppercase font-bold block">{etichetta}</span>
      <span className="text-sm font-bold text-slate-900 block tabular-nums">{valore}</span>
      <div className={`h-1.5 rounded-full mt-1 ${colore}`} />
    </div>
  );
}

interface Props {
  nomeSchema: string;
  codice: string;
  scenarioId: number;
  aziendaId: number;
  /** RICEVUTA: sotto il piano compare il confronto con il piano dell'azienda. */
  tipoProposta?: 'RICEVUTA' | 'DA_DEFINIRE';
}

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : Math.round(n).toLocaleString('it-IT');

export function PianoSviluppoScenario({
  nomeSchema,
  codice,
  scenarioId,
  aziendaId,
  tipoProposta,
}: Props) {
  const [dati, setDati] = useState<DatiPianoSviluppo | null>(null);
  const [ipotesi, setIpotesi] = useState<IpotesiPiano>({});
  // Ricevente con il piano dell'azienda: le manopole lo rettificano.
  const [rettifiche, setRettifiche] = useState<Rettifiche>({});
  const [orizzonte, setOrizzonte] = useState(5);
  const [variante, setVariante] = useState('base');
  const [note, setNote] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [modificato, setModificato] = useState(false);
  // Contesto per l'AI, calcolato dal riquadro del confronto (settore già letto lì).
  const [contestoConfronto, setContestoConfronto] = useState<ContestoConfronto | null>(null);
  // Il contesto che il confronto con il piano dell'azienda produce non esiste
  // nel percorso Redigente (quel pannello non c'è). L'elaborazione con l'AI ne
  // ha bisogno per la crescita di riferimento e le soglie: qui si legge da
  // solo, così il pulsante non resta spento senza un motivo visibile.
  const [contestoBase, setContestoBase] = useState<ContestoConfronto | null>(null);
  const [aiInCorso, setAiInCorso] = useState(false);
  const [avvisoAi, setAvvisoAi] = useState<string | null>(null);
  // L'ATTENZIONE DELLA CONTABILE E IL LANCIO (0.256.14). Il riquadro «Dove si
  // concentra l'attenzione» non resta una lettura da guardare: entra nel
  // prompt, con i vincoli che ne discendono. Procedura, offerta e prudenza si
  // scelgono qui, perché valgono per questa simulazione e non per lo spazio.
  const [attenzione, setAttenzione] = useState<{
    testo: string;
    vincoli: string[];
    soglia: number;
  } | null>(null);
  const [lancio, setLancio] = useState<LancioSimulazione>(LANCIO_PREDEFINITO);
  // LE CINQUE LEVE DEL LANCIO (0.256.18): tagli, tecnologia, diversificazione
  // di produzione e mercati, target di clientela. Ognuna è un sì/no con una
  // misura in percentuale, che la piattaforma propone e chi simula può
  // cambiare. Valgono per questa simulazione, non per lo spazio.
  const [leve, setLeve] = useState<LeveSimulazione>(LEVE_PREDEFINITE);
  // LE VARIABILI SONO DELL'OPERATORE (0.256.34): appena le tocca, la proposta
  // dell'analisi non le riscrive — fino al salvataggio del piano, che è il
  // momento in cui la scelta diventa quella della variante.
  const [leveToccate, setLeveToccate] = useState(false);
  // Ricevente, ordine dei fattori (0.129): variante di sistema, piano di
  // rientro, soluzione verde.
  const [serieSistema, setSerieSistema] = useState(false);
  const [pianoRientro, setPianoRientro] = useState<PianoRientro | null>(null);
  // In quanti anni si restituisce il debito: la voce che fissa le rate quando
  // la proposta non ne porta (0.256.21). Vuoto = rate della proposta.
  const [anniRientro, setAnniRientro] = useState<number | null>(null);
  const [soluzione, setSoluzione] = useState<SoluzioneSalvata | null>(null);
  const [soluzioneInCorso, setSoluzioneInCorso] = useState(false);

  const carica = async (v = variante) => {
    const r = await ottieniPianoSviluppoAction(nomeSchema, scenarioId, aziendaId, v);
    if (!r.success || !r.dati) return setErrore(r.error ?? 'Lettura non riuscita.');
    setDati(r.dati);
    setIpotesi(r.dati.ipotesi);
    setRettifiche(r.dati.rettifiche ?? {});
    setOrizzonte(r.dati.orizzonte);
    setNote(r.dati.note ?? '');
    setVariante(r.dati.variante);
    setSerieSistema(r.dati.serieSistema);
    setPianoRientro(r.dati.pianoRientro);
    // Il lancio torna con la variante: procedura, offerta, anni, impostazione.
    // Prima viveva solo nello stato del pannello e richiamare una variante lo
    // riportava ai valori predefiniti (0.256.31).
    if (r.dati.lancio)
      setLancio({
        procedura: r.dati.lancio.procedura,
        percentualeOfferta: r.dati.lancio.percentualeOfferta,
        prudenza: r.dati.lancio.prudenza,
      });
    const anniSalvati =
      r.dati.pianoRientro?.modalita === 'RATEALE' && r.dati.pianoRientro.mesi > 0
        ? Math.max(1, Math.round(r.dati.pianoRientro.mesi / 12))
        : (r.dati.lancio?.anniRientro ?? null);
    setAnniRientro(anniSalvati);
    // Gli anni del lancio senza un piano di rientro salvato: le rate si
    // dimensionano su quell'arco, come se fossero stati scritti a mano.
    if (!r.dati.pianoRientro && anniSalvati) {
      const debito = r.dati.debitoTarget ?? r.dati.offerto.ente + r.dati.offerto.altri;
      setPianoRientro({
        modalita: 'RATEALE',
        mesi: anniSalvati * 12,
        anticipoPct: 0,
        ...(debito > 0 ? { offerto: { ente: debito, altri: 0 } } : {}),
      });
    }
    // Con il flag di simulazione la procedura è quella dello scenario: non c'è
    // una seconda scelta da fare, e chiederla insinuerebbe un dubbio (0.256.21).
    if (r.dati.simulazioneAttiva) {
      setLancio((l) => ({
        ...l,
        procedura:
          r.dati!.tipoIstruttoria === 'DECRETO_LIQUIDAZIONE'
            ? 'LIQUIDAZIONE'
            : r.dati!.tipoIstruttoria === 'CRAM_DOWN'
              ? 'CRAM_DOWN'
              : 'ACCORDO',
      }));
    }
    setSoluzione(r.dati.soluzione);
    // Le leve salvate con la variante tornano nel pannello: la simulazione
    // ricorda con quali leve è stata prodotta, anche dopo un ricaricamento.
    // Una variante senza leve non eredita quelle della variante precedente.
    setLeve(r.dati.leve ?? LEVE_PREDEFINITE);
    setLeveToccate(false);
    setModificato(false);
  };
  useEffect(() => {
    carica('base');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId, aziendaId]);

  // Il contesto che manca al percorso Redigente: crescita di riferimento e
  // soglie si leggono dalla stessa fonte del confronto, senza il pannello.
  useEffect(() => {
    if (contestoConfronto || contestoBase || !dati || dati.storico.length === 0) return;
    let annullato = false;
    (async () => {
      const r = await ottieniConfrontoPianoAction(nomeSchema, scenarioId, aziendaId);
      if (annullato || !r.success || !r.dati) return;
      const crescita = crescitaDiRiferimento(
        r.dati.settore.punti,
        r.dati.settore.descrizione,
        dati.storico,
        r.dati.parametri.limiteTassoCrescita
      );
      setContestoBase({
        crescita: { tasso: crescita.tasso, descrizione: crescita.descrizione },
        soglie: r.dati.soglie,
        pianoAzienda: null,
        scostamenti: [],
      });
    })();
    return () => {
      annullato = true;
    };
  }, [contestoConfronto, contestoBase, dati, nomeSchema, scenarioId, aziendaId]);

  // L'attenzione della contabile si legge una volta per azienda: è materia sua,
  // non dello scenario. Se non è leggibile la simulazione va avanti senza.
  // Il debito non si restituisce in meno anni di quelli scelti: se una
  // variante torna con un orizzonte più corto dell'arco di restituzione,
  // l'orizzonte si allunga (0.256.35).
  useEffect(() => {
    if (anniRientro && orizzonte < anniRientro) {
      setOrizzonte(anniRientro);
      setIpotesi((ip) => estendiIpotesi(ip, anniRientro));
    }
  }, [anniRientro, orizzonte]);

  useEffect(() => {
    let annullato = false;
    (async () => {
      const r = await ottieniAttenzioneContabilePianoAction(codice, scenarioId, aziendaId);
      if (annullato) return;
      if (r.success && r.disponibile && r.testo)
        setAttenzione({ testo: r.testo, vincoli: r.vincoli ?? [], soglia: r.soglia ?? 50 });
      else setAttenzione(null);
    })();
    return () => {
      annullato = true;
    };
  }, [codice, scenarioId, aziendaId]);

  // Ricevente: il punto di partenza è il piano dell'azienda, se caricato.
  const pianoAzienda =
    tipoProposta === 'RICEVUTA' ? (contestoConfronto?.pianoAzienda ?? null) : null;
  const tassoSettore = contestoConfronto?.crescita.tasso ?? 0;
  const ipAzienda = useMemo(() => {
    if (!pianoAzienda || !dati || dati.storico.length === 0) return null;
    const ip = ipotesiDaPianoAzienda(pianoAzienda, dati.storico[0].anno + 1, orizzonte);
    if (!righeDelPianoAzienda(ip).size) return null;
    // Oltre l'ultimo anno dichiarato dall'azienda si prosegue con il settore.
    return estendiConTrend(ip, orizzonte, tassoSettore);
  }, [pianoAzienda, dati, orizzonte, tassoSettore]);
  const righeAzienda = useMemo(
    () => (ipAzienda ? righeDelPianoAzienda(ipAzienda) : new Set<RigaInput>()),
    [ipAzienda]
  );
  const modoRettifica = !!ipAzienda;
  const ipotesiEffettive = useMemo(
    () => (ipAzienda ? applicaRettifiche(ipAzienda, rettifiche, ipotesi) : ipotesi),
    [ipAzienda, rettifiche, ipotesi]
  );

  // Il debito da restituire: quello accertato dalla verifica amministrativa,
  // altrimenti il totale offerto dalla proposta.
  const debitoDaRestituire = dati
    ? (dati.debitoTarget ?? dati.offerto.ente + dati.offerto.altri)
    : 0;

  // Rate: dal piano di rientro scelto con le domande, altrimenti dalla proposta.
  const rate = useMemo(() => {
    if (!dati) return { ente: [], altri: [] };
    if (pianoRientro) return rateDaPianoRientro(dati.offerto, pianoRientro, orizzonte);
    return { ente: dati.rate.ente.slice(0, orizzonte), altri: dati.rate.altri.slice(0, orizzonte) };
  }, [dati, pianoRientro, orizzonte]);

  /** Fissa le rate: il debito accertato diviso gli anni scelti. */
  const impostaAnniRientro = (anni: number | null) => {
    setAnniRientro(anni);
    setModificato(true);
    setSoluzione(null);
    if (anni === null) {
      setPianoRientro(null);
      return;
    }
    const debito = debitoDaRestituire > 0 ? debitoDaRestituire : null;
    setPianoRientro({
      modalita: 'RATEALE',
      mesi: anni * 12,
      anticipoPct: 0,
      ...(debito === null ? {} : { offerto: { ente: debito, altri: 0 } }),
    });
    // IL PIANO NON PUÒ ESSERE PIÙ CORTO DELLA RESTITUZIONE (0.256.35): se si
    // sceglie di pagare in più anni, l'orizzonte si allunga con loro.
    if (anni > orizzonte) {
      setOrizzonte(anni);
      setIpotesi((ip) => estendiIpotesi(ip, anni));
    }
  };

  // LE LEVE ENTRANO NEL CALCOLO IN UN SOLO PUNTO (0.256.36). Le ipotesi sono
  // il percorso; `calcolaPianoConLeve` applica le leve una volta e restituisce
  // piano e ipotesi che lo producono. Tabella, effetti, confronto e
  // salvataggio leggono da qui: nessuna vista ricalcola lo stesso piano con
  // premesse diverse, e nessuna applica le leve una seconda volta.
  const calcolo = useMemo(() => {
    if (!dati || dati.storico.length === 0) return null;
    return calcolaPianoConLeve({
      storico: dati.storico[0],
      orizzonte,
      ipotesi: ipotesiEffettive,
      leve,
      rate,
      capitaleSociale: dati.capitaleSociale,
    });
  }, [dati, orizzonte, ipotesiEffettive, leve, rate]);
  const conLeve = calcolo?.applicazione ?? null;
  const esito = calcolo?.esito ?? null;

  // Riferimento di settore e piano di sistema: le stesse rettifiche delle
  // manopole valgono per le righe del piano dell'azienda anche qui, e il piano
  // di sistema porta le stesse leve del piano in schermo (0.256.36), così le
  // due colonne si leggono con le stesse premesse. Il riferimento resta quello
  // di settore, senza leve: è il metro con cui si misura il piano.
  const sistema = useMemo(() => {
    if (!dati || dati.storico.length === 0 || !ipAzienda || !contestoConfronto) return null;
    const base = dati.storico[0];
    const auto = ipotesiAutomatiche(base, orizzonte, tassoSettore);
    const riferimento = calcolaPiano(base, orizzonte, auto, rate, dati.capitaleSociale);
    const ipSis = ipotesiAssoluteDa(riferimento.anni, [...righeAzienda]);
    const rettificato = calcolaPianoConLeve({
      storico: base,
      orizzonte,
      ipotesi: applicaRettifiche(ipSis, rettifiche, auto),
      leve,
      rate,
      capitaleSociale: dati.capitaleSociale,
    }).esito;
    return { riferimento, rettificato };
  }, [
    dati,
    ipAzienda,
    contestoConfronto,
    orizzonte,
    tassoSettore,
    rate,
    righeAzienda,
    rettifiche,
    leve,
  ]);

  if (errore)
    return (
      <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
        {errore}
      </p>
    );
  if (!dati) return <p className="text-xs text-slate-500">Caricamento del piano…</p>;
  if (dati.storico.length === 0)
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
        Per costruire il piano serve almeno un bilancio XBRL dell’azienda: caricalo dalla scheda
        «Bilanci» dello scenario. Il piano parte dalle macro-voci di quel bilancio.
      </div>
    );

  const storico = [...dati.storico].reverse(); // dal piu' vecchio
  const base = dati.storico[0];
  const anniPiano = esito?.anni ?? [];
  const manopole = definizioniManopole(base, aliquotaImplicita(base) ?? 27.9);

  // LE VARIABILI FERME (0.256.34). Se i ricavi del piano ripetono quelli
  // dell'ultimo bilancio per tutti gli anni e nessuna leva è accesa, la tabella
  // mostra la stessa riga per tutto l'orizzonte: chi legge deve sapere se è una
  // scelta o un'ipotesi che manca.
  const variazioneRicavi =
    anniPiano.length > 0 && base.ricaviVendite > 0
      ? ((anniPiano[anniPiano.length - 1].ricaviVendite - base.ricaviVendite) /
          base.ricaviVendite) *
        100
      : null;
  const pianoFermo =
    variazioneRicavi !== null && Math.abs(variazioneRicavi) < 0.5 && contaLeve(leve) === 0;
  const setCella = (riga: RigaInput, i: number, ip: Ipotesi | null) => {
    if (righeAzienda.has(riga)) return; // la riga segue il piano dell'azienda e la sua manopola
    const arr = [...(ipotesi[riga] ?? [])];
    while (arr.length < orizzonte) arr.push(null);
    arr[i] = ip;
    setIpotesi({ ...ipotesi, [riga]: arr });
    setModificato(true);
  };

  const valoreStorico = (
    riga: RigaInput,
    s: DatiPianoSviluppo['storico'][number]
  ): number | null => {
    switch (riga) {
      case 'ricaviVendite':
        return s.ricaviVendite;
      case 'altriRicavi':
        return s.valoreProduzione - s.ricaviVendite;
      case 'costiOperativi':
        return Math.max(0, s.costiProduzione - s.ammortamenti);
      case 'ammortamenti':
        return s.ammortamenti;
      case 'oneriFinanziari':
        return s.oneriFinanziari;
      case 'creditiClienti':
        return s.creditiClienti;
      case 'debitiFornitori':
        return s.debitiFornitori;
      case 'debitiBanche':
        return s.debitiBanche;
      default:
        return null;
    }
  };
  const valorePiano = (riga: RigaInput, a: (typeof anniPiano)[number]): number => {
    switch (riga) {
      case 'aliquotaImposte':
        return a.utileAnteImposte > 0
          ? Math.round((a.imposte / a.utileAnteImposte) * 1000) / 10
          : 0;
      default:
        return (a as unknown as Record<string, number>)[riga] ?? 0;
    }
  };

  const RIGHE_DERIVATE: {
    chiave: keyof (typeof anniPiano)[number];
    etichetta: string;
    storico: (s: DatiPianoSviluppo['storico'][number]) => number | null;
    forte?: boolean;
  }[] = [
    {
      chiave: 'valoreProduzione',
      etichetta: 'Valore della produzione',
      storico: (s) => s.valoreProduzione,
      forte: true,
    },
    {
      chiave: 'ebitda',
      etichetta: 'EBITDA',
      storico: (s) => s.valoreProduzione - s.costiProduzione + s.ammortamenti,
      forte: true,
    },
    { chiave: 'ebit', etichetta: 'EBIT', storico: (s) => s.valoreProduzione - s.costiProduzione },
    {
      chiave: 'costiPersonale',
      etichetta: 'Costo del personale',
      storico: (s) => s.costiPersonale ?? null,
    },
    { chiave: 'imposte', etichetta: 'Imposte', storico: () => null },
    {
      chiave: 'utile',
      etichetta: 'Risultato d’esercizio',
      storico: (s) => s.utileEsercizio,
      forte: true,
    },
    { chiave: 'rateEnte', etichetta: 'Rate del piano di rientro — ente', storico: () => null },
    {
      chiave: 'rateAltri',
      etichetta: 'Rate del piano di rientro — altri creditori',
      storico: () => null,
    },
    { chiave: 'flussoGestione', etichetta: 'Flusso di cassa della gestione', storico: () => null },
    { chiave: 'flussoNetto', etichetta: 'Flusso di cassa netto', storico: () => null },
    {
      chiave: 'disponibilitaLiquide',
      etichetta: 'Disponibilità liquide (fine anno)',
      storico: (s) => s.disponibilitaLiquide,
      forte: true,
    },
    {
      chiave: 'patrimonioNetto',
      etichetta: 'Patrimonio netto (fine anno)',
      storico: (s) => s.patrimonioNetto,
      forte: true,
    },
    {
      chiave: 'debitiPrevidenziali',
      etichetta: 'Debiti previdenziali (fine anno)',
      storico: (s) => s.debitiPrevidenziali,
    },
    { chiave: 'totaleDebiti', etichetta: 'Totale debiti', storico: (s) => s.totaleDebiti },
    { chiave: 'totaleAttivo', etichetta: 'Totale attivo', storico: (s) => s.totaleAttivo },
  ];

  const salva = async () => {
    const r = await salvaPianoSviluppoAction(
      codice,
      scenarioId,
      variante,
      orizzonte,
      ipotesiEffettive,
      note || null,
      modoRettifica ? rettifiche : null,
      modoRettifica
        ? { pianoRientro, serieSistema, soluzione, leve, lancio: { ...lancio, anniRientro } }
        : { leve, lancio: { ...lancio, anniRientro } }
    );
    if (!r.success) return setErrore(r.error ?? 'Errore.');
    await carica(variante);
  };

  // Il contesto per l'AI: quello del confronto quando c'è, altrimenti quello
  // letto qui sopra. Il pulsante non si spegne per un pannello assente.
  const contestoAi = contestoConfronto ?? contestoBase;

  const elaboraConAi = async () => {
    if (!dati || !esito || !contestoAi) return;
    if (
      dati.varianti.includes(VARIANTE_AI) &&
      !(await confermaApp(
        'Esiste già la variante «elaborazione-ai»: una nuova elaborazione la riscrive. Le altre varianti restano come sono; se è il progetto del piano, l’elaborazione si ferma senza toccarla.',
        { titolo: 'Nuova elaborazione con l’AI', etichettaConferma: 'Elabora di nuovo' }
      ))
    )
      return;
    setAiInCorso(true);
    setErrore(null);
    try {
      const r = await elaboraPianoConAiAction(codice, scenarioId, {
        lato: tipoProposta === 'RICEVUTA' ? 'RICEVUTA' : 'DA_DEFINIRE',
        orizzonte,
        storico: dati.storico.slice(0, 3),
        crescita: contestoAi.crescita,
        rate: {
          ente: dati.rate.ente.slice(0, orizzonte),
          altri: dati.rate.altri.slice(0, orizzonte),
        },
        pianoAzienda: contestoAi.pianoAzienda,
        scostamenti: contestoAi.scostamenti,
        ipotesiCorrenti: ipotesi,
        attenzioneContabile: attenzione?.testo ?? null,
        lancio: testoLancio({ ...lancio, anniRientro }),
        // Le leve del lancio come scelte: il server ne ricava il testo per il
        // prompt e le salva con la variante. Il contesto economico e il piano
        // della verifica aziendale li aggiunge il server (dati dello spazio).
        leveScelte: leve,
        leveModificate: leveToccate,
        minAnni: anniRientro ?? 0,
        impostazione: lancio.prudenza,
        procedura: lancio.procedura,
        vincoli: [...esito.vincoli.map((v) => v.testo), ...(attenzione?.vincoli ?? [])],
      });
      if (!r.success) {
        setAvvisoAi(r.error ?? 'Elaborazione non riuscita.');
        return;
      }
      setAvvisoAi(null);
      await carica(VARIANTE_AI);
    } finally {
      setAiInCorso(false);
    }
  };

  /** Nella ricerca della soluzione il motore cerca la combinazione verde, l'AI ne scrive la lettura. */
  const calcolaSoluzione = async () => {
    if (!dati || !ipAzienda || !sistema) return;
    setSoluzioneInCorso(true);
    setErrore(null);
    try {
      const base = dati.storico[0];
      // Si parte sempre dal piano dell'azienda: manopole a zero, nessun apporto
      // aggiunto. Le ipotesi restano quelle scritte: le leve le applica il
      // calcolo, una volta sola (0.256.36).
      const ipOrdinarie: IpotesiPiano = { ...ipotesiEffettive };
      if (soluzione?.apportoIniziale && ipOrdinarie.apportiSoci?.[0]) {
        const arr = [...ipOrdinarie.apportiSoci];
        const v = (arr[0]?.valore ?? 0) - soluzione.apportoIniziale;
        arr[0] = v > 0 ? { tipo: 'abs', valore: v } : null;
        ipOrdinarie.apportiSoci = arr;
      }
      const ing = {
        storico: base,
        orizzonte,
        ipAzienda,
        ipOrdinarie,
        leve,
        rate,
        capitaleSociale: dati.capitaleSociale,
      };
      const sol = cercaSoluzioneVerde(ing);
      const pianoAz = calcolaPianoConLeve({
        storico: base,
        orizzonte,
        ipotesi: applicaRettifiche(ipAzienda, {}, ipOrdinarie),
        leve,
        rate,
        capitaleSociale: dati.capitaleSociale,
      }).esito;
      const diff = differenzeSoluzione(sol, sistema.riferimento.anni);
      const ind = {
        azienda: indicatori(pianoAz),
        sistema: indicatori(sistema.riferimento),
        soluzione: indicatori(sol.esito),
      };
      const off = pianoRientro?.offerto ?? dati.offerto;
      const testo = testoSoluzione(sol, diff, ind, pianoRientro, orizzonte, off.ente + off.altri);
      const salvata: SoluzioneSalvata = {
        verde: sol.verde,
        rettifiche: Object.fromEntries(
          Object.entries(sol.rettifiche).map(([k, v]) => [k, v?.valore ?? 0])
        ),
        apportoIniziale: sol.apportoIniziale,
        differenze: diff,
        indicatori: ind,
        testo,
        commentoAi: null,
        calcolataIl: new Date().toISOString(),
      };
      // Le manopole si posizionano sulla soluzione.
      setRettifiche(sol.rettifiche);
      if (sol.apportoIniziale > 0) {
        const arr = [...(ipOrdinarie.apportiSoci ?? [])];
        while (arr.length < orizzonte) arr.push(null);
        arr[0] = { tipo: 'abs', valore: (arr[0]?.valore ?? 0) + sol.apportoIniziale };
        setIpotesi({ ...ipOrdinarie, apportiSoci: arr });
      } else setIpotesi(ipOrdinarie);
      setSoluzione(salvata);
      setModificato(true);
      // La lettura dell'AI, se disponibile: non sposta numeri.
      const c = await commentaSoluzionePianoAction(codice, scenarioId, testo, {
        crescita: contestoConfronto?.crescita.descrizione ?? '',
        scostamenti: (contestoConfronto?.scostamenti ?? []).map(
          (x) => `${x.voce} (${x.luce}, fino a +${x.ottimismoMassimo}%)`
        ),
      });
      if (c.success && c.commento) setSoluzione({ ...salvata, commentoAi: c.commento });
      else setAvvisoAi(c.error ?? null);
    } finally {
      setSoluzioneInCorso(false);
    }
  };

  const stampa = () => {
    if (!esito) return;
    const motivazioniAi = RIGHE_INPUT.flatMap((r) =>
      (ipotesi[r] ?? []).flatMap((ip, i) =>
        ip?.motivazione
          ? [`${ETICHETTA_RIGA[r]}, ${anniPiano[i]?.anno ?? ''}: ${ip.motivazione}`]
          : []
      )
    );
    // Tutto il testo che entra nell'HTML di stampa passa da esc: anche i valori
    // calcolati, perché le motivazioni e le note vengono da utente e AI.
    const esc = (t: unknown) =>
      String(t ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const intest = `<tr><th>Voce</th>${storico.map((s) => `<th class="num">${s.anno}</th>`).join('')}${anniPiano.map((a) => `<th class="num">${a.anno}*</th>`).join('')}</tr>`;
    const rigaHtml = (etichetta: string, st: (number | null)[], pl: number[], forte = false) =>
      `<tr${forte ? ' class="tot"' : ''}><td>${esc(etichetta)}</td>${st.map((v) => `<td class="num">${fmt(v)}</td>`).join('')}${pl.map((v) => `<td class="num">${fmt(v)}</td>`).join('')}</tr>`;
    const corpo =
      `<p class="note">Variante «${esc(variante)}» — orizzonte ${esc(orizzonte)} anni. Colonne con * = anni del piano; le righe di ipotesi sono compilate dall’utente, le altre sono calcolate. Personale compreso nei costi della produzione.</p>` +
      `<table><thead>${intest}</thead><tbody>` +
      RIGHE_INPUT.filter((r) => !RIGHE_FLUSSO.has(r) || (ipotesi[r] ?? []).some(Boolean))
        .map((r) =>
          rigaHtml(
            ETICHETTA_RIGA[r],
            storico.map((s) => valoreStorico(r, s)),
            anniPiano.map((a) => valorePiano(r, a))
          )
        )
        .join('') +
      RIGHE_DERIVATE.map((d) =>
        rigaHtml(
          d.etichetta,
          storico.map(d.storico),
          anniPiano.map((a) => a[d.chiave] as number),
          d.forte
        )
      ).join('') +
      `</tbody></table>` +
      `<h2 style="font-size:14px">Esito</h2><p style="white-space:pre-wrap;font-size:12px">${esc(esito.sintesi)}</p>` +
      (esito.vincoli.length
        ? `<ul>${esito.vincoli.map((v) => `<li>${esc(v.testo)}</li>`).join('')}</ul>`
        : '') +
      (motivazioniAi.length
        ? `<h2 style="font-size:14px">Motivazioni delle ipotesi scritte dall’AI</h2><ul style="font-size:11px">${motivazioniAi.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
        : '') +
      (note
        ? `<h2 style="font-size:14px">Note</h2><p style="white-space:pre-wrap;font-size:12px">${esc(note)}</p>`
        : '');
    stampaHtml(
      'Piano di sviluppo',
      corpo,
      'Modello sulle macro-voci del bilancio XBRL; calcolo deterministico',
      dati.salvatoIl
    );
  };

  // Ricevente: prima il piano dell'azienda contro il riferimento (dove è
  // ottimista), poi il cruscotto che lo rettifica. Redigente: in coda,
  // come autoverifica della propria variante.
  const confronto = (
    <ConfrontoPianoAziendale
      nomeSchema={nomeSchema}
      codice={codice}
      scenarioId={scenarioId}
      aziendaId={aziendaId}
      dati={dati}
      orizzonte={orizzonte}
      onVarianteCreata={(v) => carica(v)}
      lato={tipoProposta === 'RICEVUTA' ? 'RICEVUTA' : 'DA_DEFINIRE'}
      ipotesiCorrenti={ipotesiEffettive}
      leve={leve}
      nomeVariante={variante}
      onContesto={setContestoConfronto}
      senzaCopia={tipoProposta === 'RICEVUTA'}
      rateScelte={tipoProposta === 'RICEVUTA' && pianoRientro ? rate : null}
      soloIngresso={tipoProposta === 'RICEVUTA'}
    />
  );

  return (
    <div className="space-y-4">
      {tipoProposta === 'RICEVUTA' && !dati.simulazioneAttiva && confronto}

      {/* CHE COSA ENTRA NELLA SIMULAZIONE (0.256.14). Il riquadro dell'attenzione
          della contabile e i parametri di lancio stanno sopra le manopole perché
          sono il perimetro, non un risultato: l'AI scrive le ipotesi dentro
          questo, e i parametri generali (aliquota, tolleranze, soglia
          dell'attenzione) restano in Parametri › Piano e simulazione AI, dove
          valgono per tutte le aziende dello spazio. */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
            Che cosa entra nella simulazione
          </h2>
          <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
            L’attenzione della verifica contabile — le dimensioni sopra la soglia dello spazio, con
            i determinanti e le lacune — e il piano dell’azienda dalla verifica. Non sono risultati:
            sono il perimetro entro cui l’AI scrive le ipotesi, e il motore calcola.
          </p>
        </div>
        {attenzione ? (
          <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 border border-slate-200 p-2 text-[10px] text-slate-700 leading-relaxed">
            {attenzione.testo}
          </pre>
        ) : (
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Attenzione della contabile non disponibile per questa azienda, o non leggibile con il
            tuo profilo: la simulazione lavora sui bilanci, sulle rate e sul riferimento di settore.
          </p>
        )}
        <p className="border-t border-slate-200 pt-3 text-[10px] text-slate-500 leading-relaxed">
          Le leve e i parametri del lancio — che cosa l’azienda mette in gioco, con quale offerta e
          in quanti anni restituisce il debito — stanno sotto l’analisi del piano: li propone l’AI e
          li cambi tu.
        </p>
        {/* IL PIANO DELLA VERIFICA AZIENDALE (passo 3): con il flag di
            simulazione è il piano di sviluppo dell'azienda, ed è quello su cui
            l'AI lavora. Se manca, si dice: il piano non parte da una base
            che non c'è. */}
        <div className="border-t border-slate-200 pt-3 space-y-1">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Piano dell’azienda dalla verifica aziendale
          </p>
          {!dati.simulazioneAttiva ? (
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Lo scenario non ha il flag di simulazione: il piano dell’azienda è quello presentato
              (Excel o PDF) e la verifica aziendale resta un controllo, non la base del piano.
            </p>
          ) : dati.pianoVerifica.length === 0 ? (
            <p className="text-[10px] text-amber-800 leading-relaxed">
              Flag di simulazione attivo, ma il passo 3 della verifica aziendale non ha ancora
              annualità salvate: la simulazione parte dai bilanci e lo dichiara, invece di inventare
              una proiezione dell’azienda.
            </p>
          ) : (
            <>
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 border border-slate-200 p-2 text-[10px] text-slate-700 leading-relaxed">
                {testoPianoVerifica(dati.pianoVerifica)}
              </pre>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                È la base del piano simulato: dove l’AI se ne discosta, lo motiva.
              </p>
            </>
          )}
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Contesto economico dello spazio:{' '}
            {dati.parametriContesto === 0
              ? 'nessun parametro con un valore — si inseriscono in Parametri › Piano e simulazione AI.'
              : `${dati.parametriContesto} parametri con un valore, in Parametri › Piano e simulazione AI.`}
          </p>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-start gap-2 flex-wrap">
          <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
                Piano di sviluppo
              </h2>
              {dati.progetto && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 rounded">
                  <Lock className="w-3 h-3" /> Progetto — definitivo
                </span>
              )}
            </div>
          </div>
        </div>
        {/* La descrizione prende tutta la larghezza della tabella: nella colonna
            accanto ai pulsanti si riduceva a una striscia (0.256.31). */}
        {modoRettifica ? (
          <p className="text-[11px] text-slate-600 mt-0.5">
            <strong>1 · Piano dell’azienda.</strong> Le manopole partono dal piano presentato
            dall’azienda, proiettato dallo stato attuale (<strong>{dati.partenza.etichetta}</strong>
            ); la fascia «azienda» sotto ogni manopola dice quanto quella voce si discosta dal
            riferimento di settore. Ogni manopola rettifica la voce in percentuale, uguale per tutti
            gli anni. Poi, nei passi 2–4 sotto la tabella: variante di sistema, piano di rientro,
            soluzione verde.
          </p>
        ) : tipoProposta === 'RICEVUTA' && !dati.simulazioneAttiva ? (
          <p className="text-[11px] text-amber-800 mt-0.5">
            Il piano dell’azienda non è ancora caricato: caricalo nel riquadro qui sopra e le
            manopole partiranno da quello. Intanto lavorano sullo stato attuale —{' '}
            <strong>{dati.partenza.etichetta}</strong>.
          </p>
        ) : (
          <p className="text-[11px] text-slate-600 mt-0.5">
            Si parte dallo stato attuale — <strong>{dati.partenza.etichetta}</strong> — e si
            proietta in avanti. Gira le manopole: ogni manopola vale per tutti gli anni del piano e
            il risultato si ricalcola subito. Per ritoccare un solo anno apri la tabella anno per
            anno. Il personale è dentro i costi operativi; le rate del piano di rientro
            {dati.simulazioneAttiva
              ? ' seguono gli anni di restituzione del debito qui sopra.'
              : ' vengono dalla proposta.'}
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[10px] font-bold text-slate-500 uppercase">Variante</label>
          <select
            value={variante}
            onChange={(e) => carica(e.target.value)}
            className="p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          >
            {Array.from(new Set([...dati.varianti, variante])).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={async () => {
              // Nessun prompt nativo: il nome e' progressivo, rinominabile in seguito.
              const n = `variante-${dati.varianti.length + 1}`;
              const r = await salvaPianoSviluppoAction(
                codice,
                scenarioId,
                n,
                orizzonte,
                ipotesiEffettive,
                note || null,
                modoRettifica ? rettifiche : null,
                {
                  leve,
                  lancio: { ...lancio, anniRientro },
                  ...(modoRettifica ? { pianoRientro, serieSistema, soluzione } : {}),
                }
              );
              if (!r.success) return setErrore(r.error ?? 'Errore.');
              await carica(n);
            }}
            className="flex items-center gap-1 px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
            title="Copia le ipotesi correnti in una nuova variante"
          >
            <Plus className="w-3 h-3" /> Nuova variante da questa
          </button>
          {
            <button
              type="button"
              onClick={elaboraConAi}
              disabled={aiInCorso || !contestoAi || !esito}
              className="flex items-center gap-1 px-2 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
              title={
                modoRettifica
                  ? 'L’AI rettifica le righe del piano dell’azienda dove è più ottimista del riferimento, con la motivazione; il calcolo resta al motore. Salvata come variante «elaborazione-ai».'
                  : 'L’AI imposta le manopole, una per riga, con la motivazione, e propone le scelte che reggono il piano (leve, procedura, offerta, anni); il calcolo resta al motore. Salvata come variante «elaborazione-ai».'
              }
            >
              {aiInCorso ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {aiInCorso
                ? 'Elaborazione…'
                : modoRettifica
                  ? 'L’AI rettifica il piano dell’azienda'
                  : 'L’AI imposta manopole e scelte'}
            </button>
          }
          {!dati.progetto && (
            <button
              type="button"
              onClick={async () => {
                if (
                  !(await confermaApp(
                    `Salvare «${variante}» come progetto del piano? Da quel momento è definitivo: non si cancella e non si modifica.`,
                    { etichettaConferma: 'Salva il progetto' }
                  ))
                )
                  return;
                // La «base» non ha una riga finché non si salva: il server
                // riceve lo stato del pannello e lo salva prima di renderlo
                // definitivo (0.256.32).
                const r = await rendiProgettoPianoAction(
                  codice,
                  scenarioId,
                  variante,
                  dati.salvata
                    ? undefined
                    : {
                        orizzonte,
                        ipotesi: ipotesiEffettive,
                        note: note || null,
                        ...(modoRettifica
                          ? { rettifiche, pianoRientro, serieSistema, soluzione }
                          : {}),
                        leve,
                        lancio: { ...lancio, anniRientro },
                      }
                );
                if (!r.success) return setErrore(r.error ?? 'Errore.');
                await carica(variante);
              }}
              className="flex items-center gap-1 px-2 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[10px] uppercase rounded-lg"
              title="La variante diventa il progetto del piano: definitiva, non si cancella e non si modifica"
            >
              <Lock className="w-3 h-3" /> Salva il progetto
            </button>
          )}
          {!dati.progetto && variante !== 'base' && (
            <button
              type="button"
              onClick={async () => {
                if (
                  !(await confermaApp(`Eliminare la variante «${variante}»?`, {
                    distruttiva: true,
                    etichettaConferma: 'Elimina',
                  }))
                )
                  return;
                const r = await eliminaVariantePianoAction(codice, scenarioId, variante);
                if (!r.success) return setErrore(r.error ?? 'Errore.');
                await carica('base');
              }}
              className="text-slate-400 hover:text-red-600"
              title="Elimina la variante"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <label className="text-[10px] font-bold text-slate-500 uppercase ml-2">Orizzonte</label>
          {anniRientro !== null && (
            <span className="text-[10px] text-slate-500">
              non meno degli anni di restituzione del debito ({anniRientro})
            </span>
          )}
          <select
            value={orizzonte}
            onChange={(e) => {
              const n = Number(e.target.value);
              setOrizzonte(n);
              setIpotesi((ip) => estendiIpotesi(ip, n));
              setModificato(true);
            }}
            className="p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
          >
            {Array.from(
              new Set([
                orizzonte,
                ...Array.from({ length: ORIZZONTE_MASSIMO - 2 }, (_, i) => i + 3),
              ])
            )
              .sort((a, b) => a - b)
              .map((n) => (
                <option
                  key={n}
                  value={n}
                  disabled={anniRientro !== null && n < anniRientro}
                  title={
                    anniRientro !== null && n < anniRientro
                      ? `Il debito si restituisce in ${anniRientro} anni: il piano non può essere più corto.`
                      : undefined
                  }
                >
                  {n} {n === 1 ? 'anno' : 'anni'}
                </option>
              ))}
          </select>
        </div>

        {esito && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {(() => {
                const ultimo = anniPiano[anniPiano.length - 1];
                const coperture = anniPiano
                  .map((a) => a.coperturaRate)
                  .filter((c): c is number => c !== null);
                const copMin = coperture.length ? Math.min(...coperture) : null;
                return (
                  <>
                    <Spia
                      etichetta={`EBITDA ${ultimo?.anno ?? ''}`}
                      valore={euro(ultimo?.ebitda ?? 0)}
                      ok={(ultimo?.ebitda ?? 0) > 0}
                    />
                    <Spia
                      etichetta="Cassa minima"
                      valore={euro(esito.cassaMinima)}
                      ok={esito.cassaMinima >= 0}
                    />
                    <Spia
                      etichetta="Copertura rate (minima)"
                      valore={copMin === null ? 'nessuna rata' : `${copMin.toFixed(2)}×`}
                      ok={copMin === null ? null : copMin >= 1}
                    />
                    <Spia
                      etichetta={`Patrimonio netto ${ultimo?.anno ?? ''}`}
                      valore={euro(ultimo?.patrimonioNetto ?? 0)}
                      ok={(ultimo?.patrimonioNetto ?? 0) >= 0}
                    />
                  </>
                );
              })()}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {GRUPPI.map((g) => (
                <div key={g} className="border border-slate-200 rounded-lg p-2">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    {g}
                  </p>
                  <div className="flex flex-wrap justify-center gap-1">
                    {manopole
                      .filter((m) => m.gruppo === g)
                      .map((m0) => {
                        if (righeAzienda.has(m0.riga)) {
                          const m = definizioneRettifica(m0);
                          const r = rettifiche[m.riga];
                          return (
                            <Manopola
                              key={m.riga}
                              etichetta={m.etichetta}
                              valore={r?.valore ?? 0}
                              min={m.min}
                              max={m.max}
                              passo={m.passo}
                              neutro={m.neutro}
                              unita={m.unita}
                              aiuto={r?.motivazione ? `${m.aiuto}\nAI: ${r.motivazione}` : m.aiuto}
                              stato={luceDellaLeva(m.riga, r?.valore ?? 0, m.passo)}
                              daAi={!!r?.motivazione}
                              fasce={
                                sistema && esito && contestoConfronto
                                  ? [
                                      {
                                        etichetta: 'azienda',
                                        luce: luceManopola(
                                          esito.anni,
                                          sistema.riferimento.anni,
                                          m.riga,
                                          contestoConfronto.soglie
                                        ),
                                      },
                                      ...(serieSistema
                                        ? [
                                            {
                                              etichetta: 'sistema',
                                              luce: luceManopola(
                                                sistema.rettificato.anni,
                                                sistema.riferimento.anni,
                                                m.riga,
                                                contestoConfronto.soglie
                                              ),
                                            },
                                          ]
                                        : []),
                                    ]
                                  : undefined
                              }
                              onChange={(v) => {
                                setRettifiche((x) => ({ ...x, [m.riga]: { valore: v } }));
                                setModificato(true);
                              }}
                            />
                          );
                        }
                        const m = m0;
                        const l = letturaManopola(m, ipotesi, orizzonte);
                        return (
                          <Manopola
                            key={m.riga}
                            etichetta={m.etichetta}
                            valore={l.valore}
                            min={m.min}
                            max={m.max}
                            passo={m.passo}
                            neutro={m.neutro}
                            unita={m.unita}
                            aiuto={m.aiuto}
                            stato={luceDellaLeva(m.riga, l.valore, m.passo)}
                            variaPerAnno={l.variaPerAnno}
                            daAi={l.daAi}
                            onChange={(v) => {
                              setIpotesi((ip) => applicaManopola(m, ip, orizzonte, v));
                              setModificato(true);
                            }}
                          />
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>

            {pianoFermo && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 leading-relaxed">
                <strong>
                  I ricavi restano {fmt(base.ricaviVendite)} per tutti gli anni del piano.
                </strong>{' '}
                Se non è una scelta, il piano non prevede sviluppo: chiedi all’analisi di rifare le
                ipotesi partendo dalla crescita (fatturato, incidenza dei costi, tecnologia,
                ambiente), oppure accendi le leve che servono e rilancia l’elaborazione. Le leve
                sono le variabili che l’analisi usa, e le scegli tu.
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[9px] uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-2 text-left font-bold">Conto economico e cassa</th>
                    <th className="px-2 py-2 text-right font-bold">
                      {base.anno} {dati.partenza.fonte === 'posizione' ? '(attuale)' : ''}
                    </th>
                    {anniPiano.map((a) => (
                      <th key={a.anno} className="px-2 py-2 text-right font-bold text-blue-700">
                        {a.anno}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(
                    [
                      ['Valore della produzione', base.valoreProduzione, (a) => a.valoreProduzione],
                      ['Ricavi delle vendite', base.ricaviVendite, (a) => a.ricaviVendite],
                      [
                        'Costi della produzione',
                        base.costiProduzione,
                        (a) => a.costiOperativi + a.ammortamenti,
                      ],
                      [
                        'di cui costo del personale',
                        base.costiPersonale ?? null,
                        (a) => a.costiPersonale,
                      ],
                      [
                        'EBITDA',
                        base.valoreProduzione - base.costiProduzione + base.ammortamenti,
                        (a) => a.ebitda,
                      ],
                      ['EBIT', base.valoreProduzione - base.costiProduzione, (a) => a.ebit],
                      ['Oneri finanziari', base.oneriFinanziari, (a) => a.oneriFinanziari],
                      ['Risultato d’esercizio', base.utileEsercizio, (a) => a.utile],
                      ['Flusso di gestione', null, (a) => a.flussoGestione],
                      ['Rate del piano di rientro', null, (a) => a.rateEnte + a.rateAltri],
                      [
                        'Cassa a fine anno',
                        base.disponibilitaLiquide,
                        (a) => a.disponibilitaLiquide,
                      ],
                      ['Patrimonio netto', base.patrimonioNetto, (a) => a.patrimonioNetto],
                      ['Totale debiti', base.totaleDebiti, (a) => a.totaleDebiti],
                    ] as [string, number | null, (a: (typeof anniPiano)[number]) => number | null][]
                  ).map(([et, b, f]) => (
                    <React.Fragment key={et}>
                      <tr className={et.startsWith('di cui') ? 'text-slate-500' : undefined}>
                        <td className="px-2 py-1.5 text-slate-800">{et}</td>
                        <td className="px-2 py-1.5 text-right text-slate-500 tabular-nums">
                          {fmt(b)}
                        </td>
                        {anniPiano.map((a) => {
                          const v = f(a);
                          return (
                            <td
                              key={a.anno}
                              className={`px-2 py-1.5 text-right tabular-nums font-medium ${v !== null && v < 0 && et !== 'Rate del piano di rientro' ? 'text-red-700' : 'text-slate-900'}`}
                            >
                              {fmt(v)}
                            </td>
                          );
                        })}
                      </tr>
                      {modoRettifica && serieSistema && sistema && (
                        <tr className="bg-sky-50/50">
                          <td className="px-2 py-1 pl-5 text-[10px] text-sky-800">
                            piano di sistema
                          </td>
                          <td className="px-2 py-1" />
                          {sistema.rettificato.anni.map((a) => {
                            const v = f(a);
                            return (
                              <td
                                key={a.anno}
                                className={`px-2 py-1 text-right tabular-nums text-[11px] ${v !== null && v < 0 && et !== 'Rate del piano di rientro' ? 'text-red-600' : 'text-sky-900'}`}
                              >
                                {fmt(v)}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {conLeve &&
              (conLeve.effetti.length > 0 ||
                conLeve.sacrifici.length > 0 ||
                conLeve.avvisi.length > 0) && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Che cosa fanno le leve ai numeri
                  </p>
                  <ul className="space-y-1">
                    {conLeve.effetti.map((e) => (
                      <li key={e.id} className="text-[11px] text-slate-700 leading-relaxed">
                        <strong>{e.domanda}</strong> ({e.pct}%) — {e.testo}
                      </li>
                    ))}
                  </ul>
                  {conLeve.sacrifici.length > 0 && (
                    <div className="border-t border-slate-200 pt-2">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        I sacrifici che il piano chiede
                      </p>
                      <ul className="mt-1 space-y-1">
                        {conLeve.sacrifici.map((s) => (
                          <li key={s} className="text-[11px] text-amber-900 leading-relaxed">
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {conLeve.avvisi.length > 0 &&
                    conLeve.avvisi.map((a) => (
                      <p key={a} className="text-[11px] text-red-800 leading-relaxed">
                        {a}
                      </p>
                    ))}
                </div>
              )}
            {modoRettifica && (
              <PassiPianoRicevente
                offerto={dati.offerto}
                rientroProposta={dati.rientroProposta}
                pianoRientro={pianoRientro}
                orizzonte={orizzonte}
                serieSistema={serieSistema}
                sistemaDisponibile={!!sistema}
                soluzione={soluzione}
                soluzioneInCorso={soluzioneInCorso}
                onSerieSistema={(v) => {
                  setSerieSistema(v);
                  setModificato(true);
                }}
                onPianoRientro={(p, nuovoOrizzonte) => {
                  setPianoRientro(p);
                  if (nuovoOrizzonte && nuovoOrizzonte !== orizzonte) {
                    setOrizzonte(nuovoOrizzonte);
                    setIpotesi((ip) => estendiIpotesi(ip, nuovoOrizzonte));
                  }
                  setSoluzione(null);
                  setModificato(true);
                }}
                onCalcola={calcolaSoluzione}
              />
            )}
            {modoRettifica && (
              <ConfrontaPianiScenario
                nomeSchema={nomeSchema}
                scenarioId={scenarioId}
                aziendaId={aziendaId}
                dati={dati}
                orizzonte={orizzonte}
                leve={leve}
              />
            )}
          </div>
        )}

        {/* LE SCELTE DEL PIANO (0.256.31). Sotto l’analisi, non sopra: l’AI le
          propone insieme alle ipotesi — è la sua risposta alla domanda «come si
          fa fronte agli impegni assunti con l'ente» — e chi simula le cambia.
          Restano con la variante quando la si salva. */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Le scelte del piano — proposte dall’analisi
            </h2>
            <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
              Che cosa l’azienda mette in gioco, con quale offerta e in quanti anni restituisce il
              debito verso l’ente. L’analisi AI le propone con le ipotesi; se per questa azienda non
              valgono, cambiale e salvale con la variante: ogni variante le ricorda.
            </p>
          </div>
          {/* LE LEVE DEL LANCIO (0.256.18). Non sono manopole del motore: sono
            le scelte di che cosa mettere in gioco, e ognuna porta la sua
            misura. Il contesto economico (inflazione, spread, carburante,
            incidenza di crisi e instabilità, tecnologia) sta in Parametri ›
            Piano e simulazione AI, perché non varia per azienda. */}
          <div className="border-t border-slate-200 pt-3 space-y-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Le leve di questa simulazione ({contaLeve(leve)} accese su {LEVE.length})
            </p>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Che cosa deve prevedere il piano. L’analisi sceglie le leve e la misura; la
              piattaforma le traduce nei numeri del piano (personale, investimenti, ricavi nuovi,
              costi e crediti) e la tabella li mostra. Spegni o cambia una misura: il piano si
              ricalcola.{' '}
              {leveToccate ? (
                <strong className="text-slate-700">
                  Hai già scelto tu queste leve: la prossima analisi non le riscriverà, e le sue
                  proposte le leggerai nella sintesi. Restano con la variante quando salvi il piano.
                </strong>
              ) : (
                <>
                  L’analisi le propone insieme alle ipotesi e le motiva; se le cambi, la sua
                  proposta non le sostituisce, e i numeri si ricalcolano con le tue.
                </>
              )}
            </p>
            <div className="space-y-1.5">
              {LEVE.map((l) => {
                const s = leve[l.id];
                return (
                  <div
                    key={l.id}
                    className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_90px_120px] items-center rounded-lg border border-slate-200 p-2"
                  >
                    <div>
                      <p className="text-[11px] font-semibold text-slate-800">{l.domanda}</p>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        {l.misura} — {l.effetto}
                      </p>
                      {s.motivazione && (
                        <p className="text-[10px] text-violet-800 leading-relaxed mt-0.5">
                          <strong>Analisi:</strong> {s.motivazione}
                        </p>
                      )}
                    </div>
                    <select
                      value={s.attiva ? 'SI' : 'NO'}
                      onChange={(e) => {
                        setLeve((prev) => ({
                          ...prev,
                          [l.id]: { ...prev[l.id], attiva: e.target.value === 'SI' },
                        }));
                        setLeveToccate(true);
                        setModificato(true);
                      }}
                      className="p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800"
                    >
                      <option value="NO">No</option>
                      <option value="SI">Sì</option>
                    </select>
                    <label className="text-[10px] text-slate-500">
                      <span className="block">misura (%)</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="1"
                        value={s.misura}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setLeve((prev) => {
                            const misura = Number.isFinite(n)
                              ? Math.max(0, Math.min(100, n))
                              : prev[l.id].misura;
                            return {
                              ...prev,
                              [l.id]: {
                                ...prev[l.id],
                                misura,
                                // Lo 0% non produce numeri: la leva si spegne,
                                // così il pannello non dice «Sì» a un effetto nullo.
                                ...(misura === 0 ? { attiva: false } : {}),
                              },
                            };
                          });
                          setLeveToccate(true);
                          setModificato(true);
                        }}
                        disabled={!s.attiva}
                        className="mt-0.5 w-full p-1.5 text-xs text-right bg-white border border-slate-200 rounded-lg text-slate-800 disabled:opacity-50"
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {dati.simulazioneAttiva ? (
              // La procedura è già quella dello scenario: chiederla di nuovo
              // significherebbe mettere in dubbio il tipo scelto alla creazione.
              <div className="text-[10px] font-bold text-slate-500 uppercase">
                Procedura da sostenere
                <p className="mt-1 text-xs font-normal normal-case tracking-normal text-slate-800">
                  {ETICHETTA_PROCEDURA[lancio.procedura]} — è quella dello scenario.
                </p>
              </div>
            ) : (
              <label className="text-[10px] font-bold text-slate-500 uppercase">
                Procedura da sostenere
                <select
                  value={lancio.procedura}
                  onChange={(e) =>
                    setLancio((l) => ({
                      ...l,
                      procedura: e.target.value as LancioSimulazione['procedura'],
                    }))
                  }
                  className="mt-1 block p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-normal normal-case tracking-normal text-slate-800"
                >
                  {(['ACCORDO', 'LIQUIDAZIONE', 'CRAM_DOWN'] as const).map((p) => (
                    <option key={p} value={p}>
                      {ETICHETTA_PROCEDURA[p]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-[10px] font-bold text-slate-500 uppercase">
              Offerta ipotizzata (%)
              <input
                type="number"
                min={0}
                max={100}
                step="1"
                value={lancio.percentualeOfferta ?? ''}
                onChange={(e) => {
                  const n = e.target.value.trim() === '' ? null : Number(e.target.value);
                  setLancio((l) => ({
                    ...l,
                    percentualeOfferta: n === null || !Number.isFinite(n) ? null : n,
                  }));
                }}
                placeholder="come la proposta"
                className="mt-1 block w-32 p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-normal normal-case tracking-normal text-slate-800"
              />
            </label>
            <label className="text-[10px] font-bold text-slate-500 uppercase">
              Restituzione del debito (anni)
              <input
                type="number"
                min={1}
                max={ORIZZONTE_MASSIMO}
                step="1"
                value={anniRientro ?? ''}
                onChange={(e) => {
                  const testo = e.target.value.trim();
                  if (testo === '') return impostaAnniRientro(null);
                  const n = Number(testo);
                  if (!Number.isFinite(n)) return;
                  impostaAnniRientro(Math.max(1, Math.min(ORIZZONTE_MASSIMO, Math.round(n))));
                }}
                placeholder="come la proposta"
                title={`Il debito da restituire è ${euro(debitoDaRestituire)}: le rate si dividono sugli anni indicati. Vuoto = rate della proposta.`}
                className="mt-1 block w-32 p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-normal normal-case tracking-normal text-slate-800"
              />
            </label>
            <label className="text-[10px] font-bold text-slate-500 uppercase">
              Impostazione
              <select
                value={lancio.prudenza}
                onChange={(e) =>
                  setLancio((l) => ({
                    ...l,
                    prudenza: e.target.value as LancioSimulazione['prudenza'],
                  }))
                }
                className="mt-1 block p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-normal normal-case tracking-normal text-slate-800"
              >
                <option value="PRUDENTE">Prudente</option>
                <option value="NEUTRA">Neutra</option>
                <option value="FAVOREVOLE">Favorevole</option>
              </select>
            </label>
          </div>
          {attenzione && attenzione.vincoli.length > 0 && (
            <ul className="space-y-0.5">
              {attenzione.vincoli.map((v) => (
                <li key={v} className="text-[10px] text-amber-900 leading-relaxed">
                  <strong>Vincolo:</strong> {v}
                </li>
              ))}
            </ul>
          )}
        </div>
        <details className="group">
          <summary className="cursor-pointer text-[11px] font-bold text-blue-700 hover:underline">
            Tabella anno per anno — per ritoccare un singolo anno e vedere tutte le voci
          </summary>
          <div className="overflow-x-auto border border-slate-200 rounded-lg mt-2">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[9px] uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-left font-bold sticky left-0 bg-slate-50 min-w-64">
                    Voce
                  </th>
                  {storico.map((s) => (
                    <th key={s.anno} className="px-2 py-2 text-right font-bold">
                      {s.anno}
                      {s === base && dati.partenza.fonte === 'posizione' ? ' (attuale)' : ''}
                    </th>
                  ))}
                  {anniPiano.map((a) => (
                    <th key={a.anno} className="px-2 py-2 text-right font-bold text-blue-700">
                      {a.anno} (piano)
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {RIGHE_INPUT.map((riga) => (
                  <tr key={riga}>
                    <td className="px-2 py-1.5 text-slate-800 sticky left-0 bg-white">
                      {ETICHETTA_RIGA[riga]}
                    </td>
                    {storico.map((s) => (
                      <td
                        key={s.anno}
                        className="px-2 py-1.5 text-right text-slate-600 tabular-nums"
                      >
                        {riga === 'aliquotaImposte' ? '—' : fmt(valoreStorico(riga, s))}
                      </td>
                    ))}
                    {anniPiano.map((a, i) => {
                      const ip = ipotesiEffettive[riga]?.[i] ?? null;
                      const daAzienda = righeAzienda.has(riga);
                      return (
                        <td key={a.anno} className="px-1 py-1 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="any"
                              value={ip ? ip.valore : ''}
                              disabled={daAzienda}
                              placeholder={
                                RIGHE_FLUSSO.has(riga)
                                  ? riga === 'aliquotaImposte'
                                    ? fmt(valorePiano(riga, a))
                                    : '0'
                                  : '0%'
                              }
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '') return setCella(riga, i, null);
                                setCella(riga, i, {
                                  tipo: ip?.tipo ?? (RIGHE_FLUSSO.has(riga) ? 'abs' : 'pct'),
                                  valore: Number(v),
                                });
                              }}
                              className="w-20 p-1 text-xs text-right bg-blue-50 border border-blue-200 rounded"
                              title={`${ETICHETTA_RIGA[riga]} — ${a.anno}: risultato ${fmt(valorePiano(riga, a))}${ip?.motivazione ? `\nAI: ${ip.motivazione}` : ''}`}
                            />
                            {!RIGHE_FLUSSO.has(riga) && (
                              <button
                                type="button"
                                onClick={() =>
                                  setCella(riga, i, {
                                    tipo: ip?.tipo === 'abs' ? 'pct' : 'abs',
                                    valore: ip?.tipo === 'abs' ? 0 : valorePiano(riga, a),
                                  })
                                }
                                className="text-[9px] font-bold text-slate-500 w-5"
                                title="Alterna % sull’anno prima / valore assoluto"
                              >
                                {ip?.tipo === 'abs' ? '€' : '%'}
                              </button>
                            )}
                            {RIGHE_FLUSSO.has(riga) && riga !== 'aliquotaImposte' && (
                              <span className="text-[9px] text-slate-400 w-5">€</span>
                            )}
                            {riga === 'aliquotaImposte' && (
                              <span className="text-[9px] text-slate-400 w-5">%</span>
                            )}
                          </div>
                          {ip?.tipo === 'pct' && (
                            <span className="block text-[9px] text-slate-400 tabular-nums">
                              = {fmt(valorePiano(riga, a))}
                            </span>
                          )}
                          {ip?.motivazione && (
                            <span
                              className="block text-[9px] text-violet-700 text-left max-w-36 leading-tight mt-0.5"
                              title={ip.motivazione}
                            >
                              AI:{' '}
                              {ip.motivazione.length > 70
                                ? `${ip.motivazione.slice(0, 70)}…`
                                : ip.motivazione}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {RIGHE_DERIVATE.map((d) => (
                  <tr key={String(d.chiave)} className={d.forte ? 'bg-slate-50 font-bold' : ''}>
                    <td
                      className={`px-2 py-1.5 text-slate-900 sticky left-0 ${d.forte ? 'bg-slate-50' : 'bg-white'}`}
                    >
                      {d.etichetta}
                    </td>
                    {storico.map((s) => (
                      <td
                        key={s.anno}
                        className="px-2 py-1.5 text-right text-slate-700 tabular-nums"
                      >
                        {fmt(d.storico(s))}
                      </td>
                    ))}
                    {anniPiano.map((a) => {
                      const v = a[d.chiave] as number;
                      return (
                        <td
                          key={a.anno}
                          className={`px-2 py-1.5 text-right tabular-nums ${v < 0 && ['utile', 'disponibilitaLiquide', 'patrimonioNetto', 'flussoNetto'].includes(String(d.chiave)) ? 'text-red-700' : 'text-slate-900'}`}
                        >
                          {fmt(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-blue-50">
                  <td className="px-2 py-1.5 text-slate-900 sticky left-0 bg-blue-50 font-bold">
                    Copertura delle rate (flusso di gestione / rate e rimborsi)
                  </td>
                  {storico.map((s) => (
                    <td key={s.anno} className="px-2 py-1.5 text-right text-slate-400">
                      —
                    </td>
                  ))}
                  {anniPiano.map((a) => (
                    <td
                      key={a.anno}
                      className={`px-2 py-1.5 text-right font-bold tabular-nums ${a.coperturaRate !== null && a.coperturaRate < 1 ? 'text-red-700' : 'text-emerald-700'}`}
                    >
                      {a.coperturaRate === null ? '—' : `${a.coperturaRate.toFixed(2)}×`}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </details>
        <p className="text-[10px] text-slate-500">
          Partenza: {dati.partenza.etichetta}.{' '}
          {anniRientro && pianoRientro
            ? `Rate del piano di rientro: debito di ${euro(debitoDaRestituire)} in ${anniRientro} ${anniRientro === 1 ? 'anno' : 'anni'} — ente ${euro(rate.ente.slice(0, orizzonte).reduce((x, y) => x + y, 0))}.`
            : dati.rateDaDebito
              ? `Rate calcolate sul debito accertato (la proposta non ne porta): ente ${euro(rate.ente.slice(0, orizzonte).reduce((x, y) => x + y, 0))} in ${orizzonte} anni.`
              : `Rate dalla proposta: ente ${euro(dati.rate.ente.slice(0, orizzonte).reduce((x, y) => x + y, 0))}, altri creditori ${euro(dati.rate.altri.slice(0, orizzonte).reduce((x, y) => x + y, 0))}.`}
        </p>
      </div>

      {esito && (
        <div
          className={`border rounded-xl p-4 space-y-2 ${esito.vincoli.length ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}
        >
          <p className="text-xs font-bold text-slate-900">Esito del piano</p>
          <pre className="whitespace-pre-wrap text-xs text-slate-800 font-sans">
            {esito.sintesi}
          </pre>
          {/* LE LEVE CON CUI LA VARIANTE È NATA (0.256.19): accanto alla sintesi,
              perché sono il presupposto di quel piano e non un'impostazione a
              sé. Si leggono quelle salvate, non quelle che il pannello mostra
              mentre si cambiano. */}
          {dati.leve &&
            (() => {
              const accese = leveAccese(dati.leve);
              return (
                <div className="border-t border-slate-300/60 pt-2 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Le leve con cui è stata prodotta la variante «{variante}»
                  </p>
                  {accese.length === 0 ? (
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Nessuna leva accesa: il piano non prevede tagli del personale, investimenti in
                      tecnologia, diversificazioni né cambio di target.
                    </p>
                  ) : (
                    <ul className="space-y-0.5">
                      {accese.map((a) => (
                        <li key={a.id} className="text-[11px] text-slate-800 leading-relaxed">
                          <span className="font-semibold">{a.domanda}</span>: sì, {a.pct}% (
                          {a.misura}).
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}
          {esito.vincoli.length > 0 && (
            <ul className="space-y-1">
              {esito.vincoli.map((v, i) => (
                <li key={i} className="text-[11px] text-amber-900 flex gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{v.testo}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {avvisoAi && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
          {avvisoAi}
        </p>
      )}

      {tipoProposta !== 'RICEVUTA' && confronto}

      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
        <label className="block text-[9px] font-bold text-slate-400 uppercase">
          Note sulle ipotesi (chi legge deve capire da dove vengono)
        </label>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setModificato(true);
          }}
          className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={salva}
            disabled={!modificato || dati.progetto}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
            title={
              dati.progetto
                ? 'Questa variante è il progetto del piano: è definitiva. Per cambiarla crea una nuova variante da questa e fanne il progetto.'
                : 'Salva le ipotesi, le leve e il lancio in questa variante'
            }
          >
            <Save className="w-3.5 h-3.5" /> Salva la variante «{variante}»
          </button>
          <button
            type="button"
            onClick={stampa}
            className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-300 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
          >
            <Printer className="w-3.5 h-3.5" /> Stampa il piano
          </button>
          {dati.salvatoIl && !modificato && (
            <span className="text-[11px] text-slate-500">
              Salvato il {new Date(dati.salvatoIl).toLocaleString('it-IT')}.
            </span>
          )}
          {modificato && <span className="text-[11px] text-amber-700">Modifiche non salvate.</span>}
        </div>
      </div>
    </div>
  );
}
