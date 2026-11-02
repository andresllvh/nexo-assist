import type { Employee } from '@/domain/types'
import { currentUser } from './auth/session'

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}

export function problem(message: string, status: number): Response {
  return Response.json({ error: message }, { status })
}

/** Garante sessão (e o papel, quando informado). Devolve o usuário ou a resposta de erro pronta. */
export async function requireUser(role?: Employee['role']): Promise<Employee | Response> {
  const user = await currentUser()
  if (!user) return problem('Sessão expirada. Entre de novo.', 401)
  if (role && user.role !== role) return problem('Acesso não permitido para o seu perfil.', 403)
  return user
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}
