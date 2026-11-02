import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import type { Employee } from '@/domain/types'
import { findEmployee } from '../employees'

export const SESSION_COOKIE = 'nexo_session'
const THIRTY_DAYS = 30 * 24 * 60 * 60

function secret(): string {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 16) throw new Error('Defina SESSION_SECRET no .env (mínimo 16 caracteres)')
  return value
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

/** Token = id do funcionário + expiração, assinado com HMAC. Não guarda nada sensível. */
export function createSessionToken(employeeId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ sub: employeeId, exp: now + THIRTY_DAYS * 1000 })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function verifySessionToken(token: string, now = Date.now()): string | null {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = Buffer.from(sign(payload))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub?: unknown; exp?: unknown }
    if (typeof data.sub !== 'string' || typeof data.exp !== 'number' || data.exp < now) return null
    return data.sub
  } catch {
    return null
  }
}

export async function setSession(employeeId: string, remember: boolean): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, createSessionToken(employeeId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(remember ? { maxAge: THIRTY_DAYS } : {}),
  })
}

export async function clearSession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function currentUser(): Promise<Employee | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  const id = token ? verifySessionToken(token) : null
  return id ? (findEmployee(id) ?? null) : null
}
