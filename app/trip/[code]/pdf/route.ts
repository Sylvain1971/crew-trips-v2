import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  // Rediriger vers la page print clean avec instructions
  // La generation PDF via API necessite un plan Vercel Pro (Puppeteer)
  // Sur Hobby: rediriger vers la page print avec ?clean=1
  return NextResponse.redirect(
    new URL(`/trip/${code}/print?clean=1`, req.url)
  )
}
