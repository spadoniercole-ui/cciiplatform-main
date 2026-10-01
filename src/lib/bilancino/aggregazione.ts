// src/lib/bilancino/aggregazione.ts
//
// Dai conti classificati alle macro-voci del prospetto dei dati attualizzati
// (DatiFinanziariPeriodo, la stessa forma che gli Indici leggono dal XBRL),
// con il controllo di quadratura: attivo = passivo + netto (compreso il
// risultato del periodo, che in un bilancino non ancora chiuso sta solo nei
// conti economici).

import type { DatiFinanziariPeriodo } from '@/lib/xbrl/types';
import { categoria, type IdCategoria } from './categorie';
import type { ContoLetto, ModoImporti } from './lettura';

export type MappaConti = Record<string, IdCategoria | undefined>;

export interface RisultatoAggregazione {
  dati: DatiFinanziariPeriodo;
  /** Somma per categoria, già orientata secondo la natura della categoria. */
  perCategoria: Partial<Record<IdCategoria, number>>;
  risultatoPeriodo: number;
  quadratura: {
    attivo: number;
    passivoENetto: number;
    differenza: number;
    tolleranza: number;
    ok: boolean;
  };
  /** Conti senza categoria: non entrano nel calcolo. */
  nonAssegnati: ContoLetto[];
  /** Conti a doppia natura letti senza segno: il lato è quello predefinito, non verificabile. */
  doppiaNaturaSenzaSegno: ContoLetto[];
}

const arrotonda = (n: number) => Math.round(n * 100) / 100;

