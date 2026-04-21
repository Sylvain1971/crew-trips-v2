'use client'
import { useMemo } from 'react'

// Rendu fidèle du contenu collé depuis Excel (tabs = indentation + alignement colonnes).
// Prop printMode : force des couleurs noires sur fond blanc pour la page /print.
//
// Layout : col1 (label) = largeur fixe plafonnée à 120px, col2+ (valeurs) prennent le reste.
// Évite le débordement quand un label est trop long ou qu'une valeur wrap mal.
const COL1_MAX_PX = 120

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

    // Largeur col1 : basée sur les labels courts uniquement (≤ 15 char),
    // plafonnée à COL1_MAX_PX. Les labels longs wrappent dans leur case.
    const shortLabels = parsedLines
      .filter(l => l.nonEmpty.length >= 2 && l.nonEmpty[0].length <= 15)
      .map(l => l.nonEmpty[0].length)
    const maxShort = shortLabels.length ? Math.max(...shortLabels) : 0
    const col1Width = `${Math.min(Math.max(maxShort * 7.5 + 16, 72), COL1_MAX_PX)}px`

    return { parsedLines, col1Width }
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

  const { parsedLines, col1Width } = parsed

  return (
    <div style={{ fontSize: 13, color: colText2, lineHeight: 1.6, marginTop: 4 }}>
      {parsedLines.map((l, i) => {
        if (l.nonEmpty.length === 0) return <div key={i} style={{ height: 6 }} />
        if (l.nonEmpty.length === 1) return (
          <div key={i} style={{ paddingLeft: l.leadTabs * 18, marginBottom: 1, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {l.nonEmpty[0]}
          </div>
        )
        return (
          <div key={i} style={{
            paddingLeft: l.leadTabs * 18,
            display: 'grid',
            gridTemplateColumns: `${col1Width} minmax(0, 1fr)`,
            columnGap: 12,
            marginBottom: 2,
            alignItems: 'start',
          }}>
            <span style={{
              color: colText3,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}>{l.nonEmpty[0]}</span>
            <span style={{
              color: colText,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}>{l.nonEmpty.slice(1).join(' · ')}</span>
          </div>
        )
      })}
    </div>
  )
}
