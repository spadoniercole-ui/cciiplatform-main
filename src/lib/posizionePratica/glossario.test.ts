import { describe, expect, it } from 'vitest';
import { ETICHETTE_REGISTRATE, GLOSSARIO, glossarioDi, voceGlossario } from './glossario';

// Il contratto del glossario: ogni parola mostrata dalla catena ha una voce, e
// ogni voce dice anche ciò che la parola NON significa.

describe('glossario degli esiti', () => {
  it('registra i vocabolari dell’indicatore, della check list e degli scenari', () => {
    for (const etichetta of [
      'ROSSO',
      'GIALLO',
      'ATTENZIONE_MINIMA',
      'Sistemica',
      'Da approfondire',
      'Squilibrio',
      'Orientamento sfavorevole',
      'Accordo',
      'Liquidazione',
      'Cram down',
      'Non calcolabile',
      'Da ricalcolare',
      'Divergente',
    ]) {
      expect(ETICHETTE_REGISTRATE).toContain(etichetta);
    }
  });

  it('nessuna etichetta è registrata due volte', () => {
    expect(new Set(ETICHETTE_REGISTRATE).size).toBe(ETICHETTE_REGISTRATE.length);
  });

  it('ogni voce dice che cosa non significa', () => {
    for (const v of GLOSSARIO) {
      expect(v.nonSignifica.trim().length).toBeGreaterThan(10);
      expect(v.significa.trim().length).toBeGreaterThan(10);
      expect(v.dove.length).toBeGreaterThan(0);
    }
  });

  it('cerca senza distinguere maiuscole e minuscole', () => {
    expect(voceGlossario('rosso')?.etichetta).toBe('ROSSO');
    expect(voceGlossario('  cram down ')?.etichetta).toBe('Cram down');
    expect(voceGlossario('inesistente')).toBeNull();
  });

  it('filtra per superficie della catena', () => {
    expect(glossarioDi('Verifica azienda').map((v) => v.etichetta)).toEqual(
      expect.arrayContaining(['Accordo', 'Liquidazione', 'Cram down'])
    );
  });
});
