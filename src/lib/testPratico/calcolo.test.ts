import { describe, it, expect } from 'vitest';
import {
  calcolaTestPratico,
  DATI_DEBITO_VUOTI,
  DATI_FLUSSI_VUOTI,
  type DatiDebitoRistrutturare,
  type DatiFlussiARegime,
} from './calcolo';

describe('calcolaTestPratico', () => {
  it('segnala disequilibrio a regime se i flussi non sono stabili dal secondo anno', () => {
    const risultato = calcolaTestPratico(
      { ...DATI_DEBITO_VUOTI, debitoScaduto: 100 },
      { ...DATI_FLUSSI_VUOTI, molProspetticoNormalizzato: 50, inEquilibrioDalSecondoAnno: false }
    );
    expect(risultato.fascia).toBe('DISEQUILIBRIO_A_REGIME');
    expect(risultato.rapporto).toBeNull();
  });

  it('segnala disequilibrio anche se dichiarato in equilibrio ma B risulta comunque ≤ 0', () => {
    const flussi: DatiFlussiARegime = {
      molProspetticoNormalizzato: 10,
      investimentiMantenimentoAnnui: 5,
      imposteRedditoAnnue: 10,
      inEquilibrioDalSecondoAnno: true,
    };
    const risultato = calcolaTestPratico({ ...DATI_DEBITO_VUOTI, debitoScaduto: 100 }, flussi);
    expect(risultato.fascia).toBe('DISEQUILIBRIO_A_REGIME');
  });

  it('calcola A sommando le voci positive e sottraendo quelle negative, stralcio compreso', () => {
    const debito: DatiDebitoRistrutturare = {
      ...DATI_DEBITO_VUOTI,
      debitoScaduto: 100,
      debitoRiscadenziatoOMoratorie: 50,
      dismissioniCespitiORami: 30,
      stralcioRitenutoRagionevole: 20,
    };
    const flussi: DatiFlussiARegime = {
      molProspetticoNormalizzato: 100,
      investimentiMantenimentoAnnui: 0,
      imposteRedditoAnnue: 0,
      inEquilibrioDalSecondoAnno: true,
    };
    const risultato = calcolaTestPratico(debito, flussi);
    expect(risultato.totaleA).toBe(100);
    expect(risultato.totaleB).toBe(100);
    expect(risultato.rapporto).toBe(1);
    expect(risultato.fascia).toBe('DIFFICOLTA_CONTENUTE');
  });

  it('un MOL negativo nel primo anno riduce A solo se effettivamente negativo', () => {
    const conValoreNegativoInInput = calcolaTestPratico(
      { ...DATI_DEBITO_VUOTI, debitoScaduto: 100, molNettoNegativoPrimoAnno: -20 },
      { ...DATI_FLUSSI_VUOTI, molProspetticoNormalizzato: 100, inEquilibrioDalSecondoAnno: true }
    );
    expect(conValoreNegativoInInput.totaleA).toBe(100);

    const conValorePositivoInInput = calcolaTestPratico(
      { ...DATI_DEBITO_VUOTI, debitoScaduto: 100, molNettoNegativoPrimoAnno: 20 },
      { ...DATI_FLUSSI_VUOTI, molProspetticoNormalizzato: 100, inEquilibrioDalSecondoAnno: true }
    );
    expect(conValorePositivoInInput.totaleA).toBe(80);
  });

  it('classifica correttamente le quattro fasce secondo le soglie ufficiali (2, 3, 6)', () => {
    const flussiStandard: DatiFlussiARegime = {
      molProspetticoNormalizzato: 100,
      investimentiMantenimentoAnnui: 0,
      imposteRedditoAnnue: 0,
      inEquilibrioDalSecondoAnno: true,
    };

    const casoContenute = calcolaTestPratico(
      { ...DATI_DEBITO_VUOTI, debitoScaduto: 200 },
      flussiStandard
    );
    expect(casoContenute.fascia).toBe('DIFFICOLTA_CONTENUTE');

    const casoIniziative = calcolaTestPratico(
      { ...DATI_DEBITO_VUOTI, debitoScaduto: 300 },
      flussiStandard
    );
    expect(casoIniziative.fascia).toBe('DIPENDE_DA_INIZIATIVE');

    const casoCessioneProbabile = calcolaTestPratico(
      { ...DATI_DEBITO_VUOTI, debitoScaduto: 600 },
      flussiStandard
    );
    expect(casoCessioneProbabile.fascia).toBe('RICHIEDE_CESSIONE_PROBABILE');

    const casoCessioneNecessaria = calcolaTestPratico(
      { ...DATI_DEBITO_VUOTI, debitoScaduto: 601 },
      flussiStandard
    );
    expect(casoCessioneNecessaria.fascia).toBe('CESSIONE_NECESSARIA');
  });
});
