import { describe, expect, it } from 'vitest';
import { MODULI_PERMESSO } from './moduliPermesso';
import {
  PERMESSI_PROFILO,
  componiPermessiUtente,
  permessiDelProfilo,
  TIPOLOGIE_PROFILO,
} from './profiliUtente';

describe('profili utente dello spazio', () => {
  it('dichiara un livello per ogni funzione, in entrambi i profili', () => {
    for (const tipologia of TIPOLOGIE_PROFILO) {
      expect(Object.keys(PERMESSI_PROFILO[tipologia]).sort()).toEqual([...MODULI_PERMESSO].sort());
    }
  });

  it('il Consultatore non scrive mai', () => {
    const permessi = permessiDelProfilo('CONSULTATORE');
    for (const modulo of MODULI_PERMESSO) expect(permessi[modulo]).toBe('LETTURA');
  });

  it('l’Operatore scrive scenari e check list e legge il resto', () => {
    const permessi = permessiDelProfilo('OPERATIVO');
    expect(permessi.scenari).toBe('SCRITTURA');
    expect(permessi.checklist).toBe('SCRITTURA');
    for (const modulo of MODULI_PERMESSO) {
      if (modulo !== 'scenari' && modulo !== 'checklist') expect(permessi[modulo]).toBe('LETTURA');
    }
  });

  it('le scelte dell’Admin vincono sul profilo, compreso il modulo spento', () => {
    const permessi = componiPermessiUtente('OPERATIVO', {
      scenari: 'NESSUNO',
      indici: 'SCRITTURA',
    });
    expect(permessi.scenari).toBe('NESSUNO');
    expect(permessi.indici).toBe('SCRITTURA');
    expect(permessi.checklist).toBe('SCRITTURA');
  });

  it('restituisce una copia: modificarla non cambia il profilo', () => {
    const permessi = permessiDelProfilo('OPERATIVO');
    permessi.scenari = 'NESSUNO';
    expect(PERMESSI_PROFILO.OPERATIVO.scenari).toBe('SCRITTURA');
  });
});
