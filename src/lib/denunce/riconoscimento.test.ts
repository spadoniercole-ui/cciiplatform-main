import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { riconosciProspetto } from './lettura';

// Riconoscimento sui file REALI forniti da Ercole, delle due famiglie di
// tracciati: il Cassetto e INPS-CPC. Si salta se i file non sono presenti
// (ambiente di sviluppo di un altro), invece di fallire.

const dir = '/mnt/user-data/uploads/';
const casi: [string, string][] = [
  ['Elenco_denunce_2026-09-17_09_34.xls', 'DENUNCE'],
  ['INPS-CPC_Lista_DM10_Trasmessi.xlsx', 'DENUNCE'],
  ['Elenco_Deleghe_2026-09-17_09_34.xls', 'DELEGHE'],
  ['INPS-CPC_Lista_F24.xlsx', 'F24_AGGREGATO'],
  ['INPS-CPC_Lista_Inadempienze.xlsx', 'INADEMPIENZE'],
  ['DettaglioRichiesta-585772.xls', 'VERA'],
];

describe('riconoscimento dei prospetti sui file reali', () => {
  for (const [nome, atteso] of casi) {
    const percorso = dir + nome;
    const presente = fs.existsSync(percorso);
    it.skipIf(!presente)(`${nome} → ${atteso}`, async () => {
      const file = new File([fs.readFileSync(percorso)], nome);
      expect(await riconosciProspetto(file)).toBe(atteso);
    });
  }
});
