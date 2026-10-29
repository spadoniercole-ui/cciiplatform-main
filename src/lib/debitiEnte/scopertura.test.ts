import { describe, expect, it } from 'vitest';
import {
  SCOPERTURA_GIORNI_RILEVANTE,
  eVersamentoConTermine,
  scoperturaDaVera,
  termineVersamento,
} from './scopertura';

describe('termineVersamento', () => {
  it('il versamento del periodo scade il 16 del mese successivo', () => {
    expect(termineVersamento('03/2026')?.toISOString().slice(0, 10)).toBe('2026-04-16');
    expect(termineVersamento('2026-06-01')?.toISOString().slice(0, 10)).toBe('2026-07-16');
    expect(termineVersamento('202506 - 202506')?.toISOString().slice(0, 10)).toBe('2025-07-16');
    // Dicembre: il termine cade nell'anno dopo.
    expect(termineVersamento('12/2025')?.toISOString().slice(0, 10)).toBe('2026-01-16');
  });

  it('senza periodo leggibile non c’è nessun termine', () => {
    expect(termineVersamento('')).toBeNull();
    expect(termineVersamento(undefined)).toBeNull();
    expect(termineVersamento('marzo')).toBeNull();
  });
});

describe('scoperturaDaVera', () => {
  it('conta i giorni dal termine alla data della verifica', () => {
    // 03/2026 → termine 16/04/2026; verifica 28/10/2026: 195 giorni.
    expect(scoperturaDaVera('03/2026', '2026-10-28')).toEqual({
      termine: '2026-04-16',
      giorni: 195,
    });
    expect(scoperturaDaVera('2026-06-01', '2026-10-28')).toEqual({
      termine: '2026-07-16',
      giorni: 104,
    });
  });

  it('oltre i 30 giorni la scopertura è rilevante', () => {
    const s = scoperturaDaVera('03/2026', '2026-10-28');
    expect(s).not.toBeNull();
    expect(s!.giorni).toBeGreaterThan(SCOPERTURA_GIORNI_RILEVANTE);
  });

  it('un versamento non ancora scaduto non è scoperto', () => {
    // Periodo 10/2026: termine 16/11/2026, la verifica è del 28/10/2026.
    expect(scoperturaDaVera('10/2026', '2026-10-28')).toBeNull();
  });

  it('senza periodo o con data illeggibile non si inventa nulla', () => {
    expect(scoperturaDaVera('', '2026-10-28')).toBeNull();
    expect(scoperturaDaVera('03/2026', '')).toBeNull();
  });
});

describe('eVersamentoConTermine', () => {
  it('vale per l’F24 e per le denunce, non per verbali, verifiche e cartelle', () => {
    expect(eVersamentoConTermine('F24 Non presentato')).toBe(true);
    expect(eVersamentoConTermine('Denunce non trasmesse')).toBe(true);
    expect(eVersamentoConTermine('Verbale Evasione')).toBe(false);
    expect(eVersamentoConTermine('VERIFICA VERBALE (AE)')).toBe(false);
    expect(eVersamentoConTermine('Cartella di pagamento')).toBe(false);
  });
});
