'use server';

// Gestione Aziende all'interno di uno spazio. Ogni azienda vive nello
// schema isolato del proprio spazio (tenant_xxx) — coerente con
// admin_workspace. Livello su cui, in futuro, si aggancerà l'entità
// "Scenario" (un'azienda può avere N scenari nel tempo, ognuno un ciclo di
// analisi completo: check list, indici, XBRL, proposta cram down) —
// confermato ancora valido, non ancora costruito.
//
// I campi anagrafici estesi (sede legale, capitale sociale,
// rappresentante legale, REA, PEC) servono alla reportistica: intestazioni
// di lettere e relazioni li richiedono per esteso — vedi i documenti reali
// di riferimento (convocazione INPS/INAIL e piano di risanamento).

import { leggiIdentificativiEntePerAziende } from '@/lib/anagraficaEnte/identificativi';
import { assicuraTabellaAziende } from '@/db/provision';
import { richiediAccessoAzienda, richiediAccessoSchema } from '@/lib/autorizzazione';

export interface Azienda {
  id: number;
  ragioneSociale: string;
  codiceFiscale: string | null;
  partitaIva: string | null;
  /** Identificativi presso l'ente (solo negli elenchi; vuoto se non salvati). */
  identificativiEnte?: { etichetta: string; valore: string }[];
  codiceAteco: string | null;
  logoUrl: string | null;
  attiva: boolean;
  indirizzoSedeLegale: string | null;
  citta: string | null;
  provincia: string | null;
  cap: string | null;
  formaGiuridica: string | null;
  capitaleSociale: number | null;
  rappresentanteLegale: string | null;
  ruoloRappresentanteLegale: string | null;
  numeroRea: string | null;
  pec: string | null;
  numeroSediSecondarie: number;
  annoCostituzione: number | null;
}

export interface RisultatoElencoAziende {
  success: boolean;
  aziende: Azienda[];
  error?: string;
}

export interface RisultatoAzienda {
  success: boolean;
  azienda?: Azienda;
  error?: string;
}

export interface RisultatoOperazioneAzienda {
  success: boolean;
  error?: string;
}

export interface DatiAzienda {
  ragioneSociale: string;
  codiceFiscale?: string;
  partitaIva?: string;
  codiceAteco?: string;
  indirizzoSedeLegale?: string;
  citta?: string;
  provincia?: string;
  cap?: string;
  formaGiuridica?: string;
  capitaleSociale?: number | null;
  rappresentanteLegale?: string;
  ruoloRappresentanteLegale?: string;
  numeroRea?: string;
  pec?: string;
  numeroSediSecondarie?: number;
  annoCostituzione?: number | null;
}

function mappaRigaAzienda(r: any): Azienda {
  return {
    id: r.id,
    ragioneSociale: r.ragioneSociale,
    codiceFiscale: r.codiceFiscale,
    partitaIva: r.partitaIva,
    codiceAteco: r.codiceAteco,
    logoUrl: r.logoUrl,
    attiva: r.attiva,
    indirizzoSedeLegale: r.indirizzoSedeLegale ?? null,
    citta: r.citta ?? null,
    provincia: r.provincia ?? null,
    cap: r.cap ?? null,
    formaGiuridica: r.formaGiuridica ?? null,
    capitaleSociale:
      r.capitaleSociale === null || r.capitaleSociale === undefined
        ? null
        : Number(r.capitaleSociale),
    rappresentanteLegale: r.rappresentanteLegale ?? null,
    ruoloRappresentanteLegale: r.ruoloRappresentanteLegale ?? null,
    numeroRea: r.numeroRea ?? null,
    pec: r.pec ?? null,
    numeroSediSecondarie: r.numeroSediSecondarie ?? 0,
    annoCostituzione: r.annoCostituzione ?? null,
  };
}

/** Valori da persistere, condivisi tra creazione e modifica. */
function valoriDaDati(dati: DatiAzienda) {
  return {
    ragioneSociale: dati.ragioneSociale.trim(),
    codiceFiscale: dati.codiceFiscale?.trim() || null,
    partitaIva: dati.partitaIva?.trim() || null,
    codiceAteco: dati.codiceAteco?.trim() || null,
    indirizzoSedeLegale: dati.indirizzoSedeLegale?.trim() || null,
    citta: dati.citta?.trim() || null,
    provincia: dati.provincia?.trim() || null,
    cap: dati.cap?.trim() || null,
    formaGiuridica: dati.formaGiuridica?.trim() || null,
    capitaleSociale:
      dati.capitaleSociale === undefined || dati.capitaleSociale === null
        ? null
        : String(dati.capitaleSociale),
    rappresentanteLegale: dati.rappresentanteLegale?.trim() || null,
    ruoloRappresentanteLegale: dati.ruoloRappresentanteLegale?.trim() || null,
    numeroRea: dati.numeroRea?.trim() || null,
    pec: dati.pec?.trim() || null,
    numeroSediSecondarie: dati.numeroSediSecondarie ?? 0,
    annoCostituzione: dati.annoCostituzione === undefined ? null : dati.annoCostituzione,
  };
}

