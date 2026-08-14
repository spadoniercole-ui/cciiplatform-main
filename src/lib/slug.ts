// src/lib/slug.ts
//
// Riduce un testo a un blocco maiuscolo alfanumerico, per generare codici
// "parlanti" (leggibili a colpo d'occhio: es. "STUDIOROSSI" invece di un
// progressivo opaco) usati sia per il codice spazio che per la chiave di
// licenza commerciale. In un file separato perché è usata da più file
// 'use server' (licenze.ts, spazi.ts) e i file 'use server' possono
// esportare solo funzioni async: una utility sincrona qui dentro fa
// fallire la build.

export function generaSlug(testo: string, lunghezzaMax: number): string {
  const slug = (testo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // rimuove accenti
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, lunghezzaMax);
  return slug || 'CLIENTE';
}
