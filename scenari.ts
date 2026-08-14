import { redirect } from 'next/navigation';
import { ottieniContestoAccessoSpazio, esciDaSalvagenteAction } from '@/app/actions/spazi';
import { SidebarSpazio } from '@/components/spazio/SidebarSpazio';
import { TopStatusBar } from '@/components/brand/TopStatusBar';
import { ChatbotAiuto } from '@/components/ChatbotAiuto';
import { ContestoAssistenteProvider } from '@/components/ContestoAssistenteContext';
import { ShieldAlert } from 'lucide-react';

// Layout del Pannello Spazio: un solo punto di controllo d'accesso, valido
// sia per il superadmin in modalità salvagente sia per un vero Admin di
// Spazio autenticato — vedi ottieniContestoAccessoSpazio in actions/spazi.ts.
// Tutte le pagine sotto /spazio/[codice]/* condividono questo
// stesso controllo, non uno diverso per ciascuna.

export default async function LayoutSpazio({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ codice: string }>;
}) {
  const { codice } = await params;
  const contesto = await ottieniContestoAccessoSpazio(codice);

  if (!contesto) {
    redirect('/');
  }

  if (
    (contesto.modalita === 'ADMIN_SPAZIO' || contesto.modalita === 'OPERATORE') &&
    contesto.richiedeCambioPassword
  ) {
    redirect(`/cambio-password/${codice}`);
  }

  return (
    <ContestoAssistenteProvider>
      <div className="flex h-screen bg-slate-50">
        <SidebarSpazio
          codice={contesto.codice}
          descrizione={contesto.descrizione}
          modalita={contesto.modalita}
          permessi={contesto.permessi}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          {contesto.modalita === 'SALVAGENTE' && (
            <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-6 py-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span className="font-bold uppercase tracking-wider">Modalità Ispezione</span>
                <span>— stai operando come rete di sicurezza, non come l&apos;admin reale.</span>
              </div>
              <form
                action={async () => {
                  'use server';
                  await esciDaSalvagenteAction();
                  redirect('/superadmin/Spazi');
                }}
              >
                <button
                  type="submit"
                  className="text-amber-800 hover:text-amber-900 font-bold uppercase text-[10px] underline"
                >
                  Esci dall&apos;ispezione
                </button>
              </form>
            </div>
          )}

          {(contesto.modalita === 'ADMIN_SPAZIO' || contesto.modalita === 'OPERATORE') && (
            <TopStatusBar
              nomeUtente={contesto.descrizione}
              ruolo={contesto.modalita === 'ADMIN_SPAZIO' ? 'Admin di Spazio' : 'Operatore'}
            />
          )}

          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
        <ChatbotAiuto />
      </div>
    </ContestoAssistenteProvider>
  );
}