export async function ottieniAziende(nomeSchema: string): Promise<RisultatoElencoAziende> {
  try {
    const contesto = await richiediAccessoSchema(nomeSchema);
    await assicuraTabellaAziende(nomeSchema);
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const tabelle = getTabelleTenant(nomeSchema);

    const righe = await db.select().from(tabelle.aziende);
    // Operatori: solo le aziende assegnate dall'Admin di Spazio.
    const consentite =
      contesto.modalita === 'OPERATORE'
        ? righe.filter((r) => contesto.aziendeConsentite?.includes(Number(r.id)))
        : righe;

    const mappate = consentite.map(mappaRigaAzienda);
    const ident = await leggiIdentificativiEntePerAziende(
      nomeSchema,
      mappate.map((a) => a.id)
    ).catch(() => new Map());
    return {
      success: true,
      aziende: mappate.map((a) => ({ ...a, identificativiEnte: ident.get(a.id) ?? [] })),
    };
  } catch (error: any) {
    console.error('[ottieniAziende] Errore:', error);
    return {
      success: false,
      aziende: [],
      error: `Impossibile caricare le aziende: ${error.message || error}`,
    };
  }
}

export async function ottieniAziendaPerId(
  nomeSchema: string,
  id: number
): Promise<RisultatoAzienda> {
  try {
    await richiediAccessoAzienda(nomeSchema, id);
    await assicuraTabellaAziende(nomeSchema);
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    const righe = await db
      .select()
      .from(tabelle.aziende)
      .where(eq(tabelle.aziende.id, id))
      .limit(1);
    if (righe.length === 0) {
      return { success: false, error: 'Azienda non trovata.' };
    }
    return { success: true, azienda: mappaRigaAzienda(righe[0]) };
  } catch (error: any) {
    console.error('[ottieniAziendaPerId] Errore:', error);
    return { success: false, error: `Impossibile caricare l'azienda: ${error.message || error}` };
  }
}

export async function creaAziendaAction(
  nomeSchema: string,
  dati: DatiAzienda
): Promise<RisultatoAzienda> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!(dati.ragioneSociale || '').trim()) {
      return { success: false, error: "La ragione sociale dell'azienda è obbligatoria." };
    }

    await assicuraTabellaAziende(nomeSchema);
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const tabelle = getTabelleTenant(nomeSchema);

    const inserita = await db.insert(tabelle.aziende).values(valoriDaDati(dati)).returning();

    return { success: true, azienda: mappaRigaAzienda(inserita[0]) };
  } catch (error: any) {
    console.error('[creaAziendaAction] Errore:', error);
    return { success: false, error: `Impossibile creare l'azienda: ${error.message || error}` };
  }
}

export async function modificaAziendaAction(
  nomeSchema: string,
  id: number,
  dati: DatiAzienda
): Promise<RisultatoOperazioneAzienda> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!(dati.ragioneSociale || '').trim()) {
      return { success: false, error: "La ragione sociale dell'azienda è obbligatoria." };
    }

    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    await db.update(tabelle.aziende).set(valoriDaDati(dati)).where(eq(tabelle.aziende.id, id));

    return { success: true };
  } catch (error: any) {
    console.error('[modificaAziendaAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile modificare l'azienda: ${error.message || error}`,
    };
  }
}

/** Disabilitazione soft: l'azienda resta nel database (storico, scenari futuri collegati) ma non è più operativa. */
export async function disabilitaAziendaAction(
  nomeSchema: string,
  id: number
): Promise<RisultatoOperazioneAzienda> {
  return impostaStatoAzienda(nomeSchema, id, false);
}

export async function riattivaAziendaAction(
  nomeSchema: string,
  id: number
): Promise<RisultatoOperazioneAzienda> {
  return impostaStatoAzienda(nomeSchema, id, true);
}

async function impostaStatoAzienda(
  nomeSchema: string,
  id: number,
  attiva: boolean
): Promise<RisultatoOperazioneAzienda> {
  try {
    // Unico percorso di disabilitaAziendaAction e riattivaAziendaAction.
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    await db.update(tabelle.aziende).set({ attiva }).where(eq(tabelle.aziende.id, id));
    return { success: true };
  } catch (error: any) {
    console.error('[impostaStatoAzienda] Errore:', error);
    return {
      success: false,
      error: `Impossibile aggiornare lo stato dell'azienda: ${error.message || error}`,
    };
  }
}
