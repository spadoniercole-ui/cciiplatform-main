// src/lib/xbrl/index.ts
//
// PUNTO DI INGRESSO UNICO per l'analisi di un file XBRL.
// Ogni componente/route che deve leggere un bilancio XBRL chiama
// SOLO analizzaFileXbrl(...) da qui. Non reintrodurre parsing/regex
// paralleli altrove: se manca un tag, si aggiunge un alias in
// src/db/sql/xbrl_tag_mappings.sql (o al fallback in tagMapping.ts),
// non un nuovo motore.

import { parseIstanzaXbrl, pulisciTag } from './parser';
import { caricaMappingTag } from './tagMapping';
import { calcolaIndiciCcii, calcolaSeverity, calcolaAltriIndici } from './indici';
import { estraiCodiceAteco } from './ateco';
import type {
  AnalisiXbrlResult,
  DatiFinanziariPeriodo,
  FactNonMappato,
  FactRisolto,
  Periodo,
  SituazioneDebitoria,
} from './types';

function datiFinanziariVuoti(): DatiFinanziariPeriodo {
  return {
    ricaviVendite: 0,
    valoreProduzione: 0,
    costiProduzione: 0,
    ebit: 0,
    ammortamenti: 0,
    ebitda: 0,
    oneriFinanziari: 0,
    utileEsercizio: 0,
    totaleAttivo: 0,
    attivoCircolante: 0,
    disponibilitaLiquide: 0,
    immobilizzazioni: 0,
    patrimonioNetto: 0,
    totaleDebiti: 0,
    debitiBanche: 0,
    debitiFornitori: 0,
    debitiTributari: 0,
    debitiPrevidenziali: 0,
    passivoCorrente: 0,
    creditiClienti: 0,
  };
}

function normalizzaPeriodo(d: DatiFinanziariPeriodo): DatiFinanziariPeriodo {
  const valoreProduzione = d.valoreProduzione || d.ricaviVendite;
  const ebit = d.ebit || valoreProduzione - d.costiProduzione;
  const ebitda = d.ebitda || ebit + d.ammortamenti;
  return { ...d, valoreProduzione, ebit, ebitda };
}

