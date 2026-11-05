// src/lib/demo/legacy.ts
//
// I NOMI DELLE AZIENDE DEMO DA RIMUOVERE (0.171.0 e prova Cram down).
//
// Il set «provvedimenti del giudice» creava sei aziende con i PDF. È stato
// sostituito dal percorso unico che parte dal triage: all'attivazione del
// flag demo queste aziende vengono rimosse, se presenti, per non lasciare
// due percorsi nello stesso spazio. Con loro se ne va CROWDOWN S.R.L., la
// prova «salute azienda Cram down» creata a mano nello spazio demo: era
// l'altra metà del vecchio ambiente e teneva in vita un report PDF separato.
// I nomi sono esatti e volutamente circoscritti: nessun'altra azienda viene
// toccata.

export const AZIENDE_VECCHIO_SET_DEMO: string[] = [
  'CROWDOWN S.R.L.',
  'Calzaturificio Brenta Demo S.r.l.',
  'Tessitura Serica Comasca Demo S.p.A.',
  'Costruzioni Adriatica Demo S.r.l.',
  'Officine Meccaniche Venete Demo S.r.l.',
  'Agroalimentare Salento Demo S.r.l.',
  'Logistica Tirrena Demo S.p.A.',
];
