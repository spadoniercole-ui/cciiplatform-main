// src/lib/checklist/excelModello.ts
//
// Costruzione di un modello di Check List via Excel — a differenza della
// versione precedente, le colonne NON sono più a posizione fissa: solo i
// campi ATTIVI (configurati per questo spazio) compaiono, in più i campi
// extra propri dell'ente. "Domanda" è sempre presente; "Peso" è sempre
// l'ultima colonna, se attiva. Il parsing in import legge per POSIZIONE
// RELATIVA all'elenco colonne effettivamente configurato — non per testo
// di intestazione (le etichette sono personalizzabili) né per indice
// fisso nel codice (le colonne stesse sono variabili).
//
// Comportamento di ripiego per i campi disattivati, quando si importa:
//  - sezione (numero+titolo): tutte le domande finiscono in un'unica
//    sezione generata automaticamente.
//  - ID domanda: generato in ordine (1, 2, 3...).
//  - peso: ogni domanda prende il peso di default configurato.
//  - a cura di / nota: assenti, nessun valore.

import * as XLSX from 'xlsx';
import type { SezioneChecklist, DomandaChecklist, PesoDomanda } from './ministeriale';
import type {
  CampoColonnaChecklist,
  EtichettaColonnaChecklist,
  CampoExtraChecklist,
} from '@/app/actions/checklistColonneConfig';
import { ORDINE_CAMPI_BASE_CHECKLIST } from '@/lib/costantiRicevibilita';

