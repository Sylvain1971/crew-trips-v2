'use client'
import { useMemo } from 'react'

// Rendu fidèle du contenu collé depuis Excel (tabs = indentation + alignement colonnes).
// Prop printMode : force des couleurs noires sur fond blanc pour la page /print.
export default function CardContent({ contenu, printMode = false }: { contenu: string, printMode?: boolean }) {
  const parsed = useMemo(() => {
    if (!contenu.includes('\t')) return null
    const allLines = contenu.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    while (allLines.length && allLines[allLines.length - 1].trim() === '') allLines.pop()

    const parsedLines = allLines.map(line => {
      const leadTabs = line.match(/^\t*/)?.[0].length ?? 0
      const cells = line.replace(/^\t+/, '').split('\t').map(c => c.trim())
      const nonEmpty = cells.filter(Boolean)
      return { leadTabs, nonEmpty }
    })

    const multiLines = parsedLines.filter(l => l.nonEmpty.length >= 2)
    const maxCol1Chars = multiLines.reduce((m, l) => Math.max(m, l.nonEmpty[0]?.length ?? 0), 0)
    const maxCol2Chars = multiLines.reduce((m, l) => Math.max(m, l.nonEmpty[1]?.length ?? 0), 0)
    const col1Width = `${Math.max(maxCol1Chars * 7.5 + 16, 80)}px`
    const col2Width = `${Math.max(maxCol2Chars * 7.5 + 16, 60)}px`

    return { parsedLines, col1Width, col2Width }
  }, [contenu])

  // Palette : mode app (CSS vars) vs mode print (couleurs fixes)
  const colText = printMode ? '#111' : 'var(--text)'
  const colText2 = printMode ? '#374151' : 'var(--text-2)'
  const colText3 = printMode ? '#6b7280' : 'var(--text-3)'

  if (!parsed) {
    return (
      <div style={{ fontSize: 13, color: colText2, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
        {contenu}
      </div>
    )
  }

  const { parsedLines, col1Width, col2Width } = parsed

  return (
    <div style={{ fontSize: 13, color: colText2, lineHeight: 1.6, marginTop: 4 }}>
      {parsedLines.map((l, i) => {
        if (l.nonEmpty.length === 0) return <div key={i} style={{ height: 6 }} />
        if (l.nonEmpty.length === 1) return (
          <div key={i} style={{ paddingLeft: l.leadTabs * 18, marginBottom: 1 }}>
            {l.nonEmpty[0]}
          </div>
        )
        return (
          <div key={i} style={{ paddingLeft: l.leadTabs * 18, display: 'flex', marginBottom: 1 }}>
            {l.nonEmpty.map((cell, ci) => (
              <span key={ci} style={{
                display: 'inline-block',
                width: ci === 0 ? col1Width : ci === 1 ? col2Width : 'auto',
                flexShrink: 0,
                paddingRight: 12,
                color: ci === 0 ? colText3 : colText,
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}>{cell}</span>
            ))}
          </div>
        )
      })}
    </div>
  )
}
