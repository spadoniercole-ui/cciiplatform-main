import ModuloParametri from '@/components/ModuloParametri';

// Le Server Action invocate da questa pagina ereditano il tetto di durata
// della pagina stessa. Senza questa riga vale il valore predefinito della
// piattaforma di hosting (una manciata di secondi): backup, verifica e
// ripristino del database lo superano su qualunque database reale, e una
// funzione che sfora non restituisce nulla — il browser mostra soltanto
// "An unexpected response was received from the server", senza indicare la
// causa. Le altre pagine con operazioni lunghe (Screening, Proposta,
// Relazione, Brogliaccio) lo dichiarano già; questa era rimasta indietro.
export const maxDuration = 300;

export default function ParametriPage() {
  return (
    <main className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-50">
      <ModuloParametri />
    </main>
  );
}
