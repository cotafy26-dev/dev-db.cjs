import { env } from '../core/env';
import { logger } from '../core/logger';
import { AppError } from '../core/errors';

/**
 * Transcricao de audio (STT) e sintese de voz (TTS) para os canais de mensagem.
 * STT usa endpoint compativel com OpenAI (/audio/transcriptions) - por padrao o
 * mesmo provedor da IA (Groq Whisper). TTS e opcional (TTS_ENABLED).
 */

export function sttEnabled(): boolean {
  return env.STT_ENABLED && Boolean(env.STT_API_KEY || env.AI_API_KEY);
}

export function ttsEnabled(): boolean {
  return env.TTS_ENABLED && Boolean(env.TTS_API_KEY);
}

export async function transcribeAudio(input: {
  buffer: Buffer;
  filename?: string;
  mime?: string;
}): Promise<string> {
  const base = (env.STT_BASE_URL || env.AI_BASE_URL).replace(/\/$/, '');
  const key = env.STT_API_KEY || env.AI_API_KEY;
  if (!key) throw new AppError('STT_DISABLED', 'Transcricao de audio nao configurada', 501);

  const sizeMb = input.buffer.byteLength / (1024 * 1024);
  if (sizeMb > env.STT_MAX_MB) {
    throw new AppError('STT_TOO_LARGE', `Audio muito grande (${sizeMb.toFixed(1)}MB, limite ${env.STT_MAX_MB}MB)`, 413);
  }

  const form = new FormData();
  form.append('file', new Blob([input.buffer], { type: input.mime || 'audio/ogg' }), input.filename || 'audio.ogg');
  form.append('model', env.STT_MODEL);
  form.append('language', 'pt');
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const res = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    logger.warn({ status: res.status, body: body.slice(0, 300) }, 'STT falhou');
    throw new AppError('STT_FAILED', 'Nao consegui transcrever o audio agora.', 502);
  }
  const json = (await res.json()) as { text?: string };
  return (json.text || '').trim();
}

export async function synthesizeSpeech(text: string): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!ttsEnabled() || !text.trim()) return null;
  const clean = text.replace(/[*_`#>]/g, '').slice(0, 900);

  try {
    if (env.TTS_PROVIDER === 'elevenlabs') {
      const voice = env.TTS_VOICE || '21m00Tcm4TlvDq8ikWAM';
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': env.TTS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean, model_id: env.TTS_MODEL || 'eleven_multilingual_v2' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { buffer: Buffer.from(await res.arrayBuffer()), mime: 'audio/mpeg' };
    }

    // openai-compativel (/audio/speech) - OpenAI, ou qualquer endpoint que implemente
    const base = (env.TTS_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const res = await fetch(`${base}/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TTS_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.TTS_MODEL || 'tts-1',
        voice: env.TTS_VOICE || 'alloy',
        input: clean,
        response_format: 'opus',
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { buffer: Buffer.from(await res.arrayBuffer()), mime: 'audio/ogg' };
  } catch (err) {
    logger.warn({ err }, 'TTS falhou - segue so com texto');
    return null;
  }
}
