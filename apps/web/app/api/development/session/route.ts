
import { NextRequest, NextResponse } from 'next/server';
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.DEVELOPMENT_WORKSPACE !== 'true' ||
    !process.env.DEV_OWNER_TOKEN
  )
    return NextResponse.json({ message: 'Sessão de desenvolvimento indisponível.' }, { status: 403 });
  if (
    request.headers.get('x-eimax-client') !== 'workspace' ||
    (origin && !['http://localhost:3000', 'http://127.0.0.1:3000', process.env.WEB_ORIGIN].includes(origin))
  )
    return NextResponse.json({ message: 'Origem inválida.' }, { status: 403 });
  const response = NextResponse.json({ mode: 'local-development', role: 'owner' });
  if (!request.cookies.has('eimax_session'))
    response.cookies.set('eimax_session', process.env.DEV_OWNER_TOKEN, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 86400,
    });
  return response;
}
