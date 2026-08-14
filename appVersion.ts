// src/app/api/xbrl/parse/route.ts
//
// UNICO endpoint di analisi XBRL della piattaforma. Usa il motore condiviso
// in src/lib/xbrl/*. Non reintrodurre qui parsing a regex o logiche di
// calcolo indici duplicate: se manca qualcosa, si estende il motore condiviso.
//
// La risposta include sia i campi "piatti" del motore (anagrafica, corrente,
// tuttiIFact, ecc. — usati dalla tab di Parificazione Tag) sia un blocco
// `data` con gli alias attesi dalla pagina di analisi a 5 tab
// (company, indiciCndec, altriIndici, situazioneDebitoria, relazioneAi):
// stesso risultato del motore, due proiezioni per due consumatori diversi.

import { NextRequest, NextResponse } from 'next/server';
import { analizzaFileXbrl } from '@/lib/xbrl';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Nessun file caricato.' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.xbrl') && !file.name.toLowerCase().endsWith('.xml')) {
      return NextResponse.json(
        { error: 'Estensione non valida: sono accettati solo file .xbrl o .xml.' },
        { status: 400 }
      );
    }

    const xmlContent = await file.text();
    const risultato = await analizzaFileXbrl(xmlContent, file.name);

    return NextResponse.json({
      success: true,
      ...risultato,
      // Proiezione per la pagina a 5 tab (src/app/superadmin/xbrl/caricamento/page.tsx)
      data: {
        company: {
          ragioneSociale: risultato.anagrafica.ragioneSociale,
          codiceFiscale: risultato.anagrafica.codiceFiscale,
          indirizzoSedeLegale: risultato.anagrafica.indirizzo,
          codiceAteco: risultato.anagrafica.codiceAteco,
        },
        hasContoEconomico: risultato.hasContoEconomico,
        indiciCndec: risultato.indici,
        altriIndici: risultato.altriIndici,
        situazioneDebitoria: risultato.situazioneDebitoria,
        relazioneAi: '',
      },
    });
  } catch (err: any) {
    console.error('[api/xbrl/parse] Errore durante il parsing:', err);
    return NextResponse.json(
      { error: `Errore durante l'elaborazione del file XBRL: ${err.message || err}` },
      { status: 500 }
    );
  }
}
