// src/lib/fascicolo/impronta.ts
//
// Impronta SHA-256 di un file caricato: e' cio' che lega una riga del
// fascicolo di evidenza al documento da cui viene. Si calcola nel browser,
// prima dell'importazione, con l'API standard `crypto.subtle`: il file non
// viene mai inviato al server, solo nome, dimensione e impronta.

export interface DescrittoreDocumento {
  nomeFile: string;
  dimensione: number;
  /** SHA-256 in esadecimale minuscolo, 64 caratteri. */
  impronta: string;
}

export async function improntaFile(file: File): Promise<DescrittoreDocumento> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const impronta = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { nomeFile: file.name, dimensione: file.size, impronta };
}

export function improntaValida(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
}

/** Forma breve per l'interfaccia: le prime 12 cifre bastano a riconoscerla. */
export function improntaBreve(impronta: string): string {
  return impronta.slice(0, 12);
}
