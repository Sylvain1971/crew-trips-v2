'use client'
import { useRouter } from 'next/navigation'
import { SvgIcon } from '@/lib/svgIcons'

export default function Home() {
  const router = useRouter()
  return (
    <main style={{minHeight:'100dvh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'var(--forest)',padding:'32px 20px'}}>
      <div style={{textAlign:'center',marginBottom:48}}>
        <div style={{fontSize:60,marginBottom:16}}>🏕</div>
        <h1 style={{fontSize:34,fontWeight:800,color:'#fff',letterSpacing:'-.04em',lineHeight:1.1,margin:0}}>Crew Trips</h1>
        <p style={{fontSize:15,color:'rgba(255,255,255,.5)',marginTop:12,lineHeight:1.6}}>
          Tout ce que ton groupe a besoin de savoir.<br/>Un seul lien.
        </p>
      </div>

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
            <div style={{fontSize:12,color:'var(--text-2)',fontWeight:400,marginTop:2}}>Créateurs et participants</div>
          </div>
          <div style={{marginLeft:'auto',fontSize:20,color:'var(--text-3)'}}>›</div>
        </button>

        {/* Nouveau trip */}
        <button onClick={()=>router.push('/nouveau')}
          style={{width:'100%',padding:'18px 24px',borderRadius:16,border:'1.5px solid rgba(255,255,255,.2)',
            background:'rgba(255,255,255,.08)',color:'#fff',fontSize:16,fontWeight:700,
            cursor:'pointer',display:'flex',alignItems:'center',gap:14,textAlign:'left'}}>
          <div style={{width:44,height:44,borderRadius:12,background:'rgba(255,255,255,.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>
            ✚
          </div>
          <div>
            <div style={{fontSize:16,fontWeight:700}}>Nouveau trip</div>
            <div style={{fontSize:12,color:'rgba(255,255,255,.45)',fontWeight:400,marginTop:2}}>Créer un trip pour votre groupe</div>
          </div>
          <div style={{marginLeft:'auto',fontSize:20,color:'rgba(255,255,255,.3)'}}>›</div>
        </button>

      </div>

      <p style={{fontSize:11,color:'rgba(255,255,255,.2)',marginTop:40,textAlign:'center'}}>
        crew-trips-v2.vercel.app
      </p>

      <a href="/admin" style={{position:'fixed',bottom:24,right:20,
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
