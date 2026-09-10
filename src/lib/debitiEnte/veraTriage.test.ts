import { describe, it, expect } from 'vitest';
import { estraiRigheVera } from './veraImport';

// In fase di triage non si chiede all'operatore di mappare titoli e
// trattamenti: si carica il file per sapere se la posizione vada guardata.
// Con le mappature vuote lo scarto era TOTALE — file caricato e ignorato, e
// l'indicatore che dichiarava l'esposizione non disponibile pur avendola
// appena ricevuta.

const sezioni = [
  {
    titolo: 'CONTRIBUTI',
    righe: [
      { voce: 'Contributi correnti', stato: 'Iscritto a ruolo', importo: 12_000 },
      { voce: 'Contributi', stato: '', importo: 3_000 },
    ],
  },
];

describe('import V.E.R.A. in modalità triage', () => {
  it('senza mappature il comportamento normale scarta TUTTO', () => {
    const { righe } = estraiRigheVera(sezioni as never, {}, {});
    expect(righe).toHaveLength(0);
  });

  it('in triage le righe vengono conservate, con gli importi giusti', () => {
    const { righe } = estraiRigheVera(sezioni as never, {}, {}, true);
    expect(righe).toHaveLength(2);
    expect(righe.reduce((a, r) => a + r.importo, 0)).toBe(15_000);
  });

  it('in triage la categoria resta VUOTA: non si inventa una classificazione', () => {
    const { righe } = estraiRigheVera(sezioni as never, {}, {}, true);
    for (const r of righe) expect(r.categoria).toBe('');
  });

  it('in triage il trattamento è quello suggerito dalla catena natura/stato', () => {
    const { righe } = estraiRigheVera(sezioni as never, {}, {}, true);
    for (const r of righe) expect(r.trattamento).toBeTruthy();
  });

  it('le mappature esistenti hanno comunque la precedenza', () => {
    const { righe } = estraiRigheVera(sezioni as never, { contributi: 'DEBITO' }, {}, true);
    for (const r of righe) expect(r.categoria).toBe('DEBITO');
  });
});
