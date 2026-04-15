'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function extraireCode(val: string): string {
  // Accepte: code brut (abc123), URL complète, URL partielle
  const trim = val.trim()
  // Chercher un pattern /trip/XXXXX dans l'URL
  const match = trim.match(/\/trip\/([a-z0-9]{6})/i)
  if (match) return match[1].toLowerCase()
  // Sinon supposer que c'est le code brut
  return trim.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)
}

export default function RejoindreTrip() {
  const router = useRouter()
  const [val, setVal] = useState('')
  const [erreur, setErreur] = useState('')
  const [loading, setLoading] = useState(false)

  async function rejoindre() {
    const code = extraireCode(val)
    if (code.length < 4) { setErreur('Code invalide — vérifiez le lien ou le code.'); return }
    setLoading(true); setErreur('')
    const { data } = await supabase.from('trips').select('code').eq('code', code).maybeSingle()
    if (!data) { setErreur('Aucun trip trouvé avec ce code.'); setLoading(false); return }
    router.push(`/trip/${data.code}`)
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    // Auto-extraire le code si on colle une URL complète
    setTimeout(() => {
      const v = e.currentTarget.value
      const code = extraireCode(v)
      if (code.length === 6) setVal(code)
    }, 10)
  }

  return (
    <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',flexDirection:'column'}}>
      {/* Header */}
      <div style={{background:'var(--forest)',padding:'16px 20px 20px',display:'flex',flexDirection:'column',alignItems:'center',position:'relative'}}>
        <button onClick={()=>router.push('/')}
          style={{position:'absolute',top:16,left:20,background:'rgba(255,255,255,.1)',border:'none',borderRadius:10,padding:'8px 12px',color:'#fff',cursor:'pointer',fontSize:14}}>
          ← Retour
        </button>
        <div style={{fontSize:36,marginBottom:4}}>🔗</div>
        <div style={{fontWeight:800,fontSize:22,color:'#fff',letterSpacing:'-.03em'}}>Crew Trips</div>
        <div style={{fontWeight:600,fontSize:15,color:'rgba(255,255,255,.6)',marginTop:4}}>Rejoindre un trip</div>
      </div>

      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px 20px'}}>
        <div style={{width:'100%',maxWidth:380}}>
          <div style={{background:'rgba(255,255,255,.06)',borderRadius:20,padding:24,border:'1px solid rgba(255,255,255,.1)'}}>
            <p style={{fontSize:14,color:'rgba(255,255,255,.6)',textAlign:'center',marginBottom:20,lineHeight:1.6}}>
              Collez le lien reçu ou entrez le code du trip
            </p>

            <div className="field">
              <label style={{color:'rgba(255,255,255,.5)',textAlign:'center',display:'block'}}>LIEN OU CODE</label>
              <input className="input"
                placeholder="crew-trips-v2.vercel.app/trip/abc123"
                value={val}
                onChange={e=>{ setVal(e.target.value); setErreur('') }}
                onPaste={onPaste}
                onKeyDown={e=>e.key==='Enter'&&rejoindre()}
                autoFocus
                style={{background:'rgba(255,255,255,.08)',
                  border:`1.5px solid ${erreur?'#f87171':'rgba(255,255,255,.15)'}`,
                  color:'#fff',fontSize:14,textAlign:'center'}}
              />
              {erreur && <div style={{color:'#fca5a5',fontSize:12,textAlign:'center',marginTop:6}}>{erreur}</div>}
            </div>

            <button className="btn" onClick={rejoindre} disabled={loading||!val.trim()}
              style={{background:loading||!val.trim()?'rgba(255,255,255,.15)':'#fff',
                color:loading||!val.trim()?'rgba(255,255,255,.4)':'var(--forest)',fontWeight:700}}>
              {loading ? 'Recherche…' : 'Accéder au trip →'}
            </button>
          </div>

          <p style={{fontSize:12,color:'rgba(255,255,255,.25)',marginTop:20,textAlign:'center',lineHeight:1.6}}>
            Le lien vous a été partagé par l'organisateur du trip via Messenger ou SMS.
          </p>
        </div>
      </div>
    </main>
  )
}
