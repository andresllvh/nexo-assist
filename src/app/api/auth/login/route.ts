import { z } from 'zod'
import { setSession } from '@/server/auth/session'
import { findEmployeeByEmail } from '@/server/employees'
import { json, problem, readJson } from '@/server/http'

const body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().default(true),
})

export async function POST(request: Request) {
  const parsed = body.safeParse(await readJson(request))
  if (!parsed.success) return problem('Informe o e-mail corporativo e a senha.', 400)

  // ambiente de demonstração: qualquer senha vale para os funcionários de exemplo (pedido do PRD)
  const employee = findEmployeeByEmail(parsed.data.email)
  if (!employee) return problem('Não encontramos esse e-mail na Nexo. Confira se digitou o e-mail corporativo.', 401)

  await setSession(employee.id, parsed.data.remember)
  return json({ role: employee.role, redirect: employee.role === 'analyst' ? '/console' : '/atendimento' })
}
