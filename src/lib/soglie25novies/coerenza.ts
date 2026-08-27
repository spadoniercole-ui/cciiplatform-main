// src/lib/soglie25novies/coerenza.ts
//
// Controlli di COERENZA (non bloccanti) fra i valori inseriti a mano nella
// mappa «Soglie di segnalazione» e i dati oggettivi già presenti (Posizione
// Debitoria dell'ente e Posizione V.E.R.A.). Servono a intercettare, ai fini
// della verifica, disallineamenti come «l'anno di verifica non corrisponde al
// VERA» o «gli importi inseriti superano l'esposizione risultante dai dati».
//
// PRINCIPIO: mai bloccare. Il punto di partenza restano gli IMPORTI IMMESSI
// nella mappa (l'operatore li ha inseriti sapendo la fonte documentale); i
// controlli si limitano a segnalare gli scostamenti perché siano verificati.
//
// SULL'ANNO: l'anno di riferimento è quello dei contributi DOVUTI (base del
// 30%). I contributi SCADUTI di cui si verifica la soglia si riferiscono
// all'anno di riferimento + 1 (l'anno di verifica). La Posizione Debitoria
// porta una data per riga → se ne ricavano gli anni; il VERA no, quindi il
// controllo d'anno si fa solo sulla Debitoria (e lo si dichiara).

/** Anno di verifica = anno dei contributi scaduti = anno di riferimento + 1. */
export function annoVerifica(annoRiferimento: number | null): number | null {
  return annoRiferimento === null || Number.isNaN(annoRiferimento) ? null : annoRiferimento + 1;
}

export interface InputCoerenza {
  /** Somma degli importi «da segnalazione» inseriti nella mappa (contributi
   *  scaduti + premi INAIL + IVA scaduta + crediti affidati). */
  totaleImportiMappa: number;
  /** Almeno un importo è stato inserito nella mappa? */
  mappaCompilata: boolean;
  /** Anno di riferimento inserito (contributi dovuti). */
  annoRiferimento: number | null;
  /** Esposizione totale (saldo) dalla Posizione Debitoria dell'ente. null = assente. */
  totaleDebitoria: number | null;
  /** Anni presenti nella Posizione Debitoria (dalle date delle righe). */
  anniDebitoria: number[];
  /** Esposizione totale VERA (contabilizzato + da contabilizzare). null = assente. */
  totaleVera: number | null;
}

export interface EsitoCoerenza {
  /** Avvisi non bloccanti, in ordine di presentazione. */
  avvisi: string[];
  annoVerifica: number | null;
}

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;
// Tolleranza per non segnalare micro-arrotondamenti fra fonti diverse.
const TOLLERANZA = 1; // euro

export function calcolaCoerenza(input: InputCoerenza): EsitoCoerenza {
  const avvisi: string[] = [];
  const aVer = annoVerifica(input.annoRiferimento);

  // --- Coerenza d'anno (solo Posizione Debitoria) ------------------------
  if (aVer !== null) {
    if (input.anniDebitoria.length === 0) {
      avvisi.push(
        `Anno di verifica ${aVer} (anno di riferimento ${input.annoRiferimento} + 1): la Posizione Debitoria non porta date, quindi non è possibile confermare che i contributi scaduti si riferiscano al ${aVer}. Il VERA non espone l'anno per riga: verificare sul documento di origine.`
      );
    } else if (!input.anniDebitoria.includes(aVer)) {
      avvisi.push(
        `Anno di verifica ${aVer} NON presente tra gli anni della Posizione Debitoria (${input.anniDebitoria
          .slice()
          .sort()
          .join(
            ', '
          )}): i contributi scaduti dovrebbero riferirsi all'anno di riferimento + 1. Verificare la corrispondenza con VERA e posizione debitoria.`
      );
    }
  }

  // --- Coerenza degli importi (mappa vs dati oggettivi) ------------------
  const t = input.totaleImportiMappa;
  if (input.mappaCompilata) {
    if (input.totaleDebitoria !== null && t > input.totaleDebitoria + TOLLERANZA) {
      avvisi.push(
        `Gli importi inseriti nella mappa (${euro(t)}) superano l'esposizione totale della Posizione Debitoria (${euro(
          input.totaleDebitoria
        )}): verificare che gli importi da segnalazione siano un sottoinsieme del debito rilevato.`
      );
    }
    if (input.totaleVera !== null && t > input.totaleVera + TOLLERANZA) {
      avvisi.push(
        `Gli importi inseriti nella mappa (${euro(t)}) superano l'esposizione totale del VERA (${euro(
          input.totaleVera
        )}): verificare la corrispondenza con il file di origine.`
      );
    }
  } else {
    const espostaDebitoria = (input.totaleDebitoria ?? 0) > TOLLERANZA;
    const espostaVera = (input.totaleVera ?? 0) > TOLLERANZA;
    if (espostaDebitoria || espostaVera) {
      const fonti = [
        espostaDebitoria ? `Posizione Debitoria (${euro(input.totaleDebitoria as number)})` : null,
        espostaVera ? `VERA (${euro(input.totaleVera as number)})` : null,
      ]
        .filter(Boolean)
        .join(' e ');
      avvisi.push(
        `Nella mappa soglie non è stato inserito alcun importo, ma risulta un'esposizione da ${fonti}: compilare i valori da segnalazione per rendere valutabile l'art. 25-novies.`
      );
    }
  }

  return { avvisi, annoVerifica: aVer };
}
