import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formattaNumero } from '@/lib/formato/numeri';

// Il difetto visto in pagina: «77.090 €» accanto a «7782 €». La correzione non
// basta se il prossimo blocco reintroduce una formattazione locale, quindi qui
// si verifica che i file della Posizione non chiamino `toLocaleString`: gli
// importi passano tutti da `src/lib/formato/numeri.ts`.

const RADICE = process.cwd();

const FILE = [
  'src/lib/posizionePratica/breakEven.ts',
  'src/lib/posizionePratica/quadratura.ts',
  'src/lib/posizionePratica/divergenze.ts',
  'src/lib/posizionePratica/decisioni.ts',
  'src/components/spazio/DecisioniPratica.tsx',
  'src/app/spazio/[codice]/verifica-salute/[aziendaId]/posizione/page.tsx',
];

describe('formattazione unica degli importi', () => {
  it('nessun file della Posizione formatta i numeri per conto suo', () => {
    for (const relativo of FILE) {
      const testo = readFileSync(path.join(RADICE, relativo), 'utf8');
      expect(testo, relativo).not.toMatch(/toLocaleString\s*\(/);
    }
  });

  it('il formattatore unico separa le migliaia senza dipendere dalla locale del runtime', () => {
    expect(formattaNumero(7782)).toBe('7.782');
    expect(formattaNumero(152_000)).toBe('152.000');
    expect(formattaNumero(-1234567)).toBe('-1.234.567');
  });
});
