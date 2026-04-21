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
