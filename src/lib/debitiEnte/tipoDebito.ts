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

/**
 * Mappa codice -> etichetta personalizzata per questo spazio. Il codice è
 * ora libero (categorie parametriche: DEBITO/AVA/NEUTRO e simili), non più
 * solo i quattro legacy. Se un codice manca dalla mappa si prova il fallback
 * statico (CLE/CEN/CEC/CEA) e infine il codice grezzo — mai un buco visibile,
 * così i dati inseriti prima delle categorie parametriche restano leggibili.
 */
export type EtichetteTipoDebitoPersonalizzate = Record<string, string>;

export function etichettaTipoDebito(
  tipo: string | null | undefined,
  etichettePersonalizzate?: EtichetteTipoDebitoPersonalizzate
): string {
  if (!tipo) return 'Non classificato';
  // 1) etichetta parametrica di spazio (se fornita)
  const custom = etichettePersonalizzate?.[tipo];
  if (custom) return custom;
  // 2) fallback statico ai quattro legacy
  const trovato = TIPI_DEBITO_ENTE.find((t) => t.valore === tipo);
  if (trovato) return `${trovato.etichetta} — ${trovato.descrizione}`;
  // 3) codice grezzo
  return tipo;
}

export interface RigaDebitoEnteConTipo {
  voce: string;
  importo: number;
  /** Opzionale — solo la Posizione Debitoria dell'Ente lo usa, la Proposta no. undefined si comporta come nessuna distinzione: il saldo coincide con l'importo. */
  importoVersato?: number | null;
  /** Codice categoria (parametrico) — es. DEBITO/AVA/NEUTRO o un legacy CLE/CEN/CEC/CEA. */
  tipo: string;
}

export interface RiepilogoTipoDebito {
  tipo: string;
  etichetta: string;
  numeroRighe: number;
  totale: number;
  /** Somma dei saldi (importo - versato) — coincide con totale quando nessuna riga ha importoVersato. */
  totaleSaldo: number;
}

/**
 * Somma per categoria. Raggruppa DINAMICAMENTE sui codici effettivamente
 * presenti nelle righe (non più i quattro fissi), così funziona sia coi
 * codici legacy sia con le categorie parametriche. `ordineCodici` (opzionale)
 * impone l'ordine di uscita; i codici non elencati seguono in ordine di
 * comparsa. `etichettePersonalizzate` risolve le etichette.
 */
export function raggruppaPerTipoDebito(
  righe: RigaDebitoEnteConTipo[],
  etichettePersonalizzate?: EtichetteTipoDebitoPersonalizzate,
  ordineCodici?: string[]
): RiepilogoTipoDebito[] {
  const mappa = new Map<string, RiepilogoTipoDebito>();
  const assicura = (codice: string) => {
    let v = mappa.get(codice);
    if (!v) {
      v = {
        tipo: codice,
        etichetta: etichettaTipoDebito(codice, etichettePersonalizzate),
        numeroRighe: 0,
        totale: 0,
        totaleSaldo: 0,
      };
      mappa.set(codice, v);
    }
    return v;
  };
  // Pre-semina nell'ordine richiesto (le categorie con 0 righe compaiono solo se elencate).
  for (const c of ordineCodici ?? []) assicura(c);
  for (const r of righe) {
    const v = assicura(r.tipo);
    v.numeroRighe += 1;
    v.totale += r.importo;
    v.totaleSaldo += r.importo - (r.importoVersato ?? 0);
  }
  return Array.from(mappa.values());
}

/** Il numero da confrontare con una proposta non è mai il debito lordo se
 * il file distingue quanto pagato — quando importoVersato è presente,
 * il saldo è la differenza; altrimenti coincide con l'importo. */
export function saldoRigaDebitoEnte(r: { importo: number; importoVersato: number | null }): number {
  return r.importoVersato === null ? r.importo : r.importo - r.importoVersato;
}
