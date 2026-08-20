import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { TopStatusBar } from '@/components/brand/TopStatusBar';
import { pool } from '@/lib/db';

// Verifica reale della sessione (tabella `sessioni`, vedi src/db/sql/sessioni.sql).
// In precedenza qui si controllava se il cookie fosse esattamente la stringa
// costante 'TOKEN_GHOST_SUPERADMIN_SYSTEM': chiunque conoscesse quella
// stringa (bastava leggere il codice sorgente) otteneva accesso superadmin
// senza autenticarsi. Ora si verifica un token casuale contro il DB, con
// scadenza.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;

  if (!sessionToken) {
    redirect('/');
  }

  const risultato = await pool.query(
    'SELECT ruolo, workspace_id, expires_at FROM sessioni WHERE token = $1',
    [sessionToken]
  );

  if (risultato.rows.length === 0 || new Date(risultato.rows[0].expires_at) < new Date()) {
    redirect('/');
  }

  const ruolo: 'SUPERADMIN' | 'USER' =
    risultato.rows[0].ruolo === 'SUPERADMIN' ? 'SUPERADMIN' : 'USER';

  // Il superadmin di sistema opera sempre con licenza attiva (è chi la
  // gestisce). Per gli utenti tenant, la licenza è oggi un'unica riga
  // globale (vedi ModuloLicenza.tsx / src/app/actions/licenze.ts): quando
  // verrà introdotto il multi-tenant reale con più workspace indipendenti,
  // qui andrà aggiunta una verifica di licenza per singolo workspace.
  const licenzaAttiva = true;

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <Sidebar ruoloUtente={ruolo} licenzaAttiva={licenzaAttiva} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopStatusBar nomeUtente="Superadmin" ruolo={ruolo} variante="scuro" />
        <main className="flex-1 overflow-y-auto p-8 text-white">{children}</main>
      </div>
    </div>
  );
}
