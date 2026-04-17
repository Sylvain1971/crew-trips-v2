'use client'
import { useEffect, useState, useRef, useLayoutEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { ago } from '@/lib/utils'
import { compressImage } from '@/lib/imageCompression'
import type { Message, Membre } from '@/lib/types'

const PAGE_SIZE = 100
// Transformation Supabase : thumbnail pour l'affichage dans le fil (gain perf)
const thumbUrl = (url: string, w = 600) =>
  url.includes('?') ? url : `${url}?width=${w}&quality=75`

export default function Chat({ tripId, membre }: { tripId: string, membre: Membre }) {
  const [msgs, setMsgs] = useState<Message[]>([])
  const [txt, setTxt] = useState('')
  const [epingle, setEpingle] = useState<Message | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Photo picker / preview / upload state
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const feedRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const oldestCreatedAt = useRef<string | null>(null)

  // Charger la page initiale (les plus récents)
  useEffect(() => {
    supabase
      .from('messages')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
      .then(({ data }) => {
        if (!data) return
        const ordered = [...data].reverse()
        setMsgs(ordered)
        setHasMore(data.length === PAGE_SIZE)
        if (ordered.length > 0) oldestCreatedAt.current = ordered[0].created_at
        const ep = ordered.find((m: Message) => m.epingle)
        if (ep) setEpingle(ep)
        scrollToBottom('instant')
      })

    // Realtime — nouveaux messages
    const ch = supabase
      .channel(`chat-${tripId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `trip_id=eq.${tripId}` }, p => {
        setMsgs(prev => [...prev, p.new as Message])
        if ((p.new as Message).epingle) setEpingle(p.new as Message)
        scrollToBottom('smooth')
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `trip_id=eq.${tripId}` }, p => {
        const updated = p.new as Message
        setMsgs(prev => prev.map(x => x.id === updated.id ? { ...x, epingle: updated.epingle } : x))
        setEpingle(prev => {
          if (updated.epingle) return updated
          if (prev?.id === updated.id) return null
          return prev
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [tripId])

  // Cleanup du preview ObjectURL
  useEffect(() => {
    return () => { if (pendingPreview) URL.revokeObjectURL(pendingPreview) }
  }, [pendingPreview])

  useLayoutEffect(() => {
    if (msgs.length > 0) scrollToBottom('smooth')
  }, [msgs.length])

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior })
  }

  // Charger les messages plus anciens
  const loadMore = useCallback(async () => {
    if (!oldestCreatedAt.current || loadingMore) return
    setLoadingMore(true)
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('trip_id', tripId)
      .lt('created_at', oldestCreatedAt.current)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (data) {
      const ordered = [...data].reverse()
      setHasMore(data.length === PAGE_SIZE)
      if (ordered.length > 0) oldestCreatedAt.current = ordered[0].created_at
      // Préserver la position de scroll lors de l'ajout en tête
      const feed = feedRef.current
      const prevHeight = feed?.scrollHeight ?? 0
      setMsgs(prev => [...ordered, ...prev])
      requestAnimationFrame(() => {
        if (feed) feed.scrollTop = feed.scrollHeight - prevHeight
      })
    }
    setLoadingMore(false)
  }, [tripId, loadingMore])

  // Sélection d'une photo
  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset le input pour que re-sélectionner le même fichier déclenche onChange
    e.target.value = ''
    if (!file) return
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingImage(file)
    setPendingPreview(URL.createObjectURL(file))
  }

  function cancelImage() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingImage(null)
    setPendingPreview(null)
  }

  // Upload + insert — gère les 3 cas : texte seul, photo seule, photo + légende
  async function send() {
    const t = txt.trim()
    if (!t && !pendingImage) return
    if (sending) return

    setSending(true)
    try {
      let image_url: string | null = null

      if (pendingImage) {
        // Compresser (iPhone 4 MB → ~500 KB typique)
        const compressed = await compressImage(pendingImage)
        const ext = compressed.name.split('.').pop() || 'jpg'
        const path = `${tripId}/chat/${Date.now()}-${membre.prenom.toLowerCase().replace(/\s/g, '')}.${ext}`
        const { error: upErr } = await supabase.storage.from('trip-photos').upload(path, compressed, {
          contentType: compressed.type || 'image/jpeg',
        })
        if (upErr) throw upErr
        image_url = supabase.storage.from('trip-photos').getPublicUrl(path).data.publicUrl
      }

      const { error } = await supabase.from('messages').insert({
        trip_id: tripId,
        contenu: t || null,
        image_url,
        epingle: false,
        membre_id: membre.id,
        membre_prenom: membre.prenom,
        membre_couleur: membre.couleur,
      })
      if (error) throw error

      // Reset UI
      setTxt('')
      if (inputRef.current) inputRef.current.style.height = '42px'
      cancelImage()
    } catch (e: any) {
      alert('Erreur lors de l\'envoi : ' + (e?.message || e))
    } finally {
      setSending(false)
    }
  }

  async function toggleEpingle(m: Message) {
    const newVal = !m.epingle
    await supabase.from('messages').update({ epingle: newVal }).eq('id', m.id)
    setMsgs(prev => prev.map(x => x.id === m.id ? { ...x, epingle: newVal } : x))
    setEpingle(newVal ? m : null)
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }
  function grow(el: HTMLTextAreaElement) {
    el.style.height = '42px'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }
  const isMine = (m: Message) => m.membre_id === membre.id

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {epingle && (
        <div style={{ background: '#FFFBEB', borderBottom: '1px solid #FDE68A', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>📌</span>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--text)', lineHeight: 1.4, fontStyle: 'italic' }}>
            {epingle.image_url && !epingle.contenu
              ? <>📷 Photo épinglée <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>— {epingle.membre_prenom}</span></>
              : <>« {epingle.contenu} »<span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>— {epingle.membre_prenom}</span></>
            }
          </div>
          <button onClick={() => toggleEpingle(epingle)} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text-3)' }}>×</button>
        </div>
      )}

      <div ref={feedRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Bouton charger plus */}
        {hasMore && (
          <div style={{ textAlign: 'center', paddingBottom: 8 }}>
            <button onClick={loadMore} disabled={loadingMore}
              style={{ padding: '8px 20px', borderRadius: 20, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {loadingMore ? 'Chargement…' : '↑ Charger les messages précédents'}
            </button>
          </div>
        )}

        {msgs.length === 0 && (
          <div className="empty"><span className="empty-icon">💬</span>Dites bonjour à la gang !</div>
        )}

        {msgs.map(m => {
          const mine = isMine(m)
          return (
            <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexDirection: mine ? 'row-reverse' : 'row' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${m.membre_couleur || '#888'}22`, color: m.membre_couleur || '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {(m.membre_prenom || '?')[0].toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '74%', alignItems: mine ? 'flex-end' : 'flex-start', gap: 3 }}>
                {!mine && <div style={{ fontSize: 11, color: 'var(--text-3)', paddingLeft: 4 }}>{m.membre_prenom}</div>}

                {/* Photo (si présente) */}
                {m.image_url && (
                  <div style={{
                    borderRadius: 14, overflow: 'hidden', maxWidth: 260,
                    border: mine ? 'none' : '1px solid var(--border)',
                    boxShadow: mine ? 'none' : 'var(--shadow)',
                    cursor: 'pointer',
                    lineHeight: 0,
                  }}
                    onClick={() => setLightbox(m.image_url!)}>
                    <img src={thumbUrl(m.image_url)} alt="" loading="lazy"
                      style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 320, objectFit: 'cover' }} />
                  </div>
                )}

                {/* Texte (légende ou message pur) */}
                {m.contenu && (
                  <div style={{
                    padding: '10px 14px', fontSize: 14, lineHeight: 1.55, wordBreak: 'break-word',
                    background: mine ? 'var(--forest)' : '#fff',
                    color: mine ? '#fff' : 'var(--text)',
                    border: mine ? 'none' : '1px solid var(--border)',
                    borderRadius: 18,
                    borderBottomRightRadius: mine ? 4 : 18,
                    borderBottomLeftRadius: mine ? 18 : 4,
                    boxShadow: mine ? 'none' : 'var(--shadow)',
                  }}>
                    {m.contenu}
                    {m.epingle && <span style={{ marginLeft: 6, fontSize: 12 }}>📌</span>}
                  </div>
                )}

                {/* Épingle sur bulle photo-seule */}
                {!m.contenu && m.image_url && m.epingle && (
                  <div style={{ fontSize: 12, color: '#B45309', paddingLeft: 4 }}>📌</div>
                )}

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 4, paddingRight: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{ago(m.created_at)}</span>
                  <button onClick={() => toggleEpingle(m)} style={{ background: 'none', border: 'none', fontSize: 12, cursor: 'pointer', color: m.epingle ? '#B45309' : 'var(--text-3)', padding: 0 }}>
                    {m.epingle ? '📌' : '☞ épingler'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Lightbox photo plein écran */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
          <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }} />
          <button onClick={(e) => { e.stopPropagation(); setLightbox(null) }}
            style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
      )}

      {/* Barre d'envoi */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,.97)', backdropFilter: 'blur(10px)', borderTop: '1px solid var(--border)', padding: `9px 12px calc(env(safe-area-inset-bottom,0px) + 62px)`, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 30 }}>

        {/* Preview photo pendante */}
        {pendingPreview && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--sand)', borderRadius: 12, padding: '8px 10px', border: '1px solid var(--border)' }}>
            <img src={pendingPreview} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-2)' }}>
              Photo prête à envoyer
              <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Ajoute une légende ou envoie directement</div>
            </div>
            <button onClick={cancelImage}
              style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-3)', cursor: 'pointer', padding: '0 6px', flexShrink: 0 }}>×</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          {/* Bouton photo */}
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickImage} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            aria-label="Ajouter une photo"
            style={{
              width: 42, height: 42, borderRadius: '50%',
              background: '#fff', color: 'var(--text-2)',
              border: '1.5px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, cursor: sending ? 'default' : 'pointer',
              transition: 'border-color .15s',
            }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>

          <textarea ref={inputRef}
            style={{ flex: 1, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 22, fontSize: 14, fontFamily: 'inherit', resize: 'none', height: 42, lineHeight: 1.4, maxHeight: 120, outline: 'none', background: '#fff', transition: 'border-color .15s' }}
            placeholder={pendingImage ? 'Légende (optionnel)…' : 'Votre message…'}
            value={txt}
            onChange={e => { setTxt(e.target.value); grow(e.target) }}
            onKeyDown={onKey}
            onFocus={e => { e.target.style.borderColor = 'var(--green)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
            disabled={sending}
          />

          <button onClick={send}
            disabled={sending || (!txt.trim() && !pendingImage)}
            style={{
              width: 42, height: 42, borderRadius: '50%',
              background: (txt.trim() || pendingImage) && !sending ? 'var(--forest)' : 'var(--border)',
              color: '#fff', border: 'none', fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background .15s',
              cursor: sending ? 'default' : 'pointer',
            }}>
            {sending ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                </path>
              </svg>
            ) : '↑'}
          </button>
        </div>
      </div>
    </div>
  )
}
