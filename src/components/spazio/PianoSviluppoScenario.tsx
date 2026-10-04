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
} from 'lucide-react';
import {
  commentaSoluzionePianoAction,
  eliminaVariantePianoAction,
  elaboraPianoConAiAction,
  ottieniPianoSviluppoAction,
  salvaPianoSviluppoAction,
  type DatiPianoSviluppo,
} from '@/app/actions/pianoSviluppo';
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
} from '@/lib/piano/piano';
import { confermaApp } from '@/components/FinestreApp';
import { stampaHtml } from '@/lib/stampaTesto';
import {
  ConfrontoPianoAziendale,
  type ContestoConfronto,
} from '@/components/spazio/ConfrontoPianoAziendale';
import { VARIANTE_AI } from '@/lib/piano/elaborazioneAi';
import {
  applicaManopola,
  definizioniManopole,
  letturaManopola,
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

const GRUPPI: DefinizioneManopola['gruppo'][] = ['Ricavi', 'Costi', 'Circolante', 'Finanza'];

/** Allunga le ipotesi quando cresce l'orizzonte: l'ultimo valore di ogni riga prosegue. */
function estendiIpotesi(ip: IpotesiPiano, orizzonte: number): IpotesiPiano {
  const out: IpotesiPiano = {};
  for (const [r, arr] of Object.entries(ip) as [RigaInput, (Ipotesi | null)[]][]) {
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
  const [aiInCorso, setAiInCorso] = useState(false);
  const [avvisoAi, setAvvisoAi] = useState<string | null>(null);
  // Ricevente, ordine dei fattori (0.129): variante di sistema, piano di
  // rientro, soluzione verde.
  const [serieSistema, setSerieSistema] = useState(false);
  const [pianoRientro, setPianoRientro] = useState<PianoRientro | null>(null);
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
    setSoluzione(r.dati.soluzione);
    setModificato(false);
  };
  useEffect(() => {
    carica('base');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId, aziendaId]);

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

  // Rate: dal piano di rientro scelto con le domande, altrimenti dalla proposta.
  const rate = useMemo(() => {
    if (!dati) return { ente: [], altri: [] };
    if (pianoRientro) return rateDaPianoRientro(dati.offerto, pianoRientro, orizzonte);
    return { ente: dati.rate.ente.slice(0, orizzonte), altri: dati.rate.altri.slice(0, orizzonte) };
  }, [dati, pianoRientro, orizzonte]);

  const esito = useMemo(() => {
    if (!dati || dati.storico.length === 0) return null;
    return calcolaPiano(dati.storico[0], orizzonte, ipotesiEffettive, rate, dati.capitaleSociale);
  }, [dati, ipotesiEffettive, orizzonte, rate]);

  // Riferimento di settore e variante di sistema: le stesse rettifiche delle
  // manopole valgono per le righe del piano dell'azienda anche qui.
  const sistema = useMemo(() => {
    if (!dati || dati.storico.length === 0 || !ipAzienda || !contestoConfronto) return null;
    const base = dati.storico[0];
    const auto = ipotesiAutomatiche(base, orizzonte, tassoSettore);
    const riferimento = calcolaPiano(base, orizzonte, auto, rate, dati.capitaleSociale);
    const ipSis = ipotesiAssoluteDa(riferimento.anni, [...righeAzienda]);
    const rettificato = calcolaPiano(
      base,
      orizzonte,
      applicaRettifiche(ipSis, rettifiche, auto),
      rate,
      dati.capitaleSociale
    );
    return { riferimento, rettificato };
  }, [dati, ipAzienda, contestoConfronto, orizzonte, tassoSettore, rate, righeAzienda, rettifiche]);

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
  const statoGlobale: 'ok' | 'attenzione' | 'critico' = !esito
    ? 'ok'
    : esito.vincoli.some((v) => v.codice === 'CASSA_NEGATIVA' || v.codice === 'RATE_NON_COPERTE')
      ? 'critico'
      : esito.vincoli.length
        ? 'attenzione'
        : 'ok';

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
      modoRettifica ? { pianoRientro, serieSistema, soluzione } : {}
    );
    if (!r.success) return setErrore(r.error ?? 'Errore.');
    await carica(variante);
  };

  const elaboraConAi = async () => {
    if (!dati || !esito || !contestoConfronto) return;
    if (
      dati.varianti.includes(VARIANTE_AI) &&
      !(await confermaApp(
        'Esiste già la variante «elaborazione-ai»: una nuova elaborazione la sostituisce. Le altre varianti restano come sono.',
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
        crescita: contestoConfronto.crescita,
        rate: {
          ente: dati.rate.ente.slice(0, orizzonte),
          altri: dati.rate.altri.slice(0, orizzonte),
        },
        pianoAzienda: contestoConfronto.pianoAzienda,
        scostamenti: contestoConfronto.scostamenti,
        ipotesiCorrenti: ipotesi,
        vincoli: esito.vincoli.map((v) => v.testo),
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

  /** Passo 4: il motore cerca la combinazione verde, l'AI ne scrive la lettura. */
  const calcolaSoluzione = async () => {
    if (!dati || !ipAzienda || !sistema) return;
    setSoluzioneInCorso(true);
    setErrore(null);
    try {
      const base = dati.storico[0];
      // Si parte sempre dal piano dell'azienda: manopole a zero, nessun apporto aggiunto.
      const ipOrdinarie: IpotesiPiano = { ...ipotesi };
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
        rate,
        capitaleSociale: dati.capitaleSociale,
      };
      const sol = cercaSoluzioneVerde(ing);
      const pianoAz = calcolaPiano(
        base,
        orizzonte,
        applicaRettifiche(ipAzienda, {}, ipOrdinarie),
        rate,
        dati.capitaleSociale
      );
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
      nomeVariante={variante}
      onContesto={setContestoConfronto}
      senzaCopia={tipoProposta === 'RICEVUTA'}
      rateScelte={tipoProposta === 'RICEVUTA' && pianoRientro ? rate : null}
    />
  );

  return (
    <div className="space-y-4">
      {tipoProposta === 'RICEVUTA' && confronto}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-start gap-2 flex-wrap">
          <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
              Piano di sviluppo
            </h2>
            {modoRettifica ? (
              <p className="text-[11px] text-slate-600 mt-0.5">
                <strong>1 · Piano dell’azienda.</strong> Le manopole partono dal piano presentato
                dall’azienda, proiettato dallo stato attuale (
                <strong>{dati.partenza.etichetta}</strong>); la fascia «azienda» sotto ogni manopola
                dice quanto quella voce si discosta dal riferimento di settore. Ogni manopola
                rettifica la voce in percentuale, uguale per tutti gli anni. Poi, nei passi 2–4
                sotto la tabella: variante di sistema, piano di rientro, soluzione verde.
              </p>
            ) : tipoProposta === 'RICEVUTA' ? (
              <p className="text-[11px] text-amber-800 mt-0.5">
                Il piano dell’azienda non è ancora caricato: caricalo nel riquadro qui sopra e le
                manopole partiranno da quello. Intanto lavorano sullo stato attuale —{' '}
                <strong>{dati.partenza.etichetta}</strong>.
              </p>
            ) : (
              <p className="text-[11px] text-slate-600 mt-0.5">
                Si parte dallo stato attuale — <strong>{dati.partenza.etichetta}</strong> — e si
                proietta in avanti. Gira le manopole: ogni manopola vale per tutti gli anni del
                piano e il risultato si ricalcola subito. Per ritoccare un solo anno apri la tabella
                anno per anno. Il personale è dentro i costi operativi; le rate del piano di rientro
                vengono dalla proposta.
              </p>
            )}
          </div>
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
                  modoRettifica ? { pianoRientro, serieSistema, soluzione } : {}
                );
                if (!r.success) return setErrore(r.error ?? 'Errore.');
                await carica(n);
              }}
              className="flex items-center gap-1 px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
              title="Copia le ipotesi correnti in una nuova variante"
            >
              <Plus className="w-3 h-3" /> Nuova variante da questa
            </button>
            {!modoRettifica && (
              <button
                type="button"
                onClick={elaboraConAi}
                disabled={aiInCorso || !contestoConfronto || !esito}
                className="flex items-center gap-1 px-2 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
                title={
                  modoRettifica
                    ? 'L’AI rettifica le righe del piano dell’azienda dove è più ottimista del riferimento, con la motivazione; il calcolo resta al motore. Salvata come variante «elaborazione-ai».'
                    : 'L’AI imposta le manopole, una per riga, con la motivazione; il calcolo resta al motore. Salvata come variante «elaborazione-ai».'
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
                    : 'L’AI imposta le manopole'}
              </button>
            )}
            {variante !== 'base' && (
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
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'anno' : 'anni'}
                  </option>
                ))}
            </select>
          </div>
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
                              stato={statoGlobale}
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
                            stato={statoGlobale}
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

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[9px] uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-2 text-left font-bold">Risultato</th>
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
                      ['Ricavi', base.ricaviVendite, (a) => a.ricaviVendite],
                      [
                        'EBITDA',
                        base.valoreProduzione - base.costiProduzione + base.ammortamenti,
                        (a) => a.ebitda,
                      ],
                      ['Risultato d’esercizio', base.utileEsercizio, (a) => a.utile],
                      ['Flusso di gestione', null, (a) => a.flussoGestione],
                      ['Rate del piano di rientro', null, (a) => a.rateEnte + a.rateAltri],
                      [
                        'Cassa a fine anno',
                        base.disponibilitaLiquide,
                        (a) => a.disponibilitaLiquide,
                      ],
                      ['Patrimonio netto', base.patrimonioNetto, (a) => a.patrimonioNetto],
                    ] as [string, number | null, (a: (typeof anniPiano)[number]) => number][]
                  ).map(([et, b, f]) => (
                    <React.Fragment key={et}>
                      <tr>
                        <td className="px-2 py-1.5 text-slate-800">{et}</td>
                        <td className="px-2 py-1.5 text-right text-slate-500 tabular-nums">
                          {fmt(b)}
                        </td>
                        {anniPiano.map((a) => {
                          const v = f(a);
                          return (
                            <td
                              key={a.anno}
                              className={`px-2 py-1.5 text-right tabular-nums font-medium ${v < 0 && et !== 'Rate del piano di rientro' ? 'text-red-700' : 'text-slate-900'}`}
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
                                className={`px-2 py-1 text-right tabular-nums text-[11px] ${v < 0 && et !== 'Rate del piano di rientro' ? 'text-red-600' : 'text-sky-900'}`}
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
          </div>
        )}

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
          Partenza: {dati.partenza.etichetta}. Rate dalla proposta: ente{' '}
          {euro(dati.rate.ente.slice(0, orizzonte).reduce((x, y) => x + y, 0))}, altri creditori{' '}
          {euro(dati.rate.altri.slice(0, orizzonte).reduce((x, y) => x + y, 0))}.
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
            disabled={!modificato}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
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
