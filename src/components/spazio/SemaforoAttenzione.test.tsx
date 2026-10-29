// @vitest-environment jsdom
//
// IL SEMAFORO NON DEVE SMENTIRSI.
//
// «Copertura informativa: 3 dimensioni su 4» e, due centimetri più sotto,
// «Nulla da integrare»: chi legge pensa che una delle due affermazioni sia
// sbagliata — ed è una videata su cui si decide se attenzionare un'impresa.
// La dimensione scoperta si nomina, e si dice perché non cambia l'esito.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SemaforoAttenzione } from './SemaforoAttenzione';
import type { Attenzione } from '@/lib/screening/indicatore';

afterEach(() => cleanup());

const BASE: Attenzione = {
  esito: 'ROSSO',
  etichetta: 'Criticità rilevante',
  fattoreDeterminante: 'Patrimonio netto negativo',
  accertato: ['Patrimonio netto negativo dall’ultimo bilancio disponibile.'],
  daAccertare: [],
  copertura: { determinate: 3, totali: 4 },
};

describe('SemaforoAttenzione — copertura dichiarata', () => {
  it('nomina la dimensione che manca invece di dire che non manca nulla', () => {
    render(
      <SemaforoAttenzione
        attenzione={{
          ...BASE,
          dimensioniScoperte: [
            { nome: 'Quadro qualitativo (Check List / Direttrici)', portante: false },
          ],
        }}
      />
    );

    expect(screen.getByText(/3 dimensioni su 4/)).toBeTruthy();
    expect(screen.queryByText('Nulla da integrare.')).toBeNull();
    expect(screen.getByText(/Fuori dalla copertura/)).toBeTruthy();
    expect(screen.getByText(/Quadro qualitativo \(Check List \/ Direttrici\)/)).toBeTruthy();
    expect(screen.getByText(/dimensione accessoria, che non cambia l’esito/)).toBeTruthy();
  });

  it('al singolare dice «1 dimensione», non «1 dimensioni»', () => {
    render(
      <SemaforoAttenzione
        attenzione={{ ...BASE, copertura: { determinate: 1, totali: 3 }, dimensioniScoperte: [] }}
      />
    );

    expect(screen.getByText(/Copertura informativa: 1 dimensione su 3/)).toBeTruthy();
  });

  it('con la copertura piena dice che non c’è nulla da integrare', () => {
    render(
      <SemaforoAttenzione
        attenzione={{ ...BASE, copertura: { determinate: 4, totali: 4 }, dimensioniScoperte: [] }}
      />
    );

    expect(screen.getByText('Nulla da integrare.')).toBeTruthy();
    expect(screen.queryByText(/Fuori dalla copertura/)).toBeNull();
  });

  it('un indicatore vecchio, senza il campo, resta leggibile', () => {
    render(<SemaforoAttenzione attenzione={BASE} />);
    // Il campo manca (risposta salvata prima di questa versione): si comporta
    // come prima, senza rompere la videata.
    expect(screen.getByText('Nulla da integrare.')).toBeTruthy();
  });
});
