/**
 * lib/api.ts
 * Wrapper unique autour des fonctions RPC Supabase.
 * Introduit progressivement pour remplacer les .from().select/insert/update/delete
 * qui sont actuellement ouverts à tous (avant activation RLS en Session 2.3).
 *
 * Fonctions RPC côté serveur :
 *  - verify_nip(trip_code, tel, nip_hash) -> { success, membre_id, trip_id, delay_seconds?, message? }
 *  - join_trip(trip_code, tel, nip_hash) -> { success, token, membre_id, trip_id, nip_required? }
 *  - get_trip_data(token) -> { success, trip, membres, infos, messages, current_membre_id }
 */

import { supabase } from './supabase'
import type { Trip, Membre, InfoCard } from './types'

// ====================================================================
// Types retour RPC
// ====================================================================

export type VerifyNipResult = {
  success: boolean
  membre_id?: string
  trip_id?: string
  delay_seconds?: number
  attempts?: number
  nip_required?: boolean
  message?: string
}

export type JoinTripResult = {
  success: boolean
  token?: string
  membre_id?: string
  trip_id?: string
  nip_required?: boolean
  delay_seconds?: number
  attempts?: number
  message?: string
}

export type TripDataMessage = {
  id: string
  trip_id: string
  contenu?: string
  image_url?: string
  photo_url?: string
  photo_caption?: string
  membre_id?: string
  membre_prenom?: string
  membre_couleur?: string
  type?: string
  created_at: string
}

export type GetTripDataResult = {
  success: boolean
  trip?: Trip
  membres?: Membre[]
  infos?: InfoCard[]
  messages?: TripDataMessage[]
  current_membre_id?: string
  message?: string
}

// ====================================================================
// Gestion du token côté client (localStorage)
// ====================================================================

const TOKEN_KEY = (tripCode: string) => `crew-trips:access-token:${tripCode}`

export function getStoredToken(tripCode: string): string | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(TOKEN_KEY(tripCode)) } catch { return null }
}

export function setStoredToken(tripCode: string, token: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(TOKEN_KEY(tripCode), token) } catch {}
}

export function clearStoredToken(tripCode: string): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(TOKEN_KEY(tripCode)) } catch {}
}

// ====================================================================
// Fonctions RPC wrappées
// ====================================================================

export async function apiVerifyNip(
  tripCode: string,
  tel: string,
  nipHash: string
): Promise<VerifyNipResult> {
  const { data, error } = await supabase.rpc('verify_nip', {
    p_trip_code: tripCode,
    p_tel: tel,
    p_nip_hash: nipHash,
  })
  if (error) {
    return { success: false, message: `Erreur serveur : ${error.message}` }
  }
  return data as VerifyNipResult
}

export async function apiJoinTrip(
  tripCode: string,
  tel: string,
  nipHash: string
): Promise<JoinTripResult> {
  const { data, error } = await supabase.rpc('join_trip', {
    p_trip_code: tripCode,
    p_tel: tel,
    p_nip_hash: nipHash,
  })
  if (error) {
    return { success: false, message: `Erreur serveur : ${error.message}` }
  }
  const result = data as JoinTripResult
  if (result.success && result.token) {
    setStoredToken(tripCode, result.token)
  }
  return result
}

export async function apiGetTripData(
  tripCode: string
): Promise<GetTripDataResult> {
  const token = getStoredToken(tripCode)
  if (!token) {
    return { success: false, message: 'Pas de token. Veuillez vous reconnecter.' }
  }
  const { data, error } = await supabase.rpc('get_trip_data', { p_token: token })
  if (error) {
    return { success: false, message: `Erreur serveur : ${error.message}` }
  }
  const result = data as GetTripDataResult
  if (!result.success) {
    // Token expiré ou invalide : nettoyer le localStorage pour forcer re-login
    clearStoredToken(tripCode)
  }
  return result
}

// ====================================================================
// Fonctions RPC secondaires (reconnexion, inscription, NIP)
// ====================================================================

export async function apiGetTripByCode(tripCode: string): Promise<{ success: boolean; trip?: Trip; message?: string }> {
  const { data, error } = await supabase.rpc('get_trip_by_code', { p_code: tripCode })
  if (error) return { success: false, message: error.message }
  return data as { success: boolean; trip?: Trip; message?: string }
}

export async function apiReconnectByTel(tripCode: string, tel: string): Promise<{ success: boolean; membre?: Membre; has_nip?: boolean; message?: string }> {
  const { data, error } = await supabase.rpc('reconnect_by_tel', { p_trip_code: tripCode, p_tel: tel })
  if (error) return { success: false, message: error.message }
  return data as { success: boolean; membre?: Membre; has_nip?: boolean; message?: string }
}

