import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose'; // Importiamo la libreria per verificare il token

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-key');

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('auth_token')?.value;

  // 1. Definiamo le rotte pubbliche
  const isLoginPage = pathname === '/login';

  // 2. Controllo Autenticazione (Il token esiste?)
  if (!token && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 3. Se loggato, verifica il ruolo (se necessario)
  if (token) {
    try {
      // Decodifichiamo il token per estrarre il payload (role, workspaceId, etc)
      const { payload } = await jwtVerify(token, SECRET_KEY);
      const role = payload.role as string;

      // PROTEZIONE PERMANENTE:
      // Se cerchi di accedere a /smistamento ma NON sei un SUPER_ADMIN
      if (pathname.startsWith('/smistamento') && role !== 'SUPER_ADMIN') {
        return NextResponse.redirect(new URL('/dashboard/unauthorized', request.url));
      }

      // Se sei loggato e sei al login, ti mandiamo dove di dovere
      if (isLoginPage) {
        return NextResponse.redirect(
          new URL(role === 'SUPER_ADMIN' ? '/smistamento' : '/dashboard', request.url)
        );
      }
    } catch (error) {
      // Se il token è scaduto o non valido, forza il logout
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('auth_token');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
