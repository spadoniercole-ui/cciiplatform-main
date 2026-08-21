// Copyright mostrato nel login e nelle pagine del programma.
//
// Testo configurabile via variabile d'ambiente NEXT_PUBLIC_COPYRIGHT (deve
// avere il prefisso NEXT_PUBLIC_ per essere leggibile anche lato browser; è
// inlinata al build). Il segnaposto {year} / {anno} viene sostituito con
// l'anno corrente al momento del render. Se la variabile non è impostata si
// usa il default qui sotto.
//
// Per impostarlo: in locale nel file .env (NON committato), su Vercel nelle
// Environment Variables del progetto. Esempio:
//   NEXT_PUBLIC_COPYRIGHT=© {year} Ercole Spadoni — Tutti i diritti riservati

const DEFAULT_COPYRIGHT = '© {year} Ercole Spadoni — Tutti i diritti riservati';

export function testoCopyright(): string {
  const raw = process.env.NEXT_PUBLIC_COPYRIGHT || DEFAULT_COPYRIGHT;
  const anno = String(new Date().getFullYear());
  return raw.replace(/\{year\}/gi, anno).replace(/\{anno\}/gi, anno);
}