function nomeFileSicuro(testo: string): string {
  return (testo || 'modello_checklist')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

type SlotColonna =
  | { tipo: 'base'; campo: CampoColonnaChecklist; etichetta: string }
  | { tipo: 'extra'; id: number; etichetta: string };

function costruisciOrdineColonne(
  colonne: EtichettaColonnaChecklist[],
  campiExtra: CampoExtraChecklist[]
): SlotColonna[] {
  const mappaColonne = new Map(colonne.map((c) => [c.campo, c]));
  const slot: SlotColonna[] = [];

  for (const campo of ORDINE_CAMPI_BASE_CHECKLIST) {
    if (campo === 'peso') continue;
    const config = mappaColonne.get(campo);
    if (config?.attivo) {
      slot.push({ tipo: 'base', campo, etichetta: config.etichetta });
    }
  }
  for (const extra of campiExtra) {
    slot.push({ tipo: 'extra', id: extra.id, etichetta: extra.etichetta });
  }
  const configPeso = mappaColonne.get('peso');
  if (configPeso?.attivo ?? true) {
    slot.push({ tipo: 'base', campo: 'peso', etichetta: configPeso?.etichetta || 'Peso' });
  }
  return slot;
}

function valoreSlot(
  slot: SlotColonna,
  sezione: SezioneChecklist,
  domanda: DomandaChecklist
): string {
  if (slot.tipo === 'extra') return domanda.extra?.[slot.id] || '';
  switch (slot.campo) {
    case 'sezioneNumero':
      return sezione.numero;
    case 'sezioneTitolo':
      return sezione.titolo;
    case 'domandaId':
      return domanda.id;
    case 'domanda':
      return domanda.domanda;
    case 'peso':
      return domanda.peso;
    case 'aCuraDi':
      return domanda.aCuraDi;
    case 'nota':
      return domanda.indicazioneSeNo || '';
    default:
      return '';
  }
}

export function esportaModelloChecklistExcel(
  nome: string,
  sezioni: SezioneChecklist[],
  colonne: EtichettaColonnaChecklist[],
  campiExtra: CampoExtraChecklist[]
): void {
  const slotColonne = costruisciOrdineColonne(colonne, campiExtra);
  const intestazioni = slotColonne.map((s) => {
    if (s.tipo === 'extra') return s.etichetta;
    if (s.campo === 'peso') return `${s.etichetta} (STRUTTURALE / RILEVANTE / DOCUMENTALE)`;
    if (s.campo === 'aCuraDi') return `${s.etichetta} (imprenditore / esperto)`;
    return s.etichetta;
  });

  const campiAttivi = new Set(
    slotColonne
      .filter((s): s is Extract<SlotColonna, { tipo: 'base' }> => s.tipo === 'base')
      .map((s) => s.campo)
  );
  const noteIstruzioni: string[] = ['Una riga per domanda.'];
  if (campiAttivi.has('sezioneNumero')) {
    noteIstruzioni.push(
      'La stessa sezione ripetuta su più righe consecutive resta nella stessa sezione.'
    );
  }
  if (campiAttivi.has('peso')) {
    noteIstruzioni.push('Peso: scrivere esattamente STRUTTURALE, RILEVANTE o DOCUMENTALE.');
  }
  if (campiAttivi.has('aCuraDi')) {
    noteIstruzioni.push('A cura di: imprenditore o esperto.');
  }

  const dati: (string | number)[][] = [[noteIstruzioni.join(' ')], intestazioni];

  for (const sezione of sezioni) {
    for (const domanda of sezione.domande) {
      dati.push(slotColonne.map((slot) => valoreSlot(slot, sezione, domanda)));
    }
  }
  if (sezioni.length === 0) {
    const esempio: Partial<Record<CampoColonnaChecklist, string>> = {
      sezioneNumero: '1',
      sezioneTitolo: 'Nome della sezione',
      domandaId: '1.1',
      domanda: 'Testo della domanda',
      peso: 'RILEVANTE',
      aCuraDi: 'esperto',
      nota: '',
    };
    dati.push(slotColonne.map((s) => (s.tipo === 'extra' ? '' : esempio[s.campo] || '')));
    for (let i = 0; i < 9; i++) dati.push(slotColonne.map(() => ''));
  }

  const foglio = XLSX.utils.aoa_to_sheet(dati);
  foglio['!cols'] = slotColonne.map((s) =>
    s.tipo === 'base' && s.campo === 'domanda' ? { wch: 50 } : { wch: 20 }
  );
  foglio['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(slotColonne.length - 1, 0) } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, foglio, 'Modello Check List');
  XLSX.writeFile(wb, `modello_checklist_${nomeFileSicuro(nome)}.xlsx`);
}

export interface RisultatoImportModello {
  sezioni: SezioneChecklist[];
  righeConErrore: { indice: number; motivo: string }[];
}

const PESI_VALIDI: PesoDomanda[] = ['STRUTTURALE', 'RILEVANTE', 'DOCUMENTALE'];
const SEZIONE_AUTOMATICA = { numero: '1', titolo: 'Domande' };

export async function importaModelloChecklistExcel(
  file: File,
  colonne: EtichettaColonnaChecklist[],
  campiExtra: CampoExtraChecklist[],
  pesoDefault: PesoDomanda
): Promise<RisultatoImportModello> {
  const slotColonne = costruisciOrdineColonne(colonne, campiExtra);
  const indiceDi = (campo: CampoColonnaChecklist) =>
    slotColonne.findIndex((s) => s.tipo === 'base' && s.campo === campo);
  const idxSezioneNumero = indiceDi('sezioneNumero');
  const idxSezioneTitolo = indiceDi('sezioneTitolo');
  const idxDomandaId = indiceDi('domandaId');
  const idxDomanda = indiceDi('domanda');
  const idxPeso = indiceDi('peso');
  const idxACuraDi = indiceDi('aCuraDi');
  const idxNota = indiceDi('nota');
  const slotExtra = slotColonne
    .map((s, i) => ({ s, i }))
    .filter(
      (x): x is { s: Extract<SlotColonna, { tipo: 'extra' }>; i: number } => x.s.tipo === 'extra'
    );

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const foglio = wb.Sheets[wb.SheetNames[0]];

  const intervallo = XLSX.utils.decode_range(foglio['!ref'] || 'A1');
  const cella = (riga: number, colonna: number) =>
    foglio[XLSX.utils.encode_cell({ r: riga, c: colonna })];
  const testoCella = (riga: number, colonna: number): string =>
    colonna < 0 ? '' : String(cella(riga, colonna)?.v ?? '').trim();

  const sezioniMappa = new Map<string, SezioneChecklist>();
  const righeConErrore: { indice: number; motivo: string }[] = [];
  let contatoreIdAutomatico = 1;

  for (let r = intervallo.s.r + 2; r <= intervallo.e.r; r++) {
    const domandaTesto = testoCella(r, idxDomanda);
    if (!domandaTesto) continue;

    const numeroSezione =
      idxSezioneNumero >= 0 ? testoCella(r, idxSezioneNumero) : SEZIONE_AUTOMATICA.numero;
    const titoloSezione =
      idxSezioneTitolo >= 0 ? testoCella(r, idxSezioneTitolo) : SEZIONE_AUTOMATICA.titolo;
    const idDomanda =
      idxDomandaId >= 0 ? testoCella(r, idxDomandaId) : String(contatoreIdAutomatico);

    let peso: PesoDomanda = pesoDefault;
    if (idxPeso >= 0) {
      const pesoGrezzo = testoCella(r, idxPeso).toUpperCase();
      if (!PESI_VALIDI.includes(pesoGrezzo as PesoDomanda)) {
        righeConErrore.push({
          indice: r,
          motivo: `"${domandaTesto.slice(0, 40)}": peso "${pesoGrezzo}" non riconosciuto (STRUTTURALE/RILEVANTE/DOCUMENTALE)`,
        });
        continue;
      }
      peso = pesoGrezzo as PesoDomanda;
    }

    let aCuraDi: 'imprenditore' | 'esperto' = 'esperto';
    if (idxACuraDi >= 0) {
      const grezzo = testoCella(r, idxACuraDi).toLowerCase();
      if (grezzo !== 'imprenditore' && grezzo !== 'esperto') {
        righeConErrore.push({
          indice: r,
          motivo: `"${domandaTesto.slice(0, 40)}": "a cura di" non riconosciuto (imprenditore/esperto)`,
        });
        continue;
      }
      aCuraDi = grezzo;
    }

    const nota = idxNota >= 0 ? testoCella(r, idxNota) : '';
    const extra: Record<string, string> = {};
    for (const { s, i } of slotExtra) {
      const valore = testoCella(r, i);
      if (valore) extra[String(s.id)] = valore;
    }

    if (!sezioniMappa.has(numeroSezione)) {
      sezioniMappa.set(numeroSezione, {
        numero: numeroSezione,
        titolo: titoloSezione,
        domande: [],
      });
    }
    sezioniMappa.get(numeroSezione)!.domande.push({
      id: idDomanda,
      domanda: domandaTesto,
      peso,
      aCuraDi,
      ...(nota ? { indicazioneSeNo: nota } : {}),
      ...(Object.keys(extra).length > 0 ? { extra } : {}),
    });
    if (idxDomandaId < 0) contatoreIdAutomatico += 1;
  }

  return { sezioni: Array.from(sezioniMappa.values()), righeConErrore };
}
