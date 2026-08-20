import { SezioneInCostruzione } from '@/components/spazio/SezioneInCostruzione';

export default function NormativaPage() {
  return (
    <SezioneInCostruzione
      titolo="Normativa CCII"
      descrizione="Testo normativo, glossario e soglie ufficiali, consultabili da ogni utente dello spazio."
      puntiChiave={[
        'Testo del CCII e decreti attuativi, navigabile per articolo',
        'Glossario dei termini chiave (DSCR, EBITDA, Cram Down...)',
        'Soglie e parametri ufficiali aggiornati',
        'Collegamento contestuale dai report ai riferimenti normativi',
      ]}
    />
  );
}
