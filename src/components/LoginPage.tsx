'use client';

import { useState, useEffect } from 'react';

export const dynamic = 'force-dynamic';

import { Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Qui inserirai la tua chiamata API reale (es: signIn da next-auth o fetch)
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulazione ritardo di rete

      toast.success('Accesso effettuato con successo!');
      // window.location.href = '/dashboard'; // Decommenta per reindirizzare
    } catch (error) {
      toast.error('Credenziali non valide o errore di sistema');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 p-4">
      <div className="w-full max-w-md bg-white/70 backdrop-blur-xl border border-white/50 shadow-2xl rounded-3xl p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Accedi al Sistema</h1>
          <p className="text-gray-500 mt-2 text-sm">Inserisci le credenziali per il portale CCII</p>
        </div>

        <form className="space-y-6" onSubmit={handleLogin}>
          {/* Email */}
          <div className="relative">
            <User className="absolute left-3 top-3 text-gray-400" size={18} />
            <input
              type="email"
              required
              placeholder="Email Amministratore"
              className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-3 text-gray-400" size={18} />
            <input
              type="password"
              required
              placeholder="Password"
              className="w-full pl-10 pr-4 py-3 bg-white/50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                Entra <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          CCII Platform © 2026 - Accesso Riservato
        </p>
      </div>
    </div>
  );
}
