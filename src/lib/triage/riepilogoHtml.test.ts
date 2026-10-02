import { describe, it, expect } from 'vitest';
import { htmlRiepilogoTriage } from './riepilogoHtml';

const base = {
  azienda: 'ARETUSEA <DETERGENTI> S.R.L.',
  codiceFiscale: '99999980891',
  partitaIva: '99999980891',
  sede: 'Siracusa',
  dataVerifica: '2026-09-21',
  perimetro: 'Perimetro di prova',
  documenti: [{ nome: 'DettaglioRichiesta.xlsx', tipo: 'Posizione V.E.R.A.', esito: 'Usato' }],
  note: ['Ritardo oltre 90 giorni: 7 periodi.'],
  valori: {
    conLavoratori: true,
    annoPrecedente: 2025,
    contributiDovutiAnnoPrecedente: 48599.97,
    nonVersatoOltre90: 16756.41,
    ritardoOltre90Giorni: true,
    periodiInRitardo: 7,
    denunceNonPresentate: '',
    creditiAffidatiAgente: null,
  },
  attenzione: null,
};

describe('riepilogo del triage', () => {
  it('riporta documenti, valori e data, con il testo escapato', () => {
    const h = htmlRiepilogoTriage(base);
    expect(h).toContain('ARETUSEA &lt;DETERGENTI&gt; S.R.L.');
    expect(h).toContain('21/09/2026');
    expect(h).toContain('DettaglioRichiesta.xlsx');
    expect(h).toContain('16.756,41 €');
    expect(h).toContain('sì — 7 periodi');
    expect(h).toMatch(/Denunce non presentate<\/td><td>nessuna/);
  });

  it('distingue «non letto» da «nessuna mancante» e il ritardo non determinabile', () => {
    const h = htmlRiepilogoTriage({
      ...base,
      valori: { ...base.valori, denunceNonPresentate: null, ritardoOltre90Giorni: null },
    });
    expect(h).toContain('Elenco denunce non letto');
    expect(h).toContain('non determinabile con i documenti caricati');
  });
});
