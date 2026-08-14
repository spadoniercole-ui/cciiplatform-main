import { SezioneInCostruzione } from '@/components/spazio/SezioneInCostruzione';

export default function ReportSpazioPage() {
  return (
    <SezioneInCostruzione
      titolo="Generazione Report"
      descrizione="Cinque tipologie: Consulenziale, Relazione Narrativa, Trend Analysis, Cram Down vs Liquidazione Giudiziale, Documenti Legali."
      puntiChiave={[
        'Selezione tipologia e dati sorgente (azienda, periodo, check list)',
        'Generazione automatica da template',
        'Revisione e personalizzazione prima della finalizzazione',
        'Finalizzazione: il report diventa immutabile',
        'Documenti per Tribunale e Creditori, con tracciamento notifiche',
      ]}
    />
  );
}
