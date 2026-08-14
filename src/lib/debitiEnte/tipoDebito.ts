// src/lib/debitiEnte/tipoDebito.ts
//
// Classificazione dei debiti dichiarati dall'ente nella fase ricettiva
// (Posizione Debitoria dell'Ente, "step 0" del cammino) — analoga al
// rango legale della Proposta, ma è la classificazione che l'ente stesso
// usa per la propria contabilità, non una famiglia della liquidazione
// giudiziale.

export type TipoDebitoEnte = 'CLE' | 'CEN' | 'CEC' | 'CEA';

export const TIPI_DEBITO_ENTE: {
  valore: TipoDebitoEnte;
  etichetta: string;
  descrizione: string;
}[] = [
  {
    valore: 'CLE',
    etichetta: 'CLE',
    descrizione: 'Certo, Liquido, Esigibile',
  },
  {
    valore: 'CEN',
    etichetta: 'CEN',
    descrizione: 'Certo, Emesso, Notificato',
  },
  {
    valore: 'CEC',
    etichetta: 'CEC',
    descrizione: 'Certo, Esigibile, Contenzioso',
  },
  {
    valore: 'CEA',
    etichetta: 'CEA',
    descrizione: 'Certo, Esigibile, Agente della Riscossione',
  },
];

/** Mappa codice fisso -> etichetta personalizzata per questo spazio. Se un codice manca dalla mappa (o la mappa non è fornita), si usa l'etichetta di default statica — mai un buco visibile. */
export type EtichetteTipoDebitoPersonalizzate = Partial<Record<TipoDebitoEnte, string>>;

export function etichettaTipoDebito(
  tipo: TipoDebitoEnte | null | undefined,
  etichettePersonalizzate?: EtichetteTipoDebitoPersonalizzate
): string {
  if (!tipo) return 'Non classificato';
  const trovato = TIPI_DEBITO_ENTE.find((t) => t.valore === tipo);
  if (!trovato) return tipo;
  const etichetta = etichettePersonalizzate?.[tipo] || trovato.etichetta;
  return `${etichetta} — ${trovato.descrizione}`;
}

export interface RigaDebitoEnteConTipo {
  voce: string;
  importo: number;
  /** Opzionale — solo la Posizione Debitoria dell'Ente lo usa, la Proposta no. undefined si comporta come nessuna distinzione: il saldo coincide con l'importo. */
  importoVersato?: number | null;
  tipo: TipoDebitoEnte;
}

export interface RiepilogoTipoDebito {
  tipo: TipoDebitoEnte;
  etichetta: string;
  numeroRighe: number;
  totale: number;
  /** Somma dei saldi (importo - versato) — coincide con totale quando nessuna riga ha importoVersato. */
  totaleSaldo: number;
}

/** Somma per tipo (CLE/CEN/CEC/CEA) — il totale richiesto in fondo alle righe. */
export function raggruppaPerTipoDebito(
  righe: RigaDebitoEnteConTipo[],
  etichettePersonalizzate?: EtichetteTipoDebitoPersonalizzate
): RiepilogoTipoDebito[] {
  const mappa = new Map<TipoDebitoEnte, RiepilogoTipoDebito>();
  for (const t of TIPI_DEBITO_ENTE) {
    mappa.set(t.valore, {
      tipo: t.valore,
      etichetta: etichettePersonalizzate?.[t.valore] || t.etichetta,
      numeroRighe: 0,
      totale: 0,
      totaleSaldo: 0,
    });
  }
  for (const r of righe) {
    const voce = mappa.get(r.tipo);
    if (voce) {
      voce.numeroRighe += 1;
      voce.totale += r.importo;
      voce.totaleSaldo += r.importo - (r.importoVersato ?? 0);
    }
  }
  return Array.from(mappa.values());
}

/** Il numero da confrontare con una proposta non è mai il debito lordo se
 * il file distingue quanto pagato — quando importoVersato è presente,
 * il saldo è la differenza; altrimenti coincide con l'importo. */
export function saldoRigaDebitoEnte(r: { importo: number; importoVersato: number | null }): number {
  return r.importoVersato === null ? r.importo : r.importo - r.importoVersato;
}
