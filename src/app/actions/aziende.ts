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

import { assicuraTabellaAziende } from '@/db/provision';

export interface Azienda {
  id: number;
  ragioneSociale: string;
  codiceFiscale: string | null;
  partitaIva: string | null;
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
  /** Test soglie INPS art. 25-novies. null = non dichiarato (tre stati). */
  conLavoratoriSubordinati: boolean | null;
  contributiDovutiAnnoPrecedente: number | null;
  annoContributiDovuti: number | null;
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
  conLavoratoriSubordinati?: boolean | null;
  contributiDovutiAnnoPrecedente?: number | null;
  annoContributiDovuti?: number | null;
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
    // Attenzione: `?? null` e NON `?? false`. Il terzo stato (non
    // dichiarato) deve sopravvivere fino alla griglia, che su di esso
    // dichiara l'esito non determinabile invece di applicare la soglia
    // sbagliata.
    conLavoratoriSubordinati:
      r.conLavoratoriSubordinati === null || r.conLavoratoriSubordinati === undefined
        ? null
        : Boolean(r.conLavoratoriSubordinati),
    contributiDovutiAnnoPrecedente:
      r.contributiDovutiAnnoPrecedente === null || r.contributiDovutiAnnoPrecedente === undefined
        ? null
        : Number(r.contributiDovutiAnnoPrecedente),
    annoContributiDovuti: r.annoContributiDovuti ?? null,
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
    conLavoratoriSubordinati:
      dati.conLavoratoriSubordinati === undefined ? null : dati.conLavoratoriSubordinati,
    contributiDovutiAnnoPrecedente:
      dati.contributiDovutiAnnoPrecedente === undefined ||
      dati.contributiDovutiAnnoPrecedente === null
        ? null
        : String(dati.contributiDovutiAnnoPrecedente),
    annoContributiDovuti:
      dati.annoContributiDovuti === undefined ? null : dati.annoContributiDovuti,
  };
}

export async function ottieniAziende(nomeSchema: string): Promise<RisultatoElencoAziende> {
  try {
    await assicuraTabellaAziende(nomeSchema);
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const tabelle = getTabelleTenant(nomeSchema);

    const righe = await db.select().from(tabelle.aziende);

    return {
      success: true,
      aziende: righe.map(mappaRigaAzienda),
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

/**
 * Aggiornamento mirato del solo codice ATECO — usata quando un file XBRL
 * caricato porta un codice diverso da quello in anagrafica. Il dato del
 * file (fonte CCIAA) prevale su quello inserito manualmente: un operatore
 * può aver omesso o sbagliato il campo per distrazione, il file no —
 * evita di bloccare le fasi di analisi che dipendono dall'ATECO (Dati di
 * Settore) per un'anagrafica incompleta quando il dato corretto era già
 * disponibile nel bilancio caricato.
 */
export async function aggiornaCodiceAtecoAction(
  nomeSchema: string,
  aziendaId: number,
  nuovoCodiceAteco: string
): Promise<RisultatoOperazioneAzienda> {
  try {
    const { db } = await import('@/db/client');
    const { getTabelleTenant } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const tabelle = getTabelleTenant(nomeSchema);

    await db
      .update(tabelle.aziende)
      .set({ codiceAteco: nuovoCodiceAteco })
      .where(eq(tabelle.aziende.id, aziendaId));
    return { success: true };
  } catch (error: any) {
    console.error('[aggiornaCodiceAtecoAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile aggiornare il codice ATECO: ${error.message || error}`,
    };
  }
}
