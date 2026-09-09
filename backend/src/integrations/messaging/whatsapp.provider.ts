import type { ChannelType } from '@prisma/client';
import { env } from '../../core/env';
import { logger } from '../../core/logger';
import type { MessagingProvider } from './provider';

/**
 * WhatsApp via API oficial (Cloud API) ou provedor compativel (secao 22).
 * A URL base e configuravel para permitir provedores homologados.
 */
export class WhatsAppProvider implements MessagingProvider {
  readonly channel: ChannelType = 'WHATSAPP';

  isEnabled(): boolean {
    return env.WHATSAPP_ENABLED && Boolean(env.WHATSAPP_API_TOKEN) && Boolean(env.WHATSAPP_PHONE_NUMBER_ID);
  }

  private endpoint(): string {
    const base = env.WHATSAPP_API_URL.replace(/\/$/, '');
    return `${base}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  }

  private async post(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    if (!this.isEnabled()) return { ok: false, error: 'WhatsApp desativado' };
    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
      });
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (err) {
      logger.warn({ err }, 'WhatsApp request falhou');
      return { ok: false, error: err instanceof Error ? err.message : 'erro' };
    }
  }

  async sendText(to: string, text: string) {
    return this.post({ to, type: 'text', text: { body: text } });
  }

  async sendMedia(to: string, url: string, caption?: string) {
    return this.post({ to, type: 'image', image: { link: url, caption } });
  }

  async sendDocument(to: string, url: string, filename?: string) {
    return this.post({ to, type: 'document', document: { link: url, filename: filename ?? 'documento' } });
  }

  async sendTemplate(to: string, name: string, params: string[]) {
    return this.post({
      to,
      type: 'template',
      template: {
        name,
        language: { code: 'pt_BR' },
        components: params.length
          ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }]
          : undefined,
      },
    });
  }
}
