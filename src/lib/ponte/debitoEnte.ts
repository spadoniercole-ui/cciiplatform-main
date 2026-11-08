// src/lib/ponte/debitoEnte.ts
//
// LO SNAPSHOT DEL DEBITO VERSO L'ENTE — tre stati separati, mai fusi.
//
// Una posizione della certificazione dei debiti è in uno di tre stati, e i tre
// non valgono lo stesso:
//   - CONTABILIZZATA: il debito è iscritto, la cifra è certa;
//   - DA CONTABILIZZARE: il debito è certo ma l'ente non l'ha ancora iscritto;
//   - SEGNALATA ALLE UNITÀ OPERATIVE: la posizione esiste, l'importo non è
//     ancora determinato (o non è ancora stato affidato). Si dà per certo che
//     lo diventerà, ma allo stato dell'analisi non lo è.
//
// Il Ponte usa le prime due: sommare anche la terza farebbe entrare nella base
// contabile un debito che non è ancora un debito iscritto. La terza si mostra,
// non si contabilizza.
//
// SECONDA REGOLA: una cifra a zero non è una cifra assente. La certificazione
// dei debiti porta l'importo in colonne diverse (importo, contributi, sanzioni,
// totale); una riga che valorizza soltanto la composizione non vale zero, e
// leggerla come zero azzerava il debito ente di un'azienda con posizioni
// aperte. Qui l'importo si prende dal primo campo che lo contiene davvero.

import { denunceDuplicateVera, insiemeEsclusi } from '@/lib/debitiEnte/duplicatiVera';
import type { RigaVera } from '@/lib/debitiEnte/veraImport';

export interface SnapshotDebitoEnte {
  /** Contabilizzato + da contabilizzare: il debito certo che il Ponte usa. */
  totale: number;
  contabilizzato: number;
  daContabilizzare: number;
  /**
   * Posizioni segnalate alle unità operative: importo noto o ignoto, ma non
   * ancora contabilizzato. È dichiarato e resta fuori dal totale.
   */
  segnalato: number;
  contributi: number;
  sanzioni: number;
  creditiAgente: number;
  /** Posizioni che formano il totale (contabilizzate + da contabilizzare). */
  righe: number;
  /** Posizioni segnalate, non comprese in `righe`. */
  righeSegnalate: number;
  fonte: string;
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;

/**
 * L'importo della riga, preso dal campo che il file ha davvero valorizzato.
 * L'ordine non è arbitrario: l'importo esplicito vince; se è zero, la
 * composizione (contributi + sanzioni) è comunque una cifra dichiarata.
 */
export function importoRigaVera(r: Pick<RigaVera, 'importo' | 'contributi' | 'sanzioni'>): number {
  const importo = typeof r.importo === 'number' && Number.isFinite(r.importo) ? r.importo : 0;
  if (Math.abs(importo) > 0.005) return importo;
  const contributi =
    typeof r.contributi === 'number' && Number.isFinite(r.contributi) ? r.contributi : 0;
  const sanzioni = typeof r.sanzioni === 'number' && Number.isFinite(r.sanzioni) ? r.sanzioni : 0;
  return contributi + sanzioni;
}

export function snapshotDebitoEnte(righe: RigaVera[]): SnapshotDebitoEnte {
  const doppie = insiemeEsclusi(denunceDuplicateVera(righe));
  const out: SnapshotDebitoEnte = {
    totale: 0,
    contabilizzato: 0,
    daContabilizzare: 0,
    segnalato: 0,
    contributi: 0,
    sanzioni: 0,
    creditiAgente: 0,
    righe: 0,
    righeSegnalate: 0,
    fonte: 'certificazione dei debiti',
  };

  righe.forEach((r, i) => {
    if (doppie.has(i)) return;
    // Ignorate e sospese restano fuori da ogni somma: la prima non è un
    // debito, la seconda non è esigibile.
    if (r.trattamento === 'ignora' || r.trattamento === 'sospeso') return;

    const importo = importoRigaVera(r);

    if (r.trattamento === 'potenziale') {
      out.righeSegnalate += 1;
      out.segnalato += importo;
      return;
    }

    if (r.ambito === 'AGENTE_RISCOSSIONE') {
      out.creditiAgente += importo;
    } else {
      const sanzioni = r.sanzioni ?? 0;
      // Senza riparto esplicito resta l'importo della riga: è il massimo che
      // il file dichiari, e non si inventa una quota.
      const contributi = r.contributi ?? Math.max(0, importo - sanzioni);
      out.contributi += contributi;
      out.sanzioni += sanzioni;
    }

    out.righe += 1;
    if (r.trattamento === 'contabilizzato') out.contabilizzato += importo;
    else out.daContabilizzare += importo;
  });

  out.totale = arrotonda(out.contabilizzato + out.daContabilizzare);
  out.contabilizzato = arrotonda(out.contabilizzato);
  out.daContabilizzare = arrotonda(out.daContabilizzare);
  out.segnalato = arrotonda(out.segnalato);
  out.contributi = arrotonda(out.contributi);
  out.sanzioni = arrotonda(out.sanzioni);
  out.creditiAgente = arrotonda(out.creditiAgente);
  return out;
}
