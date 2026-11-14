import { describe, expect, it } from 'vitest';
import {
  PROFILI_PREDEFINITI,
  ULTIMO_GIORNO,
  meseSuccessivo,
  mesiDiCompetenza,
  periodiAttesi,
  scadenza,
  scadenzaDenuncia,
  scadenzaPagamento,
  type ProfiloFlusso,
} from './profilo';

const profilo = (patch: Partial<ProfiloFlusso> = {}): ProfiloFlusso => ({
  ...PROFILI_PREDEFINITI[0],
  id: 1,
  ...patch,
});

describe('profilo del flusso — periodi e scadenze', () => {
  it('l’INPS riceve undici denunce l’anno: gennaio-novembre', () => {
    expect(mesiDiCompetenza(profilo())).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('trimestrale e annuale hanno i loro mesi di competenza', () => {
    expect(mesiDiCompetenza(profilo({ periodicita: 'TRIMESTRALE', periodiPerAnno: 4 }))).toEqual([
      3, 6, 9, 12,
    ]);
    expect(mesiDiCompetenza(profilo({ periodicita: 'ANNUALE', periodiPerAnno: 1 }))).toEqual([12]);
  });

  it('la denuncia INPS del periodo gennaio scade a fine febbraio', () => {
    expect(scadenzaDenuncia(profilo(), '2025-01')).toBe('2025-02-28');
  });

  it('«ultimo giorno» segue il calendario, febbraio bisestile compreso', () => {
    expect(scadenza('2024-01', 1, ULTIMO_GIORNO)).toBe('2024-02-29');
    expect(scadenza('2025-01', 1, ULTIMO_GIORNO)).toBe('2025-02-28');
    expect(scadenza('2025-03', 1, ULTIMO_GIORNO)).toBe('2025-04-30');
  });

  it('il pagamento INPS del periodo gennaio scade il 15 febbraio', () => {
    expect(scadenzaPagamento(profilo(), '2025-01')).toBe('2025-02-15');
  });

  it('dicembre e gennaio si attraversano senza perdere l’anno', () => {
    expect(meseSuccessivo('2025-12', 1)).toBe('2026-01');
    expect(scadenza('2025-12', 1, 15)).toBe('2026-01-15');
  });

  it('un periodo illeggibile non produce una scadenza inventata', () => {
    expect(scadenza('', 1, 15)).toBeNull();
    expect(scadenza('2025-13', 1, 15)).toBeNull();
  });

  it('i periodi attesi saltano la competenza che il profilo non prevede', () => {
    // Settembre 2020 → ottobre 2026: 3 mesi nel 2020 (dicembre escluso),
    // 11 per ciascuno dei cinque anni pieni, 10 nel 2026.
    const attesi = periodiAttesi(profilo(), '2020-09', '2026-10');
    expect(attesi).toHaveLength(3 + 55 + 10);
    expect(attesi[0]).toBe('2020-09');
    expect(attesi.at(-1)).toBe('2026-10');
    expect(attesi).not.toContain('2020-12');
  });

  it('i mesi di sospensione escono dal perimetro invece di contarsi come mancanti', () => {
    const attesi = periodiAttesi(profilo(), '2020-09', '2020-12', ['2020-10', '2020-11']);
    expect(attesi).toEqual(['2020-09']);
  });

  it('un intervallo rovesciato non produce periodi', () => {
    expect(periodiAttesi(profilo(), '2026-10', '2020-09')).toEqual([]);
  });

  it('i profili predefiniti coprono INPS, INAIL e Agenzia delle Entrate', () => {
    const tipi = PROFILI_PREDEFINITI.map((p) => p.tipo);
    expect(tipi).toContain('INPS');
    expect(tipi).toContain('INAIL');
    expect(tipi).toContain('AGENZIA_ENTRATE');
  });
});