export async function apiSaveNip(tel: string, nipHash: string): Promise<{ success: boolean; updated?: number; message?: string }> {
  const { data, error } = await supabase.rpc('save_nip', { p_tel: tel, p_nip_hash: nipHash })
  if (error) return { success: false, message: error.message }
  return data as { success: boolean; updated?: number; message?: string }
}

export async function apiRegisterMember(
  tripCode: string,
  prenom: string,
  nom: string,
  tel: string,
  nipHash: string
): Promise<JoinTripResult> {
  const { data, error } = await supabase.rpc('register_member', {
    p_trip_code: tripCode,
    p_prenom: prenom,
    p_nom: nom,
    p_tel: tel,
    p_nip_hash: nipHash,
  })
  if (error) return { success: false, message: error.message }
  const result = data as JoinTripResult
  if (result.success && result.token) {
    setStoredToken(tripCode, result.token)
  }
  return result
}

export async function apiGetAutorises(tripCode: string): Promise<{ success: boolean; autorises?: unknown[]; message?: string }> {
  const { data, error } = await supabase.rpc('get_autorises', { p_trip_code: tripCode })
  if (error) return { success: false, message: error.message }
  return data as { success: boolean; autorises?: unknown[]; message?: string }
}

export async function apiGetMembreById(membreId: string): Promise<{ success: boolean; membre?: Membre; message?: string }> {
  const { data, error } = await supabase.rpc('get_membre_by_id', { p_membre_id: membreId })
  if (error) return { success: false, message: error.message }
  return data as { success: boolean; membre?: Membre; message?: string }
}

// ====================================================================
// Fonctions RPC mutations critiques (Phase 2.3)
// Toutes ces fonctions nécessitent un token valide ou un code serveur.
// ====================================================================

export type CreateTripResult = {
  success: boolean
  trip_id?: string
  membre_id?: string
  token?: string
  message?: string
}

export async function apiCreateTrip(
  creatorCode: string,
  params: {
    code: string
    nom: string
    type: string
    destination: string
    date_debut: string | null
    date_fin: string | null
    createur_prenom: string
    createur_nom: string
    createur_tel: string
    createur_nip_hash: string
  }
): Promise<CreateTripResult> {
  const { data, error } = await supabase.rpc('create_trip', {
    p_creator_code: creatorCode,
    p_code: params.code,
    p_nom: params.nom,
    p_type: params.type,
    p_destination: params.destination,
    p_date_debut: params.date_debut,
    p_date_fin: params.date_fin,
    p_createur_prenom: params.createur_prenom,
    p_createur_nom: params.createur_nom,
    p_createur_tel: params.createur_tel,
    p_createur_nip_hash: params.createur_nip_hash,
  })
  if (error) return { success: false, message: error.message }
  const result = data as CreateTripResult
  if (result.success && result.token) {
    setStoredToken(params.code, result.token)
  }
  return result
}

export async function apiDeleteTripFull(tripCode: string, tripId: string): Promise<{ success: boolean; message?: string }> {
  const token = getStoredToken(tripCode)
  if (!token) return { success: false, message: 'Pas de token' }
  const { data, error } = await supabase.rpc('delete_trip_full', { p_token: token, p_trip_id: tripId })
  if (error) return { success: false, message: error.message }
  if ((data as { success: boolean }).success) {
    clearStoredToken(tripCode)
  }
  return data as { success: boolean; message?: string }
}

export async function apiUpdateTripFields(
  tripCode: string,
  tripId: string,
  updates: Record<string, unknown>
): Promise<{ success: boolean; message?: string }> {
  const token = getStoredToken(tripCode)
  if (!token) return { success: false, message: 'Pas de token' }
  const { data, error } = await supabase.rpc('update_trip_fields', {
    p_token: token,
    p_trip_id: tripId,
    p_updates: updates,
  })
  if (error) return { success: false, message: error.message }
  return data as { success: boolean; message?: string }
}

export async function apiUpdateMember(
  tripCode: string,
  membreId: string,
  updates: Record<string, unknown>
): Promise<{ success: boolean; message?: string }> {
  const token = getStoredToken(tripCode)
  if (!token) return { success: false, message: 'Pas de token' }
  const { data, error } = await supabase.rpc('update_member', {
    p_token: token,
    p_membre_id: membreId,
    p_updates: updates,
  })
  if (error) return { success: false, message: error.message }
  return data as { success: boolean; message?: string }
}

