// src/lib/settore/istatClient.ts
//
// Client per il servizio SDMX di ISTAT (esploradati.istat.it/SDMXWS,
// verificato essere l'endpoint corrente — in uso dal 2022, sistema
// IstatData/SDMX-RI). Endpoint pubblico, senza autenticazione.
//
// LIMITE CRITICO, verificato sulla pagina ufficiale ISTAT: 5 richieste al
// minuto per IP; oltre quella soglia, blocco di 1-2 GIORNI. Non è
// un'ottimizzazione facoltativa: senza una protezione reale, un uso
// normale della piattaforma potrebbe bloccare Dati di Settore per tutti
// gli spazi per giorni. Per questo qui non si chiama mai ISTAT
// automaticamente al caricamento di una pagina — solo su azione
// esplicita dell'operatore, con un controllo che rifiuta la chiamata se
// l'ultima interrogazione reale è troppo recente.
//
// Formato: CSV via header Accept (l'endpoint ISTAT, per note osservate in
// guide di terzi, ignora il parametro ?format e guarda solo l'header).
// Il nome esatto della colonna/dimensione ATECO nel CSV non è stato
// verificato con una chiamata reale riuscita (timeout in fase di
// ricognizione) — il parsing sotto è quindi difensivo: cerca la colonna
// per pattern invece di assumere un nome fisso, e fallisce in modo
// esplicito (non silenzioso) se non la trova.

const ENDPOINT_BASE = 'https://esploradati.istat.it/SDMXWS/rest/data';
const INTERVALLO_MINIMO_MS = 15_000; // margine di sicurezza sotto il limite di 5/min (12s)

// Solo l'ID del dataflow, senza agenzia e versione fissa: le versioni
// cambiano nel tempo (es. la serie servizi è stata ribasata nell'aprile
// 2024, passando di versione) — un numero di versione fisso in questo
// codice si sarebbe rotto al primo aggiornamento ISTAT, come infatti è
// successo (errore 404 alla prima chiamata reale). Omettendo la
// versione, l'endpoint usa sempre l'ultima disponibile.
const DATAFLOW_ID: Record<'SERVIZI' | 'INDUSTRIA', string> = {
  SERVIZI: '119_367', // "Indice del fatturato dei servizi" (DCSC_FATTSERVIZ_1)
  INDUSTRIA: '114_191', // "Indice dei nuovi ordinativi e del fatturato dei prodotti industriali" (DCSC_ORDFATT)
};

export interface PuntoSerieIstat {
  periodo: string;
  valore: number;
}

export interface RisultatoInterrogazioneIstat {
  successo: boolean;
  punti: PuntoSerieIstat[];
  /** Se il gruppo (3 cifre) non aveva dati pubblicati, si è ripiegato sulla divisione (2 cifre) — va detto, non taciuto. */
  livelloUsato?: 'gruppo' | 'divisione';
  errore?: string;
}

async function puoChiamareIstat(): Promise<{ puo: boolean; attendiMs?: number }> {
  const { pool } = await import('@/lib/db');
  const { assicuraTabellaDatiSettore } = await import('@/db/provision');
  await assicuraTabellaDatiSettore();

  const risultato = await pool.query(
    'SELECT chiamata_il FROM public.dati_settore_ultima_chiamata WHERE id = 1'
  );
  if (risultato.rows.length === 0) return { puo: true };

  const ultima = new Date(risultato.rows[0].chiamata_il).getTime();
  const trascorsi = Date.now() - ultima;
  if (trascorsi >= INTERVALLO_MINIMO_MS) return { puo: true };
  return { puo: false, attendiMs: INTERVALLO_MINIMO_MS - trascorsi };
}

async function registraChiamataIstat(): Promise<void> {
  const { pool } = await import('@/lib/db');
  await pool.query(
    `INSERT INTO public.dati_settore_ultima_chiamata (id, chiamata_il) VALUES (1, now())
     ON CONFLICT (id) DO UPDATE SET chiamata_il = now()`
  );
}