export async function analizzaFileXbrl(
  xmlContent: string,
  nomeFile: string
): Promise<AnalisiXbrlResult> {
  const warnings: string[] = [];

  const { facts, contextPeriodo, anagraficaGrezza, annoBilancio } = parseIstanzaXbrl(xmlContent);
  const { mappa: mappingTag, usatoFallback, chiaviNonRiconosciute } = await caricaMappingTag();

  if (usatoFallback) {
    warnings.push(
      'Mapping tag caricato dal fallback statico: la tabella xbrl_tag_mappings su DB non è raggiungibile o è vuota. Copertura tag ridotta.'
    );
  }

  if (chiaviNonRiconosciute.length > 0) {
    warnings.push(
      `Attenzione: la tabella xbrl_tag_mappings contiene ${chiaviNonRiconosciute.length} chiave/i canonica/che non riconosciuta/e dal motore (${chiaviNonRiconosciute.join(', ')}). I tag associati a queste chiavi vengono letti dal file ma il loro valore non arriva in nessun campo del bilancio: correggerle in tabella con il nome esatto del campo (es. "totaleDebiti", non "totale_debiti").`
    );
  }

  const perPeriodo: Record<Periodo, Partial<DatiFinanziariPeriodo>> = {
    corrente: {},
    precedente: {},
  };
  const factNonMappati: FactNonMappato[] = [];
  const tuttiIFact: FactRisolto[] = [];
  let factSenzaContestoRiconosciuto = 0;

  for (const fact of facts) {
    const chiave = mappingTag[fact.tagPulito];
    const periodo = contextPeriodo[fact.contextRef];

    tuttiIFact.push({
      tagPulito: fact.tagPulito,
      tagOriginale: fact.tagOriginale,
      contextRef: fact.contextRef,
      periodo: periodo || null,
      valore: fact.valore,
      chiaveMappata: chiave || null,
    });

    if (!chiave) {
      // Tag non riconosciuto: candidato per la UI di parificazione manuale.
      // Filtriamo lo zero per non intasare la lista con fact irrilevanti.
      if (fact.valore !== 0) {
        factNonMappati.push({
          tagGrezzo: fact.tagOriginale,
          tagPulito: fact.tagPulito,
          contextRef: fact.contextRef,
          valore: fact.valore,
        });
      }
      continue;
    }

    if (!periodo) {
      factSenzaContestoRiconosciuto++;
      continue;
    }

    const bucket = perPeriodo[periodo] as Record<string, number>;
    // Non sovrascrivere un valore già trovato con uno zero (alcuni bilanci
    // ripetono lo stesso tag su più contesti, es. dimensionale/nil).
    if (fact.valore !== 0 || bucket[chiave] === undefined) {
      bucket[chiave] = fact.valore;
    }
  }

  if (factSenzaContestoRiconosciuto > 0) {
    warnings.push(
      `${factSenzaContestoRiconosciuto} fact mappati non sono stati assegnati a nessun periodo (contextRef non riconducibile ad anno corrente/precedente).`
    );
  }

  const corrente = normalizzaPeriodo({ ...datiFinanziariVuoti(), ...perPeriodo.corrente });
  const precedente = normalizzaPeriodo({ ...datiFinanziariVuoti(), ...perPeriodo.precedente });

  const anagraficaIncompleta = !anagraficaGrezza.ragioneSociale || !anagraficaGrezza.codiceFiscale;
  if (anagraficaIncompleta) {
    warnings.push(
      'Anagrafica incompleta: ragione sociale o codice fiscale non trovati nel file. Verificare manualmente prima di procedere.'
    );
  }

  const indici = calcolaIndiciCcii(corrente);
  const altriIndici = calcolaAltriIndici(corrente);
  const severity = calcolaSeverity(indici, corrente.patrimonioNetto);

  const altriDebiti = Math.max(
    0,
    corrente.totaleDebiti -
      corrente.debitiBanche -
      corrente.debitiFornitori -
      corrente.debitiTributari -
      corrente.debitiPrevidenziali
  );
  const situazioneDebitoria: SituazioneDebitoria = {
    debitiBanche: corrente.debitiBanche,
    debitiFornitori: corrente.debitiFornitori,
    debitiTributari: corrente.debitiTributari,
    debitiPrevidenziali: corrente.debitiPrevidenziali,
    altriDebiti,
    totaleDebiti: corrente.totaleDebiti,
    disponibilitaLiquide: corrente.disponibilitaLiquide,
    pfn: corrente.debitiBanche - corrente.disponibilitaLiquide,
  };

  const hasContoEconomico =
    corrente.ricaviVendite !== 0 ||
    corrente.valoreProduzione !== 0 ||
    corrente.costiProduzione !== 0;

  return {
    meta: {
      nomeFile,
      usatoFallbackMapping: usatoFallback,
      numeroFactTotali: facts.length,
      numeroFactNonMappati: factNonMappati.length,
    },
    anagrafica: {
      ragioneSociale: anagraficaGrezza.ragioneSociale || '',
      codiceFiscale: anagraficaGrezza.codiceFiscale || '',
      indirizzo: anagraficaGrezza.indirizzo || '',
      codiceAteco:
        estraiCodiceAteco(anagraficaGrezza.codiceAteco) || anagraficaGrezza.codiceAteco || '',
      anagraficaIncompleta,
    },
    annoBilancio,
    corrente,
    precedente,
    indici,
    altriIndici,
    severity,
    situazioneDebitoria,
    hasContoEconomico,
    factNonMappati: factNonMappati
      .sort((a, b) => Math.abs(b.valore) - Math.abs(a.valore))
      .slice(0, 50),
    tuttiIFact: tuttiIFact
      .filter((f) => f.valore !== 0)
      .sort((a, b) => Math.abs(b.valore) - Math.abs(a.valore))
      .slice(0, 300),
    warnings,
  };
}

export { pulisciTag };
