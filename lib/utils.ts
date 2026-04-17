// Fonctions utilitaires partagées entre composants

export function getYoutubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

export function isPdf(url?: string | null): boolean {
  if (!url) return false
  return url.toLowerCase().includes('.pdf') || url.includes('application%2Fpdf')
}

export function ago(ts: string): string {
  const d = Date.now() - new Date(ts).getTime()
  if (d < 60000) return "À l'instant"
  if (d < 3600000) return `${Math.floor(d / 60000)}min`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h`
  return new Date(ts).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })
}

export function countdown(d?: string): string | null {
  if (!d) return null
  const diff = Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86400000)
  if (diff < 0) return null
  if (diff === 0) return "C'est aujourd'hui !"
  return `${diff} jour${diff > 1 ? 's' : ''} avant le départ`
}

export const TRIP_ICONS: Record<string, string> = {
  peche: '🎣', ski: '⛷', motoneige: '🗻', hike: '🥾',
  velo: '🚵', chasse: '🫎', yoga: '🧘', soleil: '☀️', autre: '🏕',
}

// Nom de la section Lodge selon l'activité
export function getLodgeLabel(type: string): { icon: string; label: string } {
  switch (type) {
    case 'ski':   return { icon: '🏨', label: 'Hôtel' }
    case 'hike':  return { icon: '⛺', label: 'Refuge' }
    case 'velo':  return { icon: '🏨', label: 'Hôtel' }
    case 'yoga':  return { icon: '🌴', label: 'Resort' }
    case 'soleil':return { icon: '🌴', label: 'Resort' }
    default:      return { icon: '🏕', label: 'Lodge' }  // peche, chasse, motoneige, autre
  }
}

// Label de la catégorie "permis" selon l'activité
export function getPermisLabel(type: string): string {
  switch (type) {
    case 'ski':   return 'Billets'
    case 'peche': return 'Permis'
    default:      return 'Accès'   // hike, velo, yoga, soleil, chasse, motoneige, autre
  }
}

// Label catégorie adapté à l'activité (sheets ajouter/modifier)
export function getCatLabel(catId: string, tripType: string): string {
  if (catId === 'lodge') return getLodgeLabel(tripType).label + ' & Séjour'
  if (catId === 'permis') {
    switch (tripType) {
      case 'ski':   return 'Billets & Forfaits'
      case 'peche': return 'Permis & Règlements'
      default:      return 'Accès & Règlements'
    }
  }
  return ''
}

// Placeholders titre/détails selon catégorie + activité
export function getCatPlaceholders(catId: string, tripType: string): { titre: string; details: string } {
  switch (catId) {
    case 'transport':
      switch (tripType) {
        case 'ski':       return { titre: 'Ex: Vol Air Canada YUL -> YVR',        details: 'Numéro de vol, navette, horaire...' }
        case 'soleil':    return { titre: 'Ex: Vol Air Transat YQB -> PUJ',       details: 'Numéro de vol, transfert, horaire...' }
        case 'hike':      return { titre: 'Ex: Vol Montréal -> Santiago',          details: 'Numéro de vol, correspondances...' }
        case 'velo':      return { titre: 'Ex: Vol YYZ -> AUS',                   details: 'Numéro de vol, location vélo...' }
        case 'chasse':    return { titre: 'Ex: Vol vers Port-Menier',             details: 'Vol, bateau, navette...' }
        case 'motoneige': return { titre: 'Ex: Départ stationnement club',        details: 'Heure, rendez-vous, véhicules...' }
        default:          return { titre: 'Ex: Vol Air Canada YQB -> YVR',        details: 'Numéro de vol, horaire, instructions...' }
      }
    case 'lodge':
      switch (tripType) {
        case 'ski':    return { titre: 'Ex: Chambre Deluxe - Fairmont',  details: 'Réservation, étage, accès...' }
        case 'soleil': return { titre: 'Ex: Suite Océan - Hard Rock',    details: 'Réservation, formule, accès...' }
        case 'yoga':   return { titre: 'Ex: Bungalow Wellness',          details: 'Réservation, check-in...' }
        case 'hike':   return { titre: 'Ex: Refugio Las Torres',         details: 'Réservation, capacité...' }
        case 'velo':   return { titre: 'Ex: Chambre - Marriott Austin',  details: 'Réservation, check-in...' }
        default:       return { titre: 'Ex: Chalet principal - Babine',  details: 'Hébergement, accès, règles...' }
      }
    case 'permis':
      switch (tripType) {
        case 'ski':       return { titre: 'Ex: Forfait 5 jours Whistler',       details: 'Numéro forfait, dates, points de vente...' }
        case 'peche':     return { titre: 'Ex: Permis pêche BC - Zone 6',       details: 'Numéro, espèces, limites de prise...' }
        case 'chasse':    return { titre: 'Ex: Permis cerf Anticosti',          details: 'Numéro, zones, quotas...' }
        case 'motoneige': return { titre: 'Ex: Laissez-passer FCMQ',           details: 'Numéro, pistes autorisées...' }
        case 'hike':      return { titre: 'Ex: Billet parc Torres del Paine',   details: 'Billet, dates, règles du parc...' }
        case 'velo':      return { titre: 'Ex: Pass piste cyclable Texas',      details: "Accès, règles, points d'entrée..." }
        default:          return { titre: 'Ex: Accès et règlements',            details: 'Numéros, zones autorisées...' }
      }
    case 'equipement':
      switch (tripType) {
        case 'ski':       return { titre: 'Ex: Location skis - Whistler Sport',  details: 'Pointures, modèles, récupération...' }
        case 'peche':     return { titre: 'Ex: Canne Spey 14pi - Rio Gold',      details: 'Modèle, soie, mouches recommandées...' }
        case 'velo':      return { titre: 'Ex: Vélo de route à apporter',        details: 'Équipement, outils, pneus...' }
        case 'hike':      return { titre: 'Ex: Sac 65L - liste complète',        details: 'Poids max, matériel obligatoire...' }
        case 'chasse':    return { titre: 'Ex: Liste armes et munitions',        details: 'Calibres, transport, étui...' }
        case 'motoneige': return { titre: 'Ex: Équipement sécurité requis',     details: 'Casque, combinaison, trousse survie...' }
        case 'soleil':    return { titre: 'Ex: Valise plage - essentiels',       details: 'Crème solaire, snorkeling...' }
        default:          return { titre: 'Ex: Liste équipement essentiel',      details: 'Détails, quantités, responsables...' }
      }
    case 'itineraire':
      switch (tripType) {
        case 'ski':       return { titre: 'Ex: Pistes noires - Jour 2',          details: 'Horaire, pistes, rendez-vous...' }
        case 'peche':     return { titre: 'Ex: Section haute rivière - Matin',   details: 'Spot, heure, méthode, guide...' }
        case 'hike':      return { titre: 'Ex: Trek Jour 3 - Camp de base',      details: 'Distance, dénivelé, durée...' }
        case 'soleil':    return { titre: 'Ex: Excursion catamaran - Jour 2',    details: 'Horaire, départ, inclus...' }
        case 'velo':      return { titre: 'Ex: Austin -> Wimberley - Jour 1',    details: 'Distance, ravitaillement...' }
        case 'chasse':    return { titre: 'Ex: Secteur cerf - Zone Nord',        details: 'Heure, cartes, affûts...' }
        case 'motoneige': return { titre: 'Ex: Sentier P8 - Monts Groulx',      details: 'Distance, carburant, pauses...' }
        default:          return { titre: 'Ex: Journée principale - Jour 1',     details: 'Horaire, activités, rendez-vous...' }
      }
    case 'meteo':
      return { titre: 'Ex: Prévisions semaine du trip', details: 'Températures, précipitations, vêtements...' }
    case 'resto':
      switch (tripType) {
        case 'ski':    return { titre: 'Ex: Après-ski - Le Shack Whistler',  details: 'Adresse, horaires, réservation...' }
        case 'soleil': return { titre: 'Ex: Resto plage - La Yola',          details: 'Adresse, spécialités, réservation...' }
        case 'velo':   return { titre: 'Ex: BBQ Austin - Franklin BBQ',      details: "Adresse, heures, file d'attente..." }
        case 'hike':   return { titre: 'Ex: Souper Puerto Natales',          details: 'Adresse, spécialités, réservation...' }
        default:       return { titre: 'Ex: Souper de groupe - Chez Marcel', details: 'Adresse, horaires, réservation...' }
      }
    case 'infos':
      return { titre: 'Ex: Infos importantes à lire', details: "Consignes, contacts, numéros d'urgence..." }
    case 'liens':
      return { titre: 'Ex: Site officiel du parc', details: 'Description, pourquoi utile...' }
    default:
      return { titre: "Ex: Titre de l'info", details: 'Détails, instructions, notes...' }
  }
}

// Exemples pour la page Nouveau trip
export function getTripExamples(type: string): { nom: string; dest: string } {
  switch (type) {
    case 'peche':     return { nom: 'Rivière Babine — Septembre 2025', dest: 'Rivière Babine, BC' }
    case 'ski':       return { nom: 'Whistler — Mars 2026',             dest: 'Whistler, BC' }
    case 'motoneige': return { nom: 'Monts Groulx — Février 2026',      dest: 'Monts Groulx, QC' }
    case 'hike':      return { nom: 'Torres del Paine — Août 2026',     dest: 'Patagonie, Chili' }
    case 'velo':      return { nom: 'Texas Hill Country — Avril 2026',  dest: 'Austin, Texas' }
    case 'chasse':    return { nom: 'Île Anticosti — Octobre 2026',     dest: 'Île Anticosti, QC' }
    case 'yoga':      return { nom: 'Retraite Tulum — Mars 2026',       dest: 'Tulum, Mexique' }
    case 'soleil':    return { nom: 'Punta Cana — Janvier 2026',        dest: 'Punta Cana, RD' }
    default:          return { nom: 'Notre trip — Été 2026',            dest: 'Destination' }
  }
}

// Détection/parsing d'un collage Excel
// Renvoie null si pas un vrai tableau de données (doc formaté avec indentation = null)
export function parseTableContent(s: string | null | undefined): { rows: string[][] } | null {
  if (!s) return null
  const lines = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  if (lines.length < 2) return null
  if (!lines.some(l => l.includes('\t'))) return null

  const cols = Math.max(...lines.map(l => l.split('\t').length))
  if (cols < 2) return null

  const rows = lines.map(l => {
    const cells = l.split('\t')
    while (cells.length < cols) cells.push('')
    return cells
  })

  // Calculer le ratio de cellules vides
  // Si >70% des cellules sont vides, c'est un doc formate (indentation Excel) pas un vrai tableau
  const totalCells = rows.length * cols
  const emptyCells = rows.reduce((acc, r) => acc + r.filter(c => c.trim() === '').length, 0)
  const emptyRatio = emptyCells / totalCells
  if (emptyRatio > 0.70) return null

  // Identifier les colonnes entierement vides et les retirer
  const activeCols = Array.from({length: cols}, (_,ci) =>
    rows.some(r => r[ci].trim() !== '')
  )
  const filteredRows = rows.map(r => r.filter((_,ci) => activeCols[ci]))

  // Si apres filtrage il ne reste qu'une seule colonne -> rendu texte (pas tableau)
  const remainingCols = activeCols.filter(Boolean).length
  if (remainingCols < 2) return null

  return { rows: filteredRows }
}
