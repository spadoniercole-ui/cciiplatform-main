// src/app/api/backup-upload/route.ts
//
// Rilascia al browser il permesso di caricare il file di backup DIRETTAMENTE
// sullo storage, senza farlo passare dal server applicativo.
//
// PERCHÉ ESISTE. Vercel impone un limite fisso di circa 4,5 MB al corpo delle
// richieste verso le funzioni serverless: è dell'infrastruttura, non
// dell'applicazione, e agisce prima che la richiesta raggiunga il codice. Un
// backup reale supera quella soglia — misurato: 4.370 KB in binario, che
// ricodificati per la spedizione diventano circa 5,8 MB. Passando da una
// Server Action la richiesta veniva respinta senza invocare la funzione e
// senza lasciare traccia nei log: il browser mostrava soltanto "An unexpected
// response was received from the server".
//
// Con il caricamento diretto il file va dal browser allo storage senza
// attraversare la funzione; il server riceve poi solo l'indirizzo, e va a
// leggersi il contenuto da lì. Il limite non si applica.
//
// SICUREZZA. Il file contiene tutte le credenziali della piattaforma. Perciò:
//  - il permesso viene rilasciato SOLO a un Superadmin autenticato;
//  - il nome del file viene deciso qui, non accettato dal browser;
//  - il file viene ELIMINATO subito dopo l'elaborazione (in
//    ripristinaDatabase.ts, in un blocco `finally`), coerentemente con la
//    regola della piattaforma: i file caricati non si conservano mai.

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { pool } from '@/lib/db';

export const maxDuration = 60;

/** Il permesso di caricare si concede solo a un Superadmin con sessione valida. */
async function eSuperadmin(): Promise<boolean> {
  try {
    const token = (await cookies()).get('session_token')?.value;
    if (!token) return false;
    const r = await pool.query(
      `SELECT ruolo FROM public.sessioni WHERE token = $1 AND expires_at > now()`,
      [token]
    );
    return String(r.rows[0]?.ruolo ?? '') === 'SUPERADMIN';
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  // ---------------------------------------------------------------------
  // ATTENZIONE: questa rotta riceve DUE chiamate diverse.
  //
  //  1. 'blob.generate-client-token' — dal BROWSER, per chiedere il permesso
  //     di caricare. Porta i cookie di sessione: qui il controllo va fatto.
  //  2. 'blob.upload-completed' — dai server dello storage, a caricamento
  //     concluso. È una chiamata macchina-a-macchina e NON porta cookie.
  //
  // Applicare il controllo di sessione anche alla seconda la faceva fallire
  // con 403; lo storage riprovava, e il browser restava in attesa indefinita,
  // con l'aria di essersi bloccato. L'autenticità della seconda chiamata è
  // già verificata da `handleUpload`, che ne controlla la firma: il controllo
  // di ruolo appartiene solo al primo passo.
  // ---------------------------------------------------------------------
  if (body?.type === 'blob.generate-client-token' && !(await eSuperadmin())) {
    return NextResponse.json({ error: 'Operazione riservata al Superadmin.' }, { status: 403 });
  }

  try {
    const risultato = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        // Il nome lo decidiamo noi: un nome scelto dal browser potrebbe
        // sovrascrivere altri file o uscire dalla cartella prevista.
        allowedContentTypes: ['text/plain', 'application/sql', 'application/octet-stream'],
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ id: crypto.randomUUID() }),
      }),
      onUploadCompleted: async () => {
        // Nulla da fare: il ripristino legge il file quando l'utente conferma,
        // e lo elimina subito dopo.
      },
    });
    return NextResponse.json(risultato);
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
