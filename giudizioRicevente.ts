import { SezioneInCostruzione } from '@/components/spazio/SezioneInCostruzione';

export default function XbrlSpazioPage() {
  return (
    <SezioneInCostruzione
      titolo="Import XBRL per Azienda"
      descrizione="Caricamento bilanci XBRL riferiti a una specifica azienda dello spazio."
      puntiChiave={[
        'Staging del file caricato, con stato PENDING_VALIDATION',
        'Parsing e griglia di mappatura (tag trovato vs tag atteso)',
        'Profilo di mappatura riutilizzabile per bilanci futuri della stessa azienda',
        'Gestione catena annualità e riconciliazione',
        'Alimentazione automatica degli indici dopo il caricamento',
      ]}
    />
  );
}
