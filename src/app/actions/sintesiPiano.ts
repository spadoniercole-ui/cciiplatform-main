'use server';

// Sintesi del piano di sviluppo per i testi (Brogliaccio, Relazione): una
// sola funzione per i due lati, gli stessi calcoli che l'operatore vede nel
// passo «Piano di sviluppo» (motore deterministico, piano automatico di
// settore, semafori). Sostituisce le letture della vecchia simulazione a
// levette. Chi ha già letto i dati di settore li passa, così non si
// rileggono.

import { richiediAccessoScenario } from '@/lib/autorizzazione';
import { pool } from '@/lib/db';
import { ottieniPianoSviluppoAction } from '@/app/actions/pianoSviluppo';
import { ottieniDatiSettore } from '@/app/actions/datiSettore';
import { ottieniSoglieConfrontoAction } from '@/app/actions/pianoAziendale';
import { calcolaPiano, euro, type IpotesiPiano } from '@/lib/piano/piano';
import { crescitaDiRiferimento, ipotesiAutomatiche, type PuntoSerie } from '@/lib/piano/automatico';
import { confrontaPiani } from '@/lib/piano/confronto';
import { anniDelPiano, ipotesiDaPianoAzienda, valoriPuliti } from '@/lib/piano/pianoAziendale';
import { VARIANTE_AI } from '@/lib/piano/elaborazioneAi';

export interface SintesiPiano {
  disponibile: boolean;
  testo: string;
  /** Vincoli della variante «base» (testo breve), per chi deve riportarli fedelmente. */
  vincoli: string[];
}

export async function sintesiPianoScenarioAction(
  nomeSchema: string,
  scenarioId: number,
  aziendaId: number,
  lato: 'RICEVUTA' | 'DA_DEFINIRE',
  settore?: { punti: PuntoSerie[]; descrizione: string | null } | null
): Promise<SintesiPiano> {
  try {
    await richiediAccessoScenario(nomeSchema, scenarioId);
    const r = await ottieniPianoSviluppoAction(nomeSchema, scenarioId, aziendaId, 'base');
    if (!r.success || !r.dati || r.dati.storico.length === 0) {
      return {
        disponibile: false,
        testo: 'PIANO DI SVILUPPO: non calcolabile — serve almeno un bilancio XBRL dell’azienda.',
        vincoli: [],
      };
    }
    const d = r.dati;
    const base = d.storico[0];
    const o = d.orizzonte;
    const rate = { ente: d.rate.ente.slice(0, o), altri: d.rate.altri.slice(0, o) };
    const [settoreLetto, soglieRis, aziendaRis, aiRis] = await Promise.all([
      settore ? Promise.resolve(null) : ottieniDatiSettore(nomeSchema, aziendaId),
      ottieniSoglieConfrontoAction(nomeSchema),
      lato === 'RICEVUTA'
        ? pool.query(
            `SELECT valori, nome_file FROM "${nomeSchema}".piano_aziendale WHERE scenario_id = $1`,
            [scenarioId]
          )
        : Promise.resolve({ rows: [] as { valori: unknown; nome_file: string | null }[] }),
      d.varianti.includes(VARIANTE_AI)
        ? pool.query(
            `SELECT ipotesi, note FROM "${nomeSchema}".piano_sviluppo WHERE scenario_id = $1 AND variante = $2`,
            [scenarioId, VARIANTE_AI]
          )
        : Promise.resolve({ rows: [] as { ipotesi: unknown; note: string | null }[] }),
    ]);
    const punti = settore?.punti ?? (settoreLetto?.success ? settoreLetto.punti : []);
    const descrizione =
      settore?.descrizione ?? (settoreLetto?.info ? `ATECO ${settoreLetto.info.gruppo}` : null);
    const crescita = crescitaDiRiferimento(punti, descrizione, d.storico);
    const auto = calcolaPiano(
      base,
      o,
      ipotesiAutomatiche(base, o, crescita.tasso),
      rate,
      d.capitaleSociale
    );
    const mio = calcolaPiano(base, o, d.ipotesi, rate, d.capitaleSociale);
    const vincoli = mio.vincoli.map((v) => v.testo);

    const righe: string[] = [
      `PIANO DI SVILUPPO (variante «base», ${o} anni, calcolato dal motore della piattaforma sulle macro-voci del bilancio ${base.anno}): ${mio.sintesi.replace(/\n/g, ' ')}`,
    ];
    if (vincoli.length) righe.push(`Vincoli che scattano: ${vincoli.join(' ')}`);
    righe.push(`RIFERIMENTO DI SETTORE: ${crescita.descrizione}`);

    const soglie = soglieRis.soglie;
    if (lato === 'DA_DEFINIRE') {
      const esito = confrontaPiani(
        auto.anni,
        mio.anni,
        null,
        soglie,
        undefined,
        'Sono le ipotesi da documentare prima di depositare il piano.'
      );
      righe.push(
        `AUTOVERIFICA SUL PIANO DI SETTORE (soglie ${soglie.verde}% e ${soglie.giallo}%): ${esito.sintesi}`
      );
    } else if (aziendaRis.rows[0]) {
      const valori = valoriPuliti(aziendaRis.rows[0].valori);
      const ipAz = ipotesiDaPianoAzienda(valori, base.anno + 1, o);
      const az = calcolaPiano(base, o, ipAz, rate, d.capitaleSociale);
      const esito = confrontaPiani(auto.anni, az.anni, ipAz, soglie, new Set(anniDelPiano(valori)));
      righe.push(
        `PIANO DELL’AZIENDA${aziendaRis.rows[0].nome_file ? ` («${aziendaRis.rows[0].nome_file}»)` : ''} A CONFRONTO CON IL PIANO DI SETTORE (soglie ${soglie.verde}% e ${soglie.giallo}%): ${esito.sintesi}${az.vincoli.length ? ` Con le ipotesi dell’azienda scattano: ${az.vincoli.map((v) => v.testo).join(' ')}` : ''}`
      );
    } else {
      righe.push('PIANO DELL’AZIENDA: non caricato.');
    }

    const ai = aiRis.rows[0];
    if (ai) {
      const ipAi = (ai.ipotesi ?? {}) as IpotesiPiano;
      const pAi = calcolaPiano(base, o, ipAi, rate, d.capitaleSociale);
      const sintesiAi = String(ai.note ?? '').split('\n')[1] ?? '';
      righe.push(
        `VARIANTE «elaborazione-ai» (ipotesi scritte dall’AI con motivazione, risultati del motore): ${pAi.sintesi.replace(/\n/g, ' ')}${sintesiAi ? ` Impostazione dichiarata: ${sintesiAi}` : ''}`
      );
    }
    righe.push(
      `Rate della proposta nell’orizzonte: ente ${euro(rate.ente.reduce((a, b) => a + b, 0))}, altri creditori ${euro(rate.altri.reduce((a, b) => a + b, 0))}.`
    );
    return { disponibile: true, testo: righe.join('\n'), vincoli };
  } catch (error: unknown) {
    console.error('[sintesiPianoScenarioAction]', error);
    return {
      disponibile: false,
      testo: 'PIANO DI SVILUPPO: sintesi non disponibile per un errore di lettura.',
      vincoli: [],
    };
  }
}
