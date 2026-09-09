import type { ChannelType } from '@prisma/client';
import type { MessagingProvider } from './provider';
import { TelegramProvider } from './telegram.provider';
import { WhatsAppProvider } from './whatsapp.provider';

const providers: Record<Exclude<ChannelType, 'WEB'>, MessagingProvider> = {
  TELEGRAM: new TelegramProvider(),
  WHATSAPP: new WhatsAppProvider(),
};

export function getMessagingProvider(channel: ChannelType): MessagingProvider | null {
  if (channel === 'WEB') return null;
  return providers[channel] ?? null;
}

export function enabledChannels(): ChannelType[] {
  return (Object.keys(providers) as Array<Exclude<ChannelType, 'WEB'>>).filter((c) =>
    providers[c].isEnabled(),
  );
}

export type { MessagingProvider } from './provider';
