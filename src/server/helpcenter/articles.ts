import type { Category } from '@/domain/types'

export type Article = {
  id: string
  title: string
  category: Category
  body: string
  /** quando o artigo só vale para alguns casos; o agent precisa checar antes de sugerir */
  appliesTo?: string
}

export const ARTICLES: readonly Article[] = [
  {
    id: 'KB-101',
    title: 'VPN com erro 809',
    category: 'Rede e VPN',
    body: 'Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador.',
    appliesTo: 'Vale apenas para Windows 10; no Windows 11, abra um chamado.',
  },
  {
    id: 'KB-102',
    title: 'Horário do service desk',
    category: 'Outros',
    body: 'De segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.',
  },
  {
    id: 'KB-103',
    title: 'Trocar ou desbloquear a senha da rede',
    category: 'Acesso',
    body: 'Acesse senha.nexo.com.br, confirme o código enviado ao celular cadastrado e defina a nova senha. A senha da rede também vale para o e-mail e a VPN. Depois de 5 tentativas erradas, o desbloqueio é automático em 30 minutos.',
  },
  {
    id: 'KB-104',
    title: 'Wi-Fi para visitantes',
    category: 'Rede e VPN',
    body: 'Conecte na rede "Nexo-Visitantes". A senha do dia aparece na tela da recepção e muda toda manhã. Funcionários usam a rede "Nexo-Corp" com o login da rede.',
  },
  {
    id: 'KB-105',
    title: 'Configurar o e-mail no celular',
    category: 'E-mail',
    body: 'Instale o app Outlook, entre com o e-mail corporativo e aprove o acesso no Authenticator. Se os e-mails não sincronizarem, remova a conta do app e adicione de novo.',
  },
  {
    id: 'KB-106',
    title: 'Adicionar uma impressora',
    category: 'Hardware',
    body: 'Abra Configurações > Impressoras e escolha a impressora do seu andar (ex.: "NEXO-3A"). Se a fila travar, cancele os documentos pendentes e reinicie o spooler pelo portal de softwares.',
  },
  {
    id: 'KB-107',
    title: 'Pedir instalação de software',
    category: 'Software',
    body: 'Softwares do catálogo (Office, Teams, Zoom, 7-Zip) se instalam sozinhos pelo portal de softwares. Para software fora do catálogo ou que precisa de licença, é preciso abrir uma requisição (REQ) com a justificativa.',
  },
  {
    id: 'KB-108',
    title: 'Notebook lento',
    category: 'Hardware',
    body: 'Reinicie o computador e rode o "Diagnóstico Nexo" pelo portal de softwares. Ele limpa arquivos temporários e verifica o disco. Se continuar lento depois do diagnóstico, abra um chamado.',
  },
  {
    id: 'KB-109',
    title: 'Aprovar login no Authenticator',
    category: 'Acesso',
    body: 'Ao entrar em sistemas da Nexo fora da rede, aprove o pedido no app Microsoft Authenticator. Trocou de celular? Peça a reconfiguração do MFA abrindo uma requisição na categoria Acesso.',
  },
]
