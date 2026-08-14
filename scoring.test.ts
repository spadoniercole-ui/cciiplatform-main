'use server';

import { revalidatePath } from 'next/cache';

export interface WorkspaceLicenzaInput {
  workspaceId: number;
  codiceLicenza: string;
}

export interface ParametroSistemaInput {
  chiave: string;
  valore: string;
  descrizione: string;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}

export async function attivaLicenzaWorkspaceAction(
  data: WorkspaceLicenzaInput
): Promise<ActionResult> {
  if (!data.codiceLicenza || data.codiceLicenza.trim().length < 4) {
    return {
      success: false,
      error: 'Il codice licenza deve contenere almeno 4 caratteri validi.',
    };
  }

  try {
    // Esecuzione revalidation su tutte le rotte interessate dal layout/sidebar
    revalidatePath('/superadmin');
    revalidatePath('/', 'layout');

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: 'Impossibile aggiornare la licenza nel database.',
    };
  }
}

export async function salvaParametriSistemaAction(
  parametri: ParametroSistemaInput[]
): Promise<ActionResult> {
  if (!parametri || parametri.length === 0) {
    return {
      success: false,
      error: 'Nessun parametro fornito per l’aggiornamento.',
    };
  }

  try {
    revalidatePath('/superadmin');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: 'Errore durante la scrittura dei parametri di sistema.',
    };
  }
}

export async function importaMatriceCNDCECAction(): Promise<ActionResult> {
  try {
    revalidatePath('/superadmin');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: 'Errore durante il caricamento e la sincronizzazione CNDCEC.',
    };
  }
}
