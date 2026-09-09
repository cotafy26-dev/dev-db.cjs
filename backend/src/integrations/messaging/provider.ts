import type { ChannelType } from '@prisma/client';

export interface InboundMessage {
  channel: ChannelType;
  externalId: string; // chat id / phone
  text: string;
  displayName?: string | null;
  mediaUrl?: string | null;
}

export interface OutboundMessage {
  to: string; // chat id / phone
  text?: string;
  mediaUrl?: string;
  documentUrl?: string;
  template?: { name: string; params: string[] };
}

/**
 * Camada de mensageria desacoplada (secao 22). Trocar o fornecedor de WhatsApp
 * nao deve exigir mudanca fora desta pasta.
 */
export interface MessagingProvider {
  readonly channel: ChannelType;
  isEnabled(): boolean;
  sendText(to: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }>;
  sendMedia?(to: string, url: string, caption?: string): Promise<{ ok: boolean; error?: string }>;
  sendDocument?(to: string, url: string, filename?: string): Promise<{ ok: boolean; error?: string }>;
  sendTemplate?(to: string, name: string, params: string[]): Promise<{ ok: boolean; error?: string }>;
}
