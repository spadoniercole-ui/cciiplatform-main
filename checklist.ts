import { SezioneInCostruzione } from '@/components/spazio/SezioneInCostruzione';

export default function IndiciPage() {
  return (
    <SezioneInCostruzione
      titolo="Indici per Azienda"
      descrizione="Analisi quantitativa: indici finanziari calcolati dai bilanci XBRL, con benchmark ISTAT."
      puntiChiave={[
        'Elenco indici attivi a livello globale, con formula e ultimo valore calcolato',
        "Attivazione/disattivazione di singoli indici per l'azienda",
        "Personalizzazione delle soglie di giudizio per l'azienda",
        'Confronto con dati di settore ISTAT (per codice ATECO)',
        'Storicizzazione e confronto temporale tra annualità',
      ]}
    />
  );
}
