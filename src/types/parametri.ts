// src/types/parametri.ts
export interface ParametroSistema {
  id: string;
  codice: string;
  descrizione: string;
  valore: string;
  unitaMisura: string;
  categoria: 'LOCALIZZAZIONE' | 'BACKUP';
}
