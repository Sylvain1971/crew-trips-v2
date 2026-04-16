import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const url = `https://crew-trips-v2.vercel.app/trip/${code}/print?clean=1`

  try {
    const chromium = await import('@sparticuz/chromium')
    const puppeteer = await import('puppeteer-core')

    const browser = await puppeteer.default.launch({
      args: chromium.default.args,
      executablePath: await chromium.default.executablePath(),
      headless: true,
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 })
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
    await page.waitForSelector('.wrap', { timeout: 10000 })
    await new Promise(r => setTimeout(r, 1500))

    const contentHeight = await page.evaluate(() => {
      const el = document.querySelector('.wrap') as HTMLElement
      return el ? el.scrollHeight + 80 : document.body.scrollHeight + 80
    })

    const pdfBuffer = await page.pdf({
      width: '794px',
      height: `${contentHeight}px`,
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    })

    await browser.close()

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="crew-trip-${code}.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: 'Erreur generation PDF' }, { status: 500 })
  }
}
