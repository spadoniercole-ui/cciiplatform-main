import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { leggiListaInadempienze, leggiRuoli, riconosciProspetto } from './lettura';
import { analizzaInadempienze, iscrittaARuolo } from './analisi';

// Elenco dei ruoli costruito con le colonne del file reale di Ercole
// (INPS-CPC Lista Ruoli Esattoriali), che non è disponibile qui.
function fileRuoli(): File {
  const aoa = [
    ['INPS-CPC Lista Ruoli Esattoriali'],
    [
      'AdR',
      'ID Cartella/Avviso',
      'Codice Fiscale',
      'Stato',
      'Data Stato',
      'Iscritto',
      'Sgravi',
      'Pag.Post Consegna',
      'Sospeso',
      'Residuo',
    ],
    [
      '598 - SIRACUSA',
      '59820250002181000000',
      '01831130891',
      'Notificata',
      '19/01/2026',
      45434.52,
      0,
      0,
      45434.52,
      45434.52,
    ],
    [
      '598 - SIRACUSA',
      '59820220000344900000',
      '01831130891',
      'Notificata',
      '29/06/2022',
      6484.48,
      0,
      0,
      6484.48,
      6484.48,
    ],
    [
      '598 - SIRACUSA',
      '59820210000133900000',
      '01831130891',
      'Notificata',
      '03/11/2021',
      14611.26,
      0,
      2943,
      0,
      11668.26,
    ],
    [
      '598 - SIRACUSA',
      '59820190001526800000',
      '01831130891',
      'Notificata',
      '02/10/2019',
      4712.89,
      0,
      0,
      0,
      4712.89,
    ],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Ruoli');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([buf], 'INPS-CPC Lista Ruoli Esattoriali.xlsx');
}

describe('ruoli esattoriali', () => {
  it('si riconoscono dalle intestazioni', async () => {
    expect(await riconosciProspetto(fileRuoli())).toBe('RUOLI');
  });

  it('il residuo si somma TUTTO, qualunque sia la data di notifica', async () => {
    // Una cartella notificata nel 2019 con residuo è debito di OGGI: la data
    // dice solo quando è nata. La prima versione, trattandola come un
    // movimento, scartava 2019, 2021 e 2022 come "fuori dal triage".
    const r = await leggiRuoli(fileRuoli());
    expect(r.cartelle).toBe(4);
    expect(Math.round(r.residuo * 100) / 100).toBe(68_300.15);
  });
});

describe('inadempienze già iscritte a ruolo', () => {
  const percorso = '/mnt/user-data/uploads/INPS-CPC_Lista_Inadempienze.xlsx';
  const presente = fs.existsSync(percorso);

  it('riconosce la fase dell’istituto', () => {
    expect(
      iscrittaARuolo({
        inizioPeriodo: '2024/09',
        importoAddebitato: 1,
        importoAccreditato: 0,
        fase: 'INADEMPIENZA ISCRITTA A RUOLO',
      })
    ).toBe(true);
    expect(
      iscrittaARuolo({
        inizioPeriodo: '2024/09',
        importoAddebitato: 1,
        importoAccreditato: 0,
        fase: 'EMESSO MODELLO UL13/AUT MANUALE',
      })
    ).toBe(false);
  });

  it.skipIf(!presente)('sul file reale: 139 su 147 escluse quando ci sono i ruoli', async () => {
    // È il "capolavoro" temuto: caricare inadempienze e ruoli insieme e
    // contare due volte le partite già passate a ruolo.
    const file = new File([fs.readFileSync(percorso)], 'inadempienze.xlsx');
    const { righe } = await leggiListaInadempienze(file);
    // 147 righe di dati: la 148ª del foglio è un'etichetta di fondo pagina,
    // che il lettore giustamente ignora.
    expect(righe).toHaveLength(147);

    const senza = analizzaInadempienze(righe);
    const con = analizzaInadempienze(righe, { escludiIscritteARuolo: true });
    expect(senza.esclusePerRuolo.righe).toBe(0);
    expect(con.esclusePerRuolo.righe).toBe(139);
    // Restano le 8 partite non ancora a ruolo — compresa una con la fase
    // vuota: senza l'informazione non la si può escludere.
    expect(con.totaleNonVersato).toBeLessThan(senza.totaleNonVersato);
  });

  it('senza fase nel file non si esclude nulla', () => {
    const r = analizzaInadempienze(
      [{ inizioPeriodo: '2024/09', importoAddebitato: 1000, importoAccreditato: 0, fase: null }],
      { escludiIscritteARuolo: true }
    );
    expect(r.totaleNonVersato).toBe(1000);
  });
});
