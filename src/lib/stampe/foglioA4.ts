// src/lib/stampe/foglioA4.ts
//
// LO STILE DELLA CARTA — un solo posto (0.255.3).
//
// Due documenti escono su un foglio A4: il report della verifica
// amministrativa (più pagine) e quello dell'iconografia (un foglio solo). Fino
// a ieri ciascuno portava la propria copia di canvas, foglio, barra dei comandi
// e regole di stampa: due copie della stessa idea, libere di divergere alla
// prima correzione fatta solo a una delle due.
//
// Qui sta la parte che appartiene alla carta e non al contenuto: 210×297, ombra
// a schermo, margini della pagina fisica, che cosa sparisce in stampa. La
// tipografia del documento — tabelle, titoli, note — resta nei CSS delle due
// pagine, che è dove si legge.
//
// Funzione pura: produce il testo di un foglio di stile.

export interface StileFoglioA4 {
  /** Margini della pagina fisica, come li scrive @page. */
  marginePagina?: string;
  /** Riempimento del foglio a schermo: a stampa lo danno i margini di @page. */
  riempimento?: string;
  /** Dichiarazioni tipografiche del foglio (famiglia, corpo, interlinea). */
  tipografia?: string;
  /** Testata e piede ricorrenti a ogni pagina, con lo scarto che li porta nei margini. */
  ricorrenti?: { sopra: string; sotto: string };
  /** Regole valide solo in stampa, aggiunte dentro il blocco @media print. */
  stampa?: string;
}

/** Testata e piede ricorrenti: `position: fixed` è ciò che i browser ripetono. */
function regoleRicorrenti({ sopra, sotto }: { sopra: string; sotto: string }): string {
  return `
  .foglio-testata { display: flex; position: fixed; top: ${sopra}; left: 0; right: 0;
    justify-content: space-between; align-items: baseline;
    font-size: 7pt; letter-spacing: .12em; text-transform: uppercase; color: #64748b;
    border-bottom: .3mm solid #cbd5e1; padding-bottom: 1.5mm; }
  .foglio-piede { display: flex; position: fixed; bottom: ${sotto}; left: 0; right: 0;
    justify-content: space-between; font-size: 7pt; color: #64748b;
    border-top: .3mm solid #cbd5e1; padding-top: 1.5mm; }`;
}

export function stileFoglioA4({
  marginePagina = '9mm 10mm',
  riempimento = '9mm 10mm',
  tipografia = '',
  ricorrenti,
  stampa = '',
}: StileFoglioA4 = {}): string {
  return `
.foglio-canvas { background: #e2e8f0; min-height: 100vh; padding: 20px 12px 56px; }
.foglio-barra { position: fixed; top: 14px; right: 16px; display: flex; gap: 8px; z-index: 20; }
.foglio {
  width: 210mm; min-height: 297mm; margin: 0 auto; padding: ${riempimento};
  background: #fff; color: #0f172a; box-shadow: 0 10px 30px rgba(15, 23, 42, .18);
  ${tipografia}
}
.foglio-testata, .foglio-piede { display: none; }

@media print {
  @page { size: A4; margin: ${marginePagina}; }
  html, body { background: #fff !important; }
  .foglio-canvas { background: #fff; padding: 0; min-height: 0; }
  .foglio { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
  .foglio-barra { display: none !important; }
  a { color: inherit; text-decoration: none; }
  ${ricorrenti ? regoleRicorrenti(ricorrenti) : ''}
  ${stampa}
}
`;
}
