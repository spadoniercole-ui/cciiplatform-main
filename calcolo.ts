'use server';

// Indici multi-periodo: gli indici abilitati per l'azienda, sviluppati su
// più punti — fino agli ultimi N anni di bilancio XBRL archiviati (N è un
// parametro PER-SPAZIO con default di sistema — vedi parametriPeriodi.ts —
// oltre diventa illeggibile a video) più la Posizione Aggiornata — con il
// trend tra un periodo e l'altro. Non introduce un nuovo motore di
// calcolo: riusa costruisciBundleIndici (src/lib/xbrl/indici.ts) per
// calcolare ogni punto con le stesse formule già in uso, e calcolaTrend
// (src/lib/xbrl/trend.ts, già generalizzata a N punti) per il confronto.
// Il trend non viene salvato: è interamente derivabile dai punti già
// persistiti, ricalcolarlo è a costo quasi zero e non rischia di
// disallinearsi se uno dei punti viene corretto.

import { costruisciBundleIndici } from '@/lib/xbrl/indici';
import { calcolaTrend, type PuntoStorico, type RisultatoTrend } from '@/lib/xbrl/trend';
import { ottieniStoricoXbrlAzienda } from '@/app/actions/xbrlAzienda';
import { ottienePosizioneAggiornata } from '@/app/actions/posizioneAggiornata';
import { ottieniIndiciAzienda } from '@/app/actions/aziendaConfig';
import { ottieniScenarioPerId } from '@/app/actions/scenari';
import { ottieniAnniStoricoMax } from '@/app/actions/parametriSpazio';
import type { IndiceCcii, AlertSeverity } from '@/lib/xbrl/types';

export interface PuntoIndiciMultiPeriodo {
  chiave: 'storico' | 'aggiornata';
  etichetta: string;
  anno: number | null;
  indici: IndiceCcii[];
  altriIndici: IndiceCcii[];
  severity: AlertSeverity;
  pfn: number;
}

export interface IndiceAbilitatoInfo {
  codice: string;
  nome: string;
  categoria: string;
}

export interface RisultatoIndiciMultiPeriodo {
  success: boolean;
  indiciAbilitati: IndiceAbilitatoInfo[];
  punti: PuntoIndiciMultiPeriodo[];
  trend: RisultatoTrend | null;
  error?: string;
}

export async function ottieniIndiciMultiPeriodo(
  nomeSchema: string,
  scenarioId: number
): Promise<RisultatoIndiciMultiPeriodo> {
  const vuoto = { success: false as const, indiciAbilitati: [], punti: [], trend: null };
  try {
    const scenarioRis = await ottieniScenarioPerId(nomeSchema, scenarioId);
    if (!scenarioRis.success || !scenarioRis.scenario) {
      return { ...vuoto, error: scenarioRis.error || 'Scenario non trovato.' };
    }
    const aziendaId = scenarioRis.scenario.aziendaId;

    const [indiciRis, storicoRis, posizioneRis, anniRis] = await Promise.all([
      ottieniIndiciAzienda(nomeSchema, aziendaId),
      ottieniStoricoXbrlAzienda(nomeSchema, aziendaId),
      ottienePosizioneAggiornata(nomeSchema, scenarioId),
      ottieniAnniStoricoMax(nomeSchema),
    ]);
    const maxAnniStorico = anniRis.anni;

    if (!indiciRis.success) {
      return { ...vuoto, error: indiciRis.error || 'Impossibile caricare gli indici abilitati.' };
    }
    const indiciAbilitati = indiciRis.indici
      .filter((i) => i.abilitato)
      .map((i) => ({ codice: i.codice, nome: i.nome, categoria: i.categoria }));

    const punti: PuntoIndiciMultiPeriodo[] = [];

    if (storicoRis.success && storicoRis.storico.length > 0) {
      const ordinato = [...storicoRis.storico].sort(
        (a, b) => (a.annoBilancio ?? 0) - (b.annoBilancio ?? 0)
      );
      // Ultimi N anni archiviati (N = parametro di spazio), cronologici.
      const ultimiAnni = ordinato.slice(-maxAnniStorico);
      ultimiAnni.forEach((anno, i) => {
        punti.push({
          chiave: 'storico',
          // Etichetta univoca (serve come chiave di riga a video): l'anno
          // quando c'è, altrimenti un progressivo di posizione.
          etichetta: anno.annoBilancio ? `Anno ${anno.annoBilancio}` : `Periodo ${i + 1}`,
          anno: anno.annoBilancio,
          indici: anno.indici,
          altriIndici: anno.altriIndici,
          severity: anno.severity,
          pfn: anno.situazioneDebitoria.pfn,
        });
      });
    }

    if (posizioneRis.success && posizioneRis.esiste) {
      const bundle = costruisciBundleIndici(posizioneRis.posizione.dati);
      punti.push({
        chiave: 'aggiornata',
        etichetta: 'Posizione Aggiornata',
        anno: null,
        indici: bundle.indici,
        altriIndici: bundle.altriIndici,
        severity: bundle.severity,
        pfn: bundle.situazioneDebitoria.pfn,
      });
    }

    let trend: RisultatoTrend | null = null;
    if (punti.length >= 2) {
      const aPuntoStorico = (p: PuntoIndiciMultiPeriodo): PuntoStorico => ({
        anno: p.anno,
        indici: p.indici,
        severity: p.severity,
        situazioneDebitoria: {
          debitiBanche: 0,
          debitiFornitori: 0,
          debitiTributari: 0,
          debitiPrevidenziali: 0,
          altriDebiti: 0,
          totaleDebiti: 0,
          disponibilitaLiquide: 0,
          pfn: p.pfn,
        },
      });
      const storicoPerTrend = punti.slice(0, -1).map(aPuntoStorico);
      const correntePerTrend = aPuntoStorico(punti[punti.length - 1]);
      trend = calcolaTrend(storicoPerTrend, correntePerTrend);
    }

    return { success: true, indiciAbilitati, punti, trend };
  } catch (error: any) {
    console.error('[ottieniIndiciMultiPeriodo] Errore:', error);
    return {
      ...vuoto,
      error: `Impossibile calcolare gli indici multi-periodo: ${error.message || error}`,
    };
  }
}