function parseCsvSdmx(testo: string): Record<string, string>[] {
  const righe = testo.trim().split('\n');
  if (righe.length < 2) return [];
  const intestazioni = righe[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return righe.slice(1).map((riga) => {
    const celle = riga.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const oggetto: Record<string, string> = {};
    intestazioni.forEach((h, i) => {
      oggetto[h] = celle[i] ?? '';
    });
    return oggetto;
  });
}

export async function interrogaIstat(
  dataflow: 'SERVIZI' | 'INDUSTRIA',
  gruppo: string,
  divisione: string
): Promise<RisultatoInterrogazioneIstat> {
  const controllo = await puoChiamareIstat();
  if (!controllo.puo) {
    return {
      successo: false,
      punti: [],
      errore: `Troppe richieste a ISTAT in poco tempo — riprova tra ${Math.ceil((controllo.attendiMs || 0) / 1000)} secondi. Protezione contro il blocco IP di ISTAT (5 richieste/minuto, penalità di 1-2 giorni se superato).`,
    };
  }

  try {
    // startPeriod esplicito invece di lastNObservations: senza un filtro
    // di chiave, "ultime N osservazioni" chiede al server di scorrere
    // potenzialmente migliaia di combinazioni di dimensioni per
    // determinare cosa sia "ultimo" — un tipo di richiesta più pesante,
    // e un candidato plausibile per l'errore 500 incontrato. Un
    // intervallo di date esplicito è una richiesta più leggera e più
    // standard in SDMX REST.
    const url = `${ENDPOINT_BASE}/${DATAFLOW_ID[dataflow]}?startPeriod=2023-01`;
    const risposta = await fetch(url, {
      headers: {
        Accept: 'application/vnd.sdmx.data+csv;version=1.0.0',
        // L'errore precedente ("Dettaglio: languageTag1") indica un
        // problema lato server nella negoziazione della lingua — plausibile
        // se l'implementazione (tipica di SDMX-RI, basata su Java) si
        // aspetta sempre un Accept-Language e non gestisce bene la sua
        // assenza. Non richiesto esplicitamente dalla documentazione che
        // ho consultato, ma un tentativo ragionato per questo errore
        // specifico, non un'aggiunta a caso.
        'Accept-Language': 'it',
      },
      signal: AbortSignal.timeout(20_000),
    });
    await registraChiamataIstat();

    if (!risposta.ok) {
      const corpo = await risposta.text().catch(() => '');
      const suggerimento =
        risposta.status === 404
          ? ' Possibile causa: ISTAT ha cambiato l’ID del dataflow (succede quando la serie viene aggiornata o dismessa) — verifica su esploradati.istat.it/SDMXWS/rest/dataflow/IT1 se l’ID è ancora valido.'
          : risposta.status === 500
            ? ' Possibile causa: la query senza filtro di chiave è troppo pesante per il server — se persiste dopo questa correzione, il dataflow potrebbe richiedere un filtro di dimensione più preciso invece di "all".'
            : '';
      return {
        successo: false,
        punti: [],
        errore: `ISTAT ha risposto con errore ${risposta.status}.${suggerimento}${corpo ? ` Dettaglio: ${corpo.slice(0, 300)}` : ''}`,
      };
    }

    const testo = await risposta.text();
    const righe = parseCsvSdmx(testo);
    if (righe.length === 0) {
      return { successo: false, punti: [], errore: 'Risposta ISTAT vuota o non riconosciuta.' };
    }

    const intestazioni = Object.keys(righe[0]);
    const colonnaAteco = intestazioni.find((h) => /ATECO|ECON.*ACTIV|ACTIVITY/i.test(h));
    const colonnaValore = intestazioni.find((h) => /OBS_VALUE|VALUE/i.test(h));
    const colonnaPeriodo = intestazioni.find((h) => /TIME_PERIOD|TIME/i.test(h));

    if (!colonnaAteco || !colonnaValore || !colonnaPeriodo) {
      return {
        successo: false,
        punti: [],
        errore: `Formato della risposta ISTAT non riconosciuto (colonne trovate: ${intestazioni.join(', ')}). Richiede una verifica manuale del dataflow.`,
      };
    }

    // Corrispondenza a cascata sugli stessi dati già scaricati (nessuna
    // chiamata aggiuntiva a ISTAT): non ogni divisione ha il dettaglio a
    // 3 cifre pubblicato — verificato sul caso reale "49.4": ISTAT
    // pubblica per quella divisione solo "49" (2 cifre), mentre per altre
    // (es. 45) pubblica il dettaglio fine (451, 452...). Si prova prima
    // il gruppo richiesto, poi si ripiega sulla divisione.
    const variantiGruppo = new Set([gruppo, gruppo.replace('.', '')]);
    let puntiTrovati = righe
      .filter((r) => variantiGruppo.has(r[colonnaAteco]))
      .map((r) => ({ periodo: r[colonnaPeriodo], valore: Number(r[colonnaValore]) }))
      .filter((p) => !Number.isNaN(p.valore));

    let livelloUsato: 'gruppo' | 'divisione' = 'gruppo';
    if (puntiTrovati.length === 0 && divisione !== gruppo) {
      puntiTrovati = righe
        .filter((r) => r[colonnaAteco] === divisione)
        .map((r) => ({ periodo: r[colonnaPeriodo], valore: Number(r[colonnaValore]) }))
        .filter((p) => !Number.isNaN(p.valore));
      livelloUsato = 'divisione';
    }

    if (puntiTrovati.length === 0) {
      // Invece di limitarsi a dire "non trovato" e lasciar tentare alla
      // cieca un altro formato, si mostrano i codici REALMENTE presenti
      // nella colonna — il dataflow potrebbe usare una nomenclatura
      // diversa (non ATECO puro), o un livello di dettaglio diverso da
      // quello richiesto.
      const codiciReali = Array.from(new Set(righe.map((r) => r[colonnaAteco]))).filter(Boolean);
      return {
        successo: false,
        punti: [],
        errore: `Nessun dato trovato per il gruppo ATECO ${gruppo} in questo dataflow. Codici realmente presenti nella colonna "${colonnaAteco}" (${codiciReali.length} totali): ${codiciReali.join(', ')}`,
      };
    }

    return { successo: true, punti: puntiTrovati, livelloUsato };
  } catch (error: any) {
    await registraChiamataIstat();
    return {
      successo: false,
      punti: [],
      errore: `Impossibile contattare ISTAT: ${error.message || error}`,
    };
  }
}
