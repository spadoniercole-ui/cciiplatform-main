// src/lib/denunce/periodi.ts
//
// IL PERIODO DI COMPETENZA, IN QUALUNQUE FORMA ARRIVI.
//
// I file dell'Istituto scrivono il mese di competenza in modi diversi: il
// Cassetto come «09/2024», INPS-CPC come «2024/09», e spesso non lo scrivono
// affatto come testo — la cella è una DATA di Excel. Con `cellDates` quella
// cella arriva qui come oggetto `Date`, non come stringa: leggere il periodo
// con una regex sul testo lo scartava in silenzio, e il file sembrava non
// contenere nessuna denuncia. Non era un'azienda che non dichiara: era un
// fuso orario di celle.
//
// Per questo la lettura passa da qui, e non da una regex per foglio: una sola
// funzione riconosce testo, date, numeri seriali di Excel e il mese scritto a
// parole. Restituisce sempre la stessa coppia anno / mese, che il lettore
// scrive nella forma che gli serve (`MM/AAAA` per le denunce, `AAAA/MM` per le
// inadempienze).
//
// Un periodo che non si legge resta null: non si inventa un mese per far
// tornare un conteggio.

/** Un mese di competenza, con l'anno. */
export interface PeriodoCompetenza {
  anno: number;
  mese: number;
}

const MESI = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

function valido(anno: number, mese: number): PeriodoCompetenza | null {
  if (!Number.isInteger(anno) || anno < 1990 || anno > 2100) return null;
  if (!Number.isInteger(mese) || mese < 1 || mese > 12) return null;
  return { anno, mese };
}

/**
 * Il periodo scritto in una cella, oppure null se non si legge.
 *
 * Forme riconosciute:
 *   - `Date` (celle lette con `cellDates`);
 *   - numero seriale di Excel (giorni dal 30/12/1899);
 *   - `AAAAMM` numerico o testuale (`202409`, `092024`);
 *   - `MM/AAAA`, `AAAA/MM`, con `/`, `-` o `.` come separatore;
 *   - date complete `gg/mm/aaaa` e `aaaa-mm-gg`, anche con orario;
 *   - il mese a parole (`settembre 2024`, `SETTEMBRE 2024`).
 *
 * L'ordine dei tentativi conta: `01/09/2024` è una data completa, non un
 * «01/2024» con qualcosa in più, e va letta come giorno 1 di settembre.
 */
export function periodoCompetenza(valore: unknown): PeriodoCompetenza | null {
  if (valore === null || valore === undefined || valore === '') return null;

  if (valore instanceof Date) {
    if (Number.isNaN(valore.getTime())) return null;
    return valido(valore.getUTCFullYear(), valore.getUTCMonth() + 1);
  }

  if (typeof valore === 'number') {
    if (!Number.isFinite(valore)) return null;
    // Seriale di Excel: i fogli lo usano al posto della data.
    if (valore > 20_000 && valore < 80_000) {
      const d = new Date(Date.UTC(1899, 11, 30) + valore * 86_400_000);
      return valido(d.getUTCFullYear(), d.getUTCMonth() + 1);
    }
    // AAAAMM scritto come numero.
    const n = Math.trunc(valore);
    if (n >= 199_001 && n <= 210_012) return valido(Math.floor(n / 100), n % 100);
    return null;
  }

  const s = String(valore).trim().toLowerCase();
  if (s === '') return null;

  // Date complete, prima delle forme ridotte.
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // gg/mm/aaaa
  if (m) return valido(Number(m[3]), Number(m[2]));
  m = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/); // aaaa-mm-gg, anche con orario
  if (m) return valido(Number(m[1]), Number(m[2]));

  m = s.match(/^(\d{1,2})[/.-](\d{4})$/); // MM/AAAA
  if (m) return valido(Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{4})[/.-](\d{1,2})$/); // AAAA/MM
  if (m) return valido(Number(m[1]), Number(m[2]));

  // AAAAMM in testo, in entrambi i versi.
  m = s.match(/^(\d{6})$/);
  if (m) {
    const n = Number(m[1]);
    const testa = Math.floor(n / 100);
    const coda = n % 100;
    // «202409»: l'anno è davanti. «092024»: l'anno è dietro e il mese davanti.
    if (testa >= 1990 && testa <= 2100) return valido(testa, coda);
    const annoInCoda = n % 10_000;
    if (annoInCoda >= 1990 && annoInCoda <= 2100) return valido(annoInCoda, Math.floor(n / 10_000));
  }

  const anno = s.match(/((?:19|20)\d{2})/);
  const mese = MESI.findIndex((nome) => s.includes(nome));
  if (anno && mese >= 0) return valido(Number(anno[1]), mese + 1);

  return null;
}

/** La stessa coppia scritta come la vuole il foglio: `09/2024` o `2024/09`. */
export function testoPeriodo(
  periodo: PeriodoCompetenza,
  forma: 'MM/AAAA' | 'AAAA/MM' = 'MM/AAAA'
): string {
  const mese = String(periodo.mese).padStart(2, '0');
  return forma === 'MM/AAAA' ? `${mese}/${periodo.anno}` : `${periodo.anno}/${mese}`;
}
