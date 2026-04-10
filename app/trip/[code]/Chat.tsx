'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Message, Membre } from '@/lib/types'

export default function Chat({ tripId, membre }: { tripId: string, membre: Membre }) {
  const [msgs, setMsgs] = useState<Message[]>([])
  const [txt, setTxt] = useState('')
  const [epingle, setEpingle] = useState<Message|null>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase.from('messages').select('*').eq('trip_id', tripId)
      .order('created_at', {ascending:true}).limit(200)
      .then(({data}) => {
        if (data) {
          setMsgs(data)
          const ep = data.find((m:Message) => m.epingle)
          if (ep) setEpingle(ep)
          scroll()
        }
      })
    const ch = supabase.channel(`chat-${tripId}`)
      .on('postgres_changes', {event:'INSERT',schema:'public',table:'messages',filter:`trip_id=eq.${tripId}`}, p => {
        setMsgs(prev => [...prev, p.new as Message])
        if ((p.new as Message).epingle) setEpingle(p.new as Message)
        scroll()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tripId])

  function scroll() { setTimeout(() => { feedRef.current?.scrollTo({top:feedRef.current.scrollHeight,behavior:'smooth'}) }, 60) }

  async function send() {
    const t = txt.trim(); if (!t) return
    setTxt('')
    if (inputRef.current) inputRef.current.style.height = '42px'
    await supabase.from('messages').insert({
      trip_id: tripId, contenu: t, epingle: false,
      membre_id: membre.id, membre_prenom: membre.prenom, membre_couleur: membre.couleur,
    })
  }

  async function toggleEpingle(m: Message) {
    const newVal = !m.epingle
    await supabase.from('messages').update({epingle: newVal}).eq('id', m.id)
    setMsgs(prev => prev.map(x => x.id===m.id ? {...x,epingle:newVal} : x))
    setEpingle(newVal ? m : null)
  }

  function onKey(e: React.KeyboardEvent) { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }
  function grow(el: HTMLTextAreaElement) { el.style.height='42px'; el.style.height=Math.min(el.scrollHeight,120)+'px' }

  function ago(ts: string) {
    const d = Date.now() - new Date(ts).getTime()
    if (d < 60000) return "À l'instant"
    if (d < 3600000) return `${Math.floor(d/60000)}min`
    const dt = new Date(ts)
    if (d < 86400000) return dt.toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'})
    return dt.toLocaleDateString('fr-CA',{day:'numeric',month:'short'})
  }

  const isMine = (m: Message) => m.membre_id === membre.id

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',position:'relative'}}>
      {epingle && (
        <div style={{background:'#FFFBEB',borderBottom:'1px solid #FDE68A',padding:'10px 14px',display:'flex',gap:10,alignItems:'center',flexShrink:0}}>
          <span style={{fontSize:16}}>📌</span>
          <div style={{flex:1,fontSize:13,color:'var(--text)',lineHeight:1.4,fontStyle:'italic'}}>
            « {epingle.contenu} »
            <span style={{fontSize:11,color:'var(--text-3)',marginLeft:6}}>— {epingle.membre_prenom}</span>
          </div>
          <button onClick={()=>toggleEpingle(epingle)} style={{background:'none',border:'none',fontSize:16,cursor:'pointer',color:'var(--text-3)'}}>×</button>
        </div>
      )}
      <div ref={feedRef} style={{flex:1,overflowY:'auto',padding:'14px 14px 100px',display:'flex',flexDirection:'column',gap:16}}>
        {msgs.length === 0 && (
          <div className="empty"><span className="empty-icon">💬</span>Dites bonjour à la gang !</div>
        )}
        {msgs.map(m => (
          <div key={m.id} style={{display:'flex',gap:8,alignItems:'flex-end',flexDirection:isMine(m)?'row-reverse':'row'}}>
            <div style={{width:32,height:32,borderRadius:'50%',background:`${m.membre_couleur||'#888'}22`,
              color:m.membre_couleur||'#888',display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:12,fontWeight:700,flexShrink:0}}>
              {(m.membre_prenom||'?')[0].toUpperCase()}
            </div>
            <div style={{display:'flex',flexDirection:'column',maxWidth:'74%',alignItems:isMine(m)?'flex-end':'flex-start',gap:3}}>
              {!isMine(m) && <div style={{fontSize:11,color:'var(--text-3)',paddingLeft:4}}>{m.membre_prenom}</div>}
              <div style={{padding:'10px 14px',fontSize:14,lineHeight:1.55,wordBreak:'break-word',
                background:isMine(m)?'var(--forest)':'#fff',color:isMine(m)?'#fff':'var(--text)',
                border:isMine(m)?'none':'1px solid var(--border)',
                borderRadius:18,borderBottomRightRadius:isMine(m)?4:18,borderBottomLeftRadius:isMine(m)?18:4,
                boxShadow:isMine(m)?'none':'var(--shadow)'}}>
                {m.contenu}
                {m.epingle && <span style={{marginLeft:6,fontSize:12}}>📌</span>}
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center',paddingLeft:4,paddingRight:4}}>
                <span style={{fontSize:10,color:'var(--text-3)'}}>{ago(m.created_at)}</span>
                <button onClick={()=>toggleEpingle(m)} style={{background:'none',border:'none',fontSize:12,cursor:'pointer',color:m.epingle?'#B45309':'var(--text-3)',padding:0}}>
                  {m.epingle?'📌':'☞ épingler'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{position:'fixed',bottom:0,left:0,right:0,background:'rgba(255,255,255,.97)',
        backdropFilter:'blur(10px)',borderTop:'1px solid var(--border)',
        padding:`9px 12px calc(env(safe-area-inset-bottom,0px) + 62px)`,
        display:'flex',gap:8,alignItems:'flex-end',zIndex:30}}>
        <textarea ref={inputRef}
          style={{flex:1,padding:'10px 14px',border:'1.5px solid var(--border)',borderRadius:22,
            fontSize:14,fontFamily:'inherit',resize:'none',height:42,lineHeight:1.4,
            maxHeight:120,outline:'none',background:'#fff',transition:'border-color .15s'}}
          placeholder="Votre message…" value={txt}
          onChange={e=>{setTxt(e.target.value);grow(e.target)}}
          onKeyDown={onKey}
          onFocus={e=>{e.target.style.borderColor='var(--green)'}}
          onBlur={e=>{e.target.style.borderColor='var(--border)'}}
        />
        <button onClick={send} style={{width:42,height:42,borderRadius:'50%',
          background:txt.trim()?'var(--forest)':'var(--border)',color:'#fff',
          border:'none',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',
          flexShrink:0,transition:'background .15s',cursor:'pointer'}}>↑</button>
      </div>
    </div>
  )
}
