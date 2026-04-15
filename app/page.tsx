'use client'
import { useRouter } from 'next/navigation'

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
        {/* Entrer dans un trip */}
        <button onClick={()=>router.push('/mes-trips')}
          style={{width:'100%',padding:'18px 24px',borderRadius:16,border:'none',
            background:'#fff',color:'var(--forest)',fontSize:16,fontWeight:700,
            cursor:'pointer',display:'flex',alignItems:'center',gap:14,textAlign:'left'}}>
          <div style={{width:44,height:44,borderRadius:12,background:'var(--forest)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>
            📋
          </div>
          <div>
            <div style={{fontSize:16,fontWeight:700}}>Mes trips</div>
            <div style={{fontSize:12,color:'var(--text-2)',fontWeight:400,marginTop:2}}>Accéder à vos trips existants</div>
          </div>
          <div style={{marginLeft:'auto',fontSize:20,color:'var(--text-3)'}}>›</div>
        </button>

        {/* Créer un nouveau trip */}
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
    </main>
  )
}
