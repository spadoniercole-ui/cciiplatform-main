import { describe, expect, it } from 'vitest';
import {
  descriviObbligoVera,
  enteRichiedeVera,
  enteUnicoDaRighe,
  risolviObbligoVera,
} from './veraObbligatorio';

describe('obbligo del V.E.R.A. nel triage', () => {
  it('segue l’ente: obbligatorio per l’INPS, facoltativo per gli altri', () => {
    expect(risolviObbligoVera(null, 'INPS')).toMatchObject({
      obbligatorio: true,
      origine: 'ENTE',
    });
    expect(risolviObbligoVera(null, 'INAIL').obbligatorio).toBe(false);
    expect(risolviObbligoVera(null, 'AGENZIA_ENTRATE').obbligatorio).toBe(false);
    // Il confronto non dipende da come è scritto l'ente.
    expect(enteRichiedeVera(' inps ')).toBe(true);
    expect(enteRichiedeVera('INPS Sede di Milano')).toBe(false);
  });

  it('l’impostazione dello spazio prevale sull’ente, in entrambi i versi', () => {
    expect(risolviObbligoVera(false, 'INPS')).toMatchObject({
      obbligatorio: false,
      origine: 'IMPOSTAZIONE',
    });
    expect(risolviObbligoVera(true, 'INAIL')).toMatchObject({
      obbligatorio: true,
      origine: 'IMPOSTAZIONE',
    });
    // «Automatico» non è un valore salvato: torna a seguire l'ente.
    expect(risolviObbligoVera(null, 'INPS').impostazione).toBeNull();
  });

  it('senza un ente riconosciuto il triage non si blocca', () => {
    const o = risolviObbligoVera(null, null);
    expect(o.obbligatorio).toBe(false);
    expect(o.origine).toBe('PREDEFINITO');
    // La frase dice cosa fare, non solo com'è andata.
    expect(descriviObbligoVera(o)).toContain('accendi l’obbligo');
  });

  it('un solo ente fra le soglie è l’ente dello spazio', () => {
    expect(enteUnicoDaRighe([{ ente_25novies: 'INPS' }, { ente_25novies: 'INPS' }])).toBe('INPS');
    expect(enteUnicoDaRighe([{ ente_25novies: 'INPS' }, { ente_25novies: 'INAIL' }])).toBeNull();
    expect(enteUnicoDaRighe([{ ente_25novies: null }])).toBeNull();
  });

  it('la frase dichiara lo stato e la sua origine', () => {
    expect(descriviObbligoVera(risolviObbligoVera(null, 'INPS'))).toContain('Obbligatorio');
    expect(descriviObbligoVera(risolviObbligoVera(null, 'INAIL'))).toContain('INAIL');
    expect(descriviObbligoVera(risolviObbligoVera(false, 'INPS'))).toContain(
      'scelta di questo spazio'
    );
  });
});
