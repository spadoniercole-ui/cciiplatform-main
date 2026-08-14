// src/lib/documentiCorredo/costanti.ts
//
// Metadati dei documenti di corredo alla proposta (percorso Redigente),
// condivisi tra l'azione server e il componente client — in un file
// separato (non 'use server') perché un file 'use server' può esportare
// solo funzioni async.

export type TipoDocumentoCorredo = 'ASSEVERAZIONE' | 'CONVOCAZIONE' | 'MEMORIA';

export interface MetaDocumentoCorredo {
  tipo: TipoDocumentoCorredo;
  titolo: string;
  /** Breve spiegazione mostrata sotto il titolo. */
  sottotitolo: string;
  /** true se il documento è, di regola, sempre pertinente; false se è "eventuale". */
  sempre: boolean;
}

export const DOCUMENTI_CORREDO: MetaDocumentoCorredo[] = [
  {
    tipo: 'ASSEVERAZIONE',
    titolo: 'Asseverazione del professionista',
    sottotitolo:
      'Attestazione di veridicità dei dati aziendali e di coerenza/sostenibilità del piano alla base della proposta.',
    sempre: true,
  },
  {
    tipo: 'CONVOCAZIONE',
    titolo: 'Lettera di convocazione dei creditori',
    sottotitolo:
      'Invito ai creditori ad avviare le trattative nell’ambito della composizione negoziata — eventuale.',
    sempre: false,
  },
  {
    tipo: 'MEMORIA',
    titolo: 'Memoria legale a supporto',
    sottotitolo:
      'Argomentazione giuridica a sostegno della proposta e della sua convenienza rispetto alla liquidazione — eventuale.',
    sempre: false,
  },
];
