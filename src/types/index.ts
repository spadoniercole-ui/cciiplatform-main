export type TipologiaGiuridica =
  | 'ENTE'
  | 'STUDIO PROFESSIONALE'
  | 'AZIENDA'
  | 'ASSOCIAZIONE DI CATEGORIA'
  | 'AVVOCATO/PROFESSIONISTA';

export interface DatiAnagraficaLicenza {
  cognomeRagioneSociale: string;
  nome: string;
  codiceFiscale: string;
  partitaIva: string;
  citta: string;
  indirizzo: string;
  cap: string;
  provincia: string;
  emailCertificataPEC: string;
  flagSedeLegale: boolean;
}

export interface DatiParametriLicenza {
  maxSpazi: number;
  maxAziende: number;
  maxUtenti: number;
  dataAttivazione: string;
  dataScadenza: string;
  dataSospensione: string;
  dataRiattivazione: string;
  flagDisattiva: boolean;
}

export interface RecordStoricoLicenza {
  id: string;
  tipoEvento:
    'ATTIVAZIONE' | 'SOSPENSIONE' | 'RIATTIVAZIONE' | 'CONFIGURAZIONE_LIMITI' | 'REVISIONE_CRITICA';
  dataEvento: string;
  operatore: string;
  note: string;
  ipEsecuzione: string;
}

// (Qui andranno accodate in seguito anche le interfacce di Soglie, RBAC, Spazi e XBRL)