export async function apiDeleteMemberSafe(
  tripCode: string,
  membreId: string
): Promise<{ success: boolean; message?: string }> {
  const token = getStoredToken(tripCode)
  if (!token) return { success: false, message: 'Pas de token' }
  const { data, error } = await supabase.rpc('delete_member_safe', { p_token: token, p_membre_id: membreId })
  if (error) return { success: false, message: error.message }
  return data as { success: boolean; message?: string }
}

export async function apiUpsertConfig(creatorCode: string, key: string, value: string): Promise<{ success: boolean; message?: string }> {
  const { data, error } = await supabase.rpc('upsert_config', { p_creator_code: creatorCode, p_key: key, p_value: value })
  if (error) return { success: false, message: error.message }
  return data as { success: boolean; message?: string }
}

// ====================================================================
// Fonctions RPC mutations secondaires (infos/messages/autorises)
// ====================================================================

export async function apiSaveInfoCard(
  tripCode: string,
  tripId: string,
  params: {
    id?: string | null
    categorie: string
    titre: string
    contenu: string | null
    lien?: string | null
    fichier_url?: string | null
    is_prive: boolean
    auteur_id?: string | null
    membre_prenom?: string | null
  }
): Promise<{ success: boolean; card?: unknown; message?: string }> {
  const token = getStoredToken(tripCode)
  if (!token) return { success: false, message: 'Pas de token' }
  const { data, error } = await supabase.rpc('save_info_card', {
    p_token: token,
    p_trip_id: tripId,
    p_id: params.id || null,
    p_categorie: params.categorie,
    p_titre: params.titre,
    p_contenu: params.contenu,
    p_lien: params.lien || null,
    p_fichier_url: params.fichier_url || null,
    p_is_prive: params.is_prive,
    p_auteur_id: params.auteur_id || null,
    p_membre_prenom: params.membre_prenom || null,
  })
  if (error) return { success: false, message: error.message }
  return data as { success: boolean; card?: unknown; message?: string }
}

export async function apiDeleteInfoCard(tripCode: string, tripId: string, id: string): Promise<{ success: boolean; message?: string }> {
  const token = getStoredToken(tripCode)
  if (!token) return { success: false, message: 'Pas de token' }
  const { data, error } = await supabase.rpc('delete_info_card', { p_token: token, p_trip_id: tripId, p_id: id })
  if (error) return { success: false, message: error.message }
  return data as { success: boolean; message?: string }
}

export async function apiPostMessage(
  tripCode: string,
  tripId: string,
  params: {
    type?: string
    contenu?: string | null
    image_url?: string | null
    photo_url?: string | null
    photo_caption?: string | null
    membre_id?: string | null
    membre_prenom?: string | null
    membre_couleur?: string | null
  }
): Promise<{ success: boolean; message?: unknown; error?: string }> {
  const token = getStoredToken(tripCode)
  if (!token) return { success: false, error: 'Pas de token' }
  const { data, error } = await supabase.rpc('post_message', {
    p_token: token,
    p_trip_id: tripId,
    p_type: params.type || 'text',
    p_contenu: params.contenu || null,
    p_image_url: params.image_url || null,
    p_photo_url: params.photo_url || null,
    p_photo_caption: params.photo_caption || null,
    p_membre_id: params.membre_id || null,
    p_membre_prenom: params.membre_prenom || null,
    p_membre_couleur: params.membre_couleur || null,
  })
  if (error) return { success: false, error: error.message }
  return data as { success: boolean; message?: unknown }
}

export async function apiDeleteMessages(tripCode: string, tripId: string, ids: string[]): Promise<{ success: boolean; message?: string }> {
  const token = getStoredToken(tripCode)
  if (!token) return { success: false, message: 'Pas de token' }
  const { data, error } = await supabase.rpc('delete_messages', { p_token: token, p_trip_id: tripId, p_ids: ids })
  if (error) return { success: false, message: error.message }
  return data as { success: boolean; message?: string }
}

export async function apiManageAutorises(
  tripCode: string,
  tripId: string,
  params: {
    action: 'add' | 'delete'
    id?: string | null
    prenom?: string | null
    nom?: string | null
    tel?: string | null
  }
): Promise<{ success: boolean; id?: string; message?: string }> {
  const token = getStoredToken(tripCode)
  if (!token) return { success: false, message: 'Pas de token' }
  const { data, error } = await supabase.rpc('manage_autorises', {
    p_token: token,
    p_trip_id: tripId,
    p_action: params.action,
    p_id: params.id || null,
    p_prenom: params.prenom || null,
    p_nom: params.nom || null,
    p_tel: params.tel || null,
  })
  if (error) return { success: false, message: error.message }
  return data as { success: boolean; id?: string; message?: string }
}
