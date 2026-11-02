import type { Employee } from '@/domain/types'

// Funcionários de exemplo. O login aceita qualquer senha para estes e-mails (pedido do PRD).
export const EMPLOYEES: readonly Employee[] = [
  { id: 'e-ana', name: 'Ana Souza', email: 'ana.souza@nexo.com.br', role: 'employee', department: 'Financeiro', os: 'Windows 11', supportLevel: null },
  { id: 'e-carla', name: 'Carla Mendes', email: 'carla.mendes@nexo.com.br', role: 'employee', department: 'Comercial', os: 'Windows 10', supportLevel: null },
  { id: 'e-bruno', name: 'Bruno Tavares', email: 'bruno.tavares@nexo.com.br', role: 'employee', department: 'Marketing', os: 'macOS', supportLevel: null },
  { id: 'e-diego', name: 'Diego Ramos', email: 'diego.ramos@nexo.com.br', role: 'employee', department: 'Operações', os: 'Windows 10', supportLevel: null },
  { id: 'a-rafael', name: 'Rafael Lima', email: 'rafael.lima@nexo.com.br', role: 'analyst', department: 'TI', os: 'Windows 11', supportLevel: 'N2' },
  { id: 'a-julia', name: 'Júlia Costa', email: 'julia.costa@nexo.com.br', role: 'analyst', department: 'TI', os: 'Windows 11', supportLevel: 'N1' },
]

export function findEmployeeByEmail(email: string): Employee | undefined {
  const normalized = email.trim().toLowerCase()
  return EMPLOYEES.find((e) => e.email === normalized)
}

export function findEmployee(id: string): Employee | undefined {
  return EMPLOYEES.find((e) => e.id === id)
}

export function initials(name: string): string {
  const parts = name.split(' ').filter(Boolean)
  return `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toUpperCase()
}

export function firstName(name: string): string {
  return name.split(' ')[0] ?? name
}
