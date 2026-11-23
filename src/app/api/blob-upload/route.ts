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
// proposte), quasi sempre ben sotto quella soglia. Con l'archivio su disco
// (portable, edizione server) quel tetto non c'è: vedi limiteUploadByte.

import { put } from '@/lib/blobStore';
import { NextResponse } from 'next/server';
import { ottieniContestoAccessoSpazio } from '@/app/actions/spazi';
import { prefissoFileSpazio, rifiutaSeNonAutorizzato } from '@/lib/autorizzazione';
import { limiteUploadByte } from '@/lib/edizioneServer';
import { CorpoTroppoGrande, formDataDalCorpo, leggiCorpoLimitato } from '@/lib/file/corpoLimitato';
import { eDocumentoDemo } from '@/lib/demo/documenti';

// 4MB su Vercel (prudente sotto il tetto reale di 4,5MB), 20MB su disco locale.
const DIMENSIONE_MASSIMA = limiteUploadByte();
const LIMITE_MB = DIMENSIONE_MASSIMA / 1024 / 1024;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // Prima la sessione, poi il corpo: chi non è autenticato non deve poter far
    // caricare in memoria al server un corpo arbitrario (le route non hanno il
    // limite delle server action).
    const rifiuto = await rifiutaSeNonAutorizzato('SESSIONE');
    if (rifiuto) return rifiuto as NextResponse;
    // IL TETTO VALE PER IL CORPO, NON PER UN'INTESTAZIONE (0.245.0). Qui si
    // pretendeva `Content-Length`, e un proxy che ricompone il corpo a pezzi lo
    // omette: ogni upload dall'anteprima cloud veniva respinto con 413 anche
    // con un PDF di poche decine di KB. Il margine copre l'involucro multipart.
    let corpo: Uint8Array;
    try {
      corpo = await leggiCorpoLimitato(request, DIMENSIONE_MASSIMA + 64 * 1024);
    } catch (errore) {
      if (errore instanceof CorpoTroppoGrande) {
        return NextResponse.json(
          { error: `File troppo grande — il limite è di ${LIMITE_MB}MB.` },
          { status: 413 }
        );
      }
      throw errore;
    }
    if (corpo.byteLength === 0) {
      return NextResponse.json({ error: 'Nessun file ricevuto.' }, { status: 400 });
    }
    const formData = await formDataDalCorpo(corpo, request.headers.get('content-type'));
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
    // SOLO IL SET DEMO, SOLO IN DEMO (0.256.0). In uno spazio demo i documenti
    // sono quelli del pacchetto scaricabile, riconosciuti dal nome: un file
    // qualsiasi non entra, perché la demo non ha nulla da leggere di vero e i
    // documenti veri non devono finire in uno spazio dimostrativo. Fuori dal
    // demo il controllo non esiste: la produzione non cambia comportamento.
    if (contesto.demo && !eDocumentoDemo(file.name)) {
      return NextResponse.json(
        {
          error:
            'Ambiente demo: si possono acquisire solo i documenti del set demo. Scarica il pacchetto dalla schermata di acquisizione e usa quelli.',
        },
        { status: 403 }
      );
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Solo file PDF sono ammessi.' }, { status: 400 });
    }
    if (file.size > DIMENSIONE_MASSIMA) {
      return NextResponse.json(
        {
          error:
            LIMITE_MB < 20
              ? `File troppo grande (${(file.size / 1024 / 1024).toFixed(1)}MB) — limite temporaneo di 4MB dovuto a un problema noto di Vercel sull'upload diretto dal browser.`
              : `File troppo grande (${(file.size / 1024 / 1024).toFixed(1)}MB) — il limite è di ${LIMITE_MB}MB.`,
        },
        { status: 413 }
      );
    }

    // Il tipo dichiarato dal browser non basta: un PDF comincia con «%PDF-».
    const testa = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...testa) !== '%PDF-') {
      return NextResponse.json({ error: 'Il file non è un PDF valido.' }, { status: 400 });
    }

    // Il prefisso lega il file allo spazio: le azioni che lo leggono o lo
    // eliminano verificano che appartenga allo spazio del chiamante.
    const blob = await put(`${prefissoFileSpazio(contesto.spazioId)}${file.name}`, file, {
      access: 'private',
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url });
  } catch (error: any) {
    console.error('[blob-upload] Errore:', error);
    return NextResponse.json({ error: 'Errore durante il caricamento del file.' }, { status: 500 });
  }
}
