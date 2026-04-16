import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  // Generer une page HTML autonome avec le CSS pour PDF continu
  // Le navigateur peut l'enregistrer directement via Ctrl+P -> Enregistrer en PDF
  const printUrl = `https://crew-trips-v2.vercel.app/trip/${code}/print?clean=1&autoprint=1`

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=${printUrl}">
  <style>
    @media print {
      @page { size: 21cm 99999cm; margin: 15mm 15mm; }
    }
  </style>
  <script>
    // Injecter le style @page avant la redirection
    const style = document.createElement('style');
    style.textContent = '@media print { @page { size: 21cm 99999cm; margin: 15mm 15mm; } }';
    document.head.appendChild(style);
    window.location.href = '${printUrl}';
  </script>
</head>
<body></body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}
