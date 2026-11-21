'use server';

// IL RITRATTO DELL'AZIENDA — lettura delle fonti già calcolate.
//
// Qui si LEGGE soltanto: la verifica amministrativa non si rilancia, il
// giudizio non si ricalcola e le dimensioni arrivano dal loro motore. Il
// ritratto si compone in `src/lib/ritratto/ritratto.ts`, che è puro e ha i
// suoi test.
//
// Ogni lettura opzionale che fallisce non ferma il ritratto: quella parte
// diventa «non disponibile» e il riquadro delle mancanze lo dichiara.

import { richiediAccessoSchema } from '@/lib/autorizzazione';
import { ottieniAziendaPerId } from '@/app/actions/aziende';
import { statoVerificaContabileAction } from '@/app/actions/verificaContabile';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { diagnosticaIaiAction } from '@/app/actions/iai';
import { leggiIdentificativiEnte } from '@/lib/anagraficaEnte/identificativi';
import { statoDirettrici } from '@/lib/verificaAzienda/direttrici';
import { componiEsitoVerifica } from '@/lib/verifica/esito';
import { componiRitratto, type Ritratto } from '@/lib/ritratto/ritratto';

export interface RisultatoRitratto {
  success: boolean;
  ritratto?: Ritratto;
  error?: string;
}

export async function ritrattoAziendaAction(
  nomeSchema: string,
  aziendaId: number,
  tipoSpazio: 'ENTE' | 'NON_ENTE'
): Promise<RisultatoRitratto> {
  try {
    await richiediAccessoSchema(nomeSchema, { soloAdmin: true });
    if (!/^[a-z0-9_]+$/.test(nomeSchema)) {
      return { success: false, error: 'Nome schema non valido.' };
    }
    if (!Number.isInteger(aziendaId) || aziendaId <= 0) {
      return { success: false, error: 'Azienda non valida.' };
    }

    const [azienda, statoContabile, attenzioneRis, storicoRis, dimensioniRis] = await Promise.all([
      ottieniAziendaPerId(nomeSchema, aziendaId),
      statoVerificaContabileAction(nomeSchema).catch(() => null),
      ottieniAttenzioneScreeningAction(nomeSchema, aziendaId).catch(() => null),
      ottieniStoricoVerificheAction(nomeSchema).catch(() => null),
      diagnosticaIaiAction(nomeSchema, aziendaId, tipoSpazio).catch(() => null),
    ]);

    if (!azienda.success || !azienda.azienda) {
      return { success: false, error: 'Azienda non trovata.' };
    }
    const az = azienda.azienda;

    const identificativi = await leggiIdentificativiEnte(nomeSchema, aziendaId).catch(() => []);
    const rigaContabile = statoContabile?.success
      ? statoContabile.aziende.find((a) => a.aziendaId === aziendaId)
      : undefined;
    const eseguitaIl = storicoRis?.success
      ? (storicoRis.righe?.find((v) => v.id === aziendaId)?.eseguitaIl ?? null)
      : null;

    const direttrici = statoDirettrici({
      amministrativaLetta: Boolean(
        storicoRis?.success && storicoRis.righe?.some((v) => v.id === aziendaId)
      ),
      contabile: rigaContabile
        ? {
            completa: rigaContabile.completa,
            anniXbrl: rigaContabile.anniXbrl,
            visuraPresente: rigaContabile.visuraPresente,
          }
        : null,
      baseAziendaleSalvata: rigaContabile?.baseAziendaleSalvata ?? false,
    });

    // Il giudizio è quello del semaforo, già formato: entra e esce identico.
    const attenzione =
      attenzioneRis?.success && attenzioneRis.attenzione ? attenzioneRis.attenzione : null;
    const esito = attenzione
      ? componiEsitoVerifica({
          giudizio: attenzione,
          dimensioni: dimensioniRis?.success ? (dimensioniRis.dimensioni ?? []) : [],
        })
      : null;

    const sede = [az.citta, az.provincia].filter(Boolean).join(' ') || null;
    const ritratto = componiRitratto({
      anagrafica: {
        ragioneSociale: az.ragioneSociale,
        formaGiuridica: az.formaGiuridica ?? null,
        partitaIva: az.partitaIva ?? null,
        codiceFiscale: az.codiceFiscale ?? null,
        sede: sede ? (az.provincia ? `${az.citta} (${az.provincia})` : sede) : null,
        attiva: Boolean(az.attiva),
        identificativi: identificativi.map((i) => ({ etichetta: i.etichetta, valore: i.valore })),
      },
      direttrici,
      amministrativa: {
        verificataIl: eseguitaIl,
        debitoMemorizzato: rigaContabile?.debitoMemorizzato ?? null,
        debitoMemorizzatoIl: rigaContabile?.debitoMemorizzatoIl ?? null,
      },
      contabile: rigaContabile
        ? {
            anniXbrl: rigaContabile.anniXbrl,
            visuraIl: rigaContabile.visuraIl,
            parametriPresenti: rigaContabile.parametriPresenti,
            completa: rigaContabile.completa,
          }
        : null,
      esito,
    });

    return { success: true, ritratto };
  } catch (error: unknown) {
    console.error('[ritrattoAziendaAction] Errore:', error);
    return {
      success: false,
      error: `Impossibile comporre il ritratto: ${(error as Error).message}`,
    };
  }
}
