import dynamicParams from '@/lib/constants/ccii-thresholds.json';

export async function GET() {
  // Quando il DB sarà pronto, farai una query. Finora restituisci il JSON isolato.
  return NextResponse.json(dynamicParams);
}