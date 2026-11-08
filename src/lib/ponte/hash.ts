// src/lib/ponte/hash.ts
//
// Impronta canonica degli input e dell'output del Ponte. Serve a rispondere a
// una domanda sola: «questa versione è stata calcolata su questi dati?». Un
// hash che cambia quando cambia l'ordine delle chiavi non sarebbe una prova,
// quindi gli oggetti si serializzano con le chiavi ordinate.

import { createHash } from 'node:crypto';

function canonico(valore: unknown): string {
  if (valore === null || typeof valore !== 'object') return JSON.stringify(valore);
  if (Array.isArray(valore)) return `[${valore.map(canonico).join(',')}]`;
  const record = valore as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonico(record[k])}`)
    .join(',')}}`;
}

export function hashJson(valore: unknown): string {
  return createHash('sha256').update(canonico(valore)).digest('hex');
}

export function calcolaHashInput(input: unknown): string {
  return hashJson(input);
}

export function calcolaHashOutput(output: unknown): string {
  return hashJson(output);
}
