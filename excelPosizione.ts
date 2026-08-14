import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

/**
 * Rileva se la richiesta è indirizzata a "indici" o "parametri" dal query
 * parameter (?type=... o ?resource=...). Questa è una route statica
 * (/api/indici, non /api/indici/[resource]): non riceve mai parametri di
 * route dinamici, quindi non serve gestirli qui.
 */
function getTargetResource(request: Request): 'indici' | 'parametri' {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || searchParams.get('resource');

  if (type === 'parametri' || type === 'parametri_sistema') {
    return 'parametri';
  }

  return 'indici'; // Default sicuro
}

// GET: Recupera tutti i record della risorsa specificata
export async function GET(request: Request) {
  try {
    const resource = getTargetResource(request);

    if (resource === 'parametri') {
      const res = await pool.query(
        `SELECT 
          id_parametro as id, 
          codice, 
          descrizione, 
          valore, 
          unita_misura as "unitaMisura", 
          categoria 
         FROM parametri_sistema 
         ORDER BY categoria, codice ASC`
      );
      return NextResponse.json(res.rows);
    }

    // Default: Indici
    const res = await pool.query(
      'SELECT id_indice as id, categoria, nome, formula, xbrl_tag as "xbrlTag", attivo FROM indici ORDER BY categoria, id_indice ASC'
    );
    return NextResponse.json(res.rows);
  } catch (error) {
    console.error('Errore GET /api/route:', error);
    return NextResponse.json({ error: 'Impossibile recuperare i dati.' }, { status: 500 });
  }
}

// PATCH: Aggiorna un campo di un record esistente
export async function PATCH(request: Request) {
  try {
    const resource = getTargetResource(request);
    const { id, campo, valore } = await request.json();

    if (!id || !campo) {
      return NextResponse.json({ error: 'Parametri mancanti (id/campo).' }, { status: 400 });
    }

    if (resource === 'parametri') {
      const mappaColonneParametri: Record<string, string> = {
        codice: 'codice',
        descrizione: 'descrizione',
        valore: 'valore',
        unitaMisura: 'unita_misura',
      };

      const colonna = mappaColonneParametri[campo];
      if (!colonna) {
        return NextResponse.json({ error: 'Campo non valido per i parametri.' }, { status: 400 });
      }

      const res = await pool.query(
        `UPDATE parametri_sistema SET ${colonna} = $1 WHERE id_parametro = $2`,
        [valore, id]
      );

      if (res.rowCount === 0) {
        return NextResponse.json({ error: 'Parametro non trovato.' }, { status: 404 });
      }

      return NextResponse.json({ success: true });
    }

    // Default: Indici
    const mappaColonneIndici: Record<string, string> = {
      nome: 'nome',
      formula: 'formula',
      xbrlTag: 'xbrl_tag',
      attivo: 'attivo',
    };

    const colonna = mappaColonneIndici[campo];
    if (!colonna) {
      return NextResponse.json({ error: 'Campo non valido per gli indici.' }, { status: 400 });
    }

    const res = await pool.query(`UPDATE indici SET ${colonna} = $1 WHERE id_indice = $2`, [
      valore,
      id,
    ]);

    if (res.rowCount === 0) {
      return NextResponse.json({ error: 'Indice non trovato.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Errore PATCH /api/route:', error);
    return NextResponse.json({ error: 'Errore interno del server.' }, { status: 500 });
  }
}

// POST: Inserisce un nuovo record (Indice o Parametro)
export async function POST(request: Request) {
  try {
    const resource = getTargetResource(request);
    const body = await request.json();

    if (resource === 'parametri') {
      const { id, codice, descrizione, valore, unitaMisura, categoria } = body;

      if (!id || !codice || !categoria) {
        return NextResponse.json(
          { error: 'Dati obbligatori mancanti per il parametro.' },
          { status: 400 }
        );
      }

      await pool.query(
        `INSERT INTO parametri_sistema (id_parametro, codice, descrizione, valore, unita_misura, categoria)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, codice, descrizione || '', valore || '', unitaMisura || '', categoria]
      );

      return NextResponse.json({ success: true });
    }

    // Default: Indici
    const { id, categoria, nome, formula, xbrlTag, attivo } = body;

    if (!id || !categoria || !nome) {
      return NextResponse.json(
        { error: "Dati obbligatori mancanti per l'indice." },
        { status: 400 }
      );
    }

    await pool.query(
      `INSERT INTO indici (id_indice, categoria, nome, formula, xbrl_tag, attivo)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, categoria, nome, formula || '', xbrlTag || '', attivo ?? true]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Errore POST /api/route:', error);
    return NextResponse.json({ error: "Impossibile completare l'inserimento." }, { status: 500 });
  }
}
