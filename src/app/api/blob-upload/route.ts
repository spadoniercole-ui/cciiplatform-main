// src/app/api/blob-upload/route.ts
//
// Upload PROXATO attraverso questo server, non più diretto dal browser
// a Vercel Blob. Cambio forzato da un bug confermato lato Vercel
// (agosto 2026, @vercel/blob 2.6.1): l'endpoint che genera il token per
// l'upload diretto dal browser non restituisce l'header CORS atteso, e
// il browser blocca la risposta — confermato anche dal supporto Vercel
// come problema da investigare internamente, nessuna data di
// risoluzione nota. Nell'attesa, il file passa da qui: il browser lo
// manda a questa route (multipart), che lo carica su Blob lato server
// con put(). Il costo di questo giro: torna a valere il tetto
// infrastrutturale di 4,5MB sul corpo della richiesta — lo stesso
// limite che l'upload diretto era nato per aggirare. Accettabile per i
// documenti di questo modulo (visure camerali, PDF allegati alle
// proposte), quasi sempre ben sotto quella soglia.

import { put } from '@/lib/blobStore';
import { NextResponse } from 'next/server';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';

const DIMENSIONE_MASSIMA = 4 * 1024 * 1024; // 4MB, prudente sotto il tetto reale di Vercel (4,5MB)

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const codiceSpazio = formData.get('codice') as string | null;

    if (!codiceSpazio) {
      return NextResponse.json(
        { error: 'Contesto spazio mancante — upload rifiutato.' },
        { status: 400 }
      );
    }
    const contesto = await ottieniContestoAccessoSpazio(codiceSpazio);
    if (!contesto) {
      return NextResponse.json(
        { error: 'Sessione non valida — upload rifiutato.' },
        { status: 401 }
      );
    }
    if (!file) {
      return NextResponse.json({ error: 'Nessun file ricevuto.' }, { status: 400 });
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Solo file PDF sono ammessi.' }, { status: 400 });
    }
    if (file.size > DIMENSIONE_MASSIMA) {
      return NextResponse.json(
        {
          error: `File troppo grande (${(file.size / 1024 / 1024).toFixed(1)}MB) — limite temporaneo di 4MB dovuto a un problema noto di Vercel sull'upload diretto dal browser.`,
        },
        { status: 413 }
      );
    }

    const blob = await put(file.name, file, {
      access: 'private',
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url });
  } catch (error: any) {
    console.error('[blob-upload] Errore:', error);
    return NextResponse.json({ error: error.message || 'Errore upload.' }, { status: 500 });
  }
}
