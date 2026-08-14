import { NextResponse } from 'next/server';

export async function GET() {
  const configurazioneCCII = {
    soglieGenerali: {
      dscrMinimo: 1.0,
      ebitdaMinimo: 5000.0,
      sogliaIvaScaduta: 20000.0,
      sogliaInpsScaduta: 15000.0,
    },
    benchmarkAteco: {
      C: {
        oneriRicavi: 0.03,
        leverage: 4.0,
        liquidita: 0.85,
        patrimonioDebiti: 0.05,
        ritornoAttivo: 0.02,
      },
    },
  };

  return NextResponse.json(configurazioneCCII);
}