export function aggregaBilancino(
  conti: ContoLetto[],
  mappa: MappaConti,
  modo: ModoImporti
): RisultatoAggregazione {
  const senzaSegno = modo === 'saldo_senza_segno';
  const somma: Partial<Record<IdCategoria, number>> = {};
  const add = (id: IdCategoria, v: number) => (somma[id] = (somma[id] ?? 0) + v);
  // Lati dei conti a doppia natura
  let bancaAttivo = 0;
  let bancaPassivo = 0;
  let erarioAttivo = 0;
  let erarioPassivo = 0;
  let entiAttivo = 0;
  let entiPassivo = 0;
  const nonAssegnati: ContoLetto[] = [];
  const doppiaNaturaSenzaSegno: ContoLetto[] = [];

  for (const conto of conti) {
    const id = mappa[conto.chiave];
    if (!id) {
      nonAssegnati.push(conto);
      continue;
    }
    const cat = categoria(id);
    if (cat.natura === 'esclusa') continue;
    if (cat.natura === 'doppia') {
      // Con segno: dare = attivo, avere = passivo. Senza segno: lato predefinito
      // (banca = liquidità, Erario ed enti = debito), dichiarato come non verificabile.
      let lato: 'attivo' | 'passivo';
      let importo: number;
      if (senzaSegno) {
        lato = id === 'banca_cc' ? 'attivo' : 'passivo';
        importo = Math.abs(conto.saldo);
        doppiaNaturaSenzaSegno.push(conto);
      } else {
        lato = conto.saldo >= 0 ? 'attivo' : 'passivo';
        importo = Math.abs(conto.saldo);
      }
      const attivo = lato === 'attivo';
      if (id === 'banca_cc') {
        if (attivo) bancaAttivo += importo;
        else bancaPassivo += importo;
      } else if (id === 'erario') {
        if (attivo) erarioAttivo += importo;
        else erarioPassivo += importo;
      } else {
        if (attivo) entiAttivo += importo;
        else entiPassivo += importo;
      }
      add(id, lato === 'attivo' ? importo : -importo);
      continue;
    }
    const valore = senzaSegno
      ? Math.abs(conto.saldo)
      : cat.natura === 'dare'
        ? conto.saldo
        : -conto.saldo;
    add(id, valore);
  }

  const v = (id: IdCategoria) => somma[id] ?? 0;

  const ricaviVendite = v('ricavi');
  const valoreProduzione = ricaviVendite + v('altri_ricavi');
  const ammortamenti = v('ammortamenti');
  const costiProduzione = v('costi_operativi') - v('rimanenze_finali_ce') + ammortamenti;
  const ebit = valoreProduzione - costiProduzione;
  const ebitda = ebit + ammortamenti;
  const oneriFinanziari = v('oneri_finanziari');
  const utileEsercizio = ebit + v('proventi_finanziari') - oneriFinanziari - v('imposte');

  const immobilizzazioni = v('immobilizzazioni') - v('fondi_ammortamento');
  const creditiClienti = v('crediti_clienti') - v('fondo_svalutazione_crediti');
  const disponibilitaLiquide = v('disponibilita_liquide') + bancaAttivo;
  const attivoCircolante =
    v('rimanenze_sp') +
    creditiClienti +
    v('altri_crediti') +
    erarioAttivo +
    entiAttivo +
    disponibilitaLiquide +
    v('ratei_risconti_attivi');
  const totaleAttivo = immobilizzazioni + attivoCircolante;

  const patrimonioNetto = v('patrimonio_netto') - v('perdite_pregresse') + utileEsercizio;
  const debitiBanche = v('debiti_banche_breve') + v('debiti_banche_ml') + bancaPassivo;
  const debitiFornitori = v('debiti_fornitori');
  const debitiTributari = v('debiti_tributari') + erarioPassivo;
  const debitiPrevidenziali = v('debiti_previdenziali') + entiPassivo;
  const totaleDebiti =
    debitiBanche + debitiFornitori + debitiTributari + debitiPrevidenziali + v('altri_debiti');
  const passivoCorrente = totaleDebiti - v('debiti_banche_ml');

  const passivoENetto =
    patrimonioNetto + totaleDebiti + v('fondi_tfr_rischi') + v('ratei_risconti_passivi');
  const differenza = arrotonda(totaleAttivo - passivoENetto);
  const tolleranza = Math.max(1, Math.abs(totaleAttivo) * 0.001);

  const dati: DatiFinanziariPeriodo = {
    ricaviVendite: arrotonda(ricaviVendite),
    valoreProduzione: arrotonda(valoreProduzione),
    costiProduzione: arrotonda(costiProduzione),
    ebit: arrotonda(ebit),
    ammortamenti: arrotonda(ammortamenti),
    ebitda: arrotonda(ebitda),
    oneriFinanziari: arrotonda(oneriFinanziari),
    utileEsercizio: arrotonda(utileEsercizio),
    totaleAttivo: arrotonda(totaleAttivo),
    attivoCircolante: arrotonda(attivoCircolante),
    disponibilitaLiquide: arrotonda(disponibilitaLiquide),
    immobilizzazioni: arrotonda(immobilizzazioni),
    patrimonioNetto: arrotonda(patrimonioNetto),
    totaleDebiti: arrotonda(totaleDebiti),
    debitiBanche: arrotonda(debitiBanche),
    debitiFornitori: arrotonda(debitiFornitori),
    debitiTributari: arrotonda(debitiTributari),
    debitiPrevidenziali: arrotonda(debitiPrevidenziali),
    passivoCorrente: arrotonda(passivoCorrente),
    creditiClienti: arrotonda(creditiClienti),
  };

  return {
    dati,
    perCategoria: Object.fromEntries(
      Object.entries(somma).map(([k, n]) => [k, arrotonda(n as number)])
    ),
    risultatoPeriodo: arrotonda(utileEsercizio),
    quadratura: {
      attivo: arrotonda(totaleAttivo),
      passivoENetto: arrotonda(passivoENetto),
      differenza,
      tolleranza: arrotonda(tolleranza),
      ok: Math.abs(differenza) <= tolleranza,
    },
    nonAssegnati,
    doppiaNaturaSenzaSegno,
  };
}
