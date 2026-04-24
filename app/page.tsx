'use client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { SvgIcon } from '@/lib/svgIcons'

export default function Home() {
  const router = useRouter()
  return (
    <main style={{minHeight:'100dvh',display:'flex',flexDirection:'column',alignItems:'center',background:'var(--forest)',padding:'56px 20px 40px',position:'relative'}}>

      {/* Signature hero — positionnée vers le haut, pas centrée */}
      <div style={{textAlign:'center',marginBottom:80,display:'flex',flexDirection:'column',alignItems:'center'}}>
        <Image
          src="/logo-hero.webp"
          alt="Crew Trips"
          width={192}
          height={192}
          priority
          style={{marginBottom:8}}
        />
        <h1 style={{fontFamily:'var(--font-brand), Georgia, serif',fontSize:29,fontWeight:700,color:'#fff',letterSpacing:'-.02em',lineHeight:1,margin:'0 0 10px'}}>Crew Trips</h1>
        <p style={{fontSize:9,color:'rgba(255,255,255,.5)',margin:0,lineHeight:1.4,letterSpacing:'.22em',textTransform:'uppercase',fontWeight:500}}>
          Un seul lien · Pour tout savoir
        </p>
      </div>

      {/* CTAs */}
      <div style={{width:'100%',maxWidth:360,display:'flex',flexDirection:'column',gap:14}}>

        {/* Mes trips */}
        <button onClick={()=>router.push('/mes-trips')}
          style={{width:'100%',padding:'18px 24px',borderRadius:16,border:'none',
            background:'#fff',color:'var(--forest)',fontSize:16,fontWeight:700,
            cursor:'pointer',display:'flex',alignItems:'center',gap:14,textAlign:'left'}}>
          <div style={{width:44,height:44,borderRadius:12,background:'var(--forest)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0}}>
            <SvgIcon name="clipboard" size={22} />
          </div>
          <div>
            <div style={{fontSize:16,fontWeight:700}}>Mes trips</div>
            <div style={{fontSize:12,color:'var(--text-2)',fontWeight:400,marginTop:2}}>Administrateurs et participants</div>
          </div>
          <div style={{marginLeft:'auto',fontSize:20,color:'var(--text-3)'}}>›</div>
        </button>

      </div>

      <p style={{fontSize:11,color:'rgba(255,255,255,.35)',textAlign:'center',position:'absolute',bottom:24,left:0,right:0}}>
        crew-trips-v2.vercel.app
      </p>

      {/* Bouton + pour créer un nouveau trip — symétrique au ⚙️ */}
      <button onClick={()=>router.push('/nouveau')} aria-label="Créer un nouveau trip"
        style={{position:'fixed',bottom:24,left:20,
          background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.15)',
          borderRadius:'50%',width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',
          cursor:'pointer',color:'rgba(255,255,255,.55)',padding:0}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>

      <a href="/admin" aria-label="Administration" style={{position:'fixed',bottom:24,right:20,
        background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.15)',
        borderRadius:'50%',width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',
        textDecoration:'none',color:'rgba(255,255,255,.4)'}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </a>
    </main>
  )
}
