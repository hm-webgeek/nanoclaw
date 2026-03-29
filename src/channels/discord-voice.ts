import { createRequire } from 'module';
const _require = createRequire(import.meta.url);

// Ensure Homebrew ffmpeg is in PATH for audio transcoding
if (!process.env.PATH?.includes('/opt/homebrew/bin')) {
  process.env.PATH = `/opt/homebrew/bin:${process.env.PATH ?? ''}`;
}

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  EndBehaviorType,
  StreamType,
  type VoiceReceiver,
} from '@discordjs/voice';
import type { VoiceBasedChannel } from 'discord.js';
import { DeepgramClient } from '@deepgram/sdk';
import { Readable } from 'stream';
import { logger } from '../logger.js';
import type { OnInboundMessage, RegisteredGroup } from '../types.js';
import { ASSISTANT_NAME } from '../config.js';

// prism-media has no TypeScript declarations — import via require
const prism = _require('prism-media') as {
  opus: {
    Decoder: new (opts: {
      rate: number;
      channels: number;
      frameSize: number;
    }) => import('stream').Transform;
  };
};

interface VoiceSession {
  guildId: string;
  textChannelJid: string;
  player: ReturnType<typeof createAudioPlayer>;
  isSpeaking: boolean;
}

export class DiscordVoiceManager {
  private sessions = new Map<string, VoiceSession>();
  private textJidToGuild = new Map<string, string>();

  constructor(
    private readonly deepgramKey: string,
    private readonly azureKey: string,
    private readonly azureRegion: string,
    private readonly onMessage: OnInboundMessage,
    private readonly registeredGroups: () => Record<string, RegisteredGroup>,
  ) {}

  async join(
    voiceChannel: VoiceBasedChannel,
    textChannelJid: string,
  ): Promise<void> {
    const guildId = voiceChannel.guildId;
    this.leave(guildId);

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch {
      connection.destroy();
      throw new Error('Could not connect to voice channel within 30s');
    }

    const player = createAudioPlayer();
    connection.subscribe(player);

    const session: VoiceSession = {
      guildId,
      textChannelJid,
      player,
      isSpeaking: false,
    };
    this.sessions.set(guildId, session);
    this.textJidToGuild.set(textChannelJid, guildId);

    connection.receiver.speaking.on('start', (userId: string) => {
      logger.info({ userId, guildId }, 'Voice speaking started');
      if (session.isSpeaking) return;
      void this.handleSpeaker(userId, connection.receiver, session);
    });

    connection.receiver.speaking.on('end', (userId: string) => {
      logger.info({ userId, guildId }, 'Voice speaking ended');
    });

    // Auto-reconnect on unexpected disconnect
    connection.on(VoiceConnectionStatus.Disconnected, () => {
      Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]).catch(() => this.leave(guildId));
    });

    logger.info(
      { guildId, channel: voiceChannel.name, textChannelJid },
      'Joined voice channel',
    );
  }

  private async handleSpeaker(
    userId: string,
    receiver: VoiceReceiver,
    session: VoiceSession,
  ): Promise<void> {
    try {
      const dgClient = new DeepgramClient({ apiKey: this.deepgramKey });

      const dgConn = await dgClient.listen.v1.connect({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: 'nova-3' as any,
        language: 'en',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        smart_format: 'true' as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        interim_results: 'false' as any,
        endpointing: 800,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        encoding: 'linear16' as any,
        sample_rate: 48000,
        channels: 1,
        Authorization: `Token ${this.deepgramKey}`,
      });

      // Subscribe to audio immediately so we don't miss any speech while Deepgram connects
      const opusStream = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 1200 },
      });

      const decoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 1,
        frameSize: 960,
      });
      opusStream.pipe(decoder);

      // Buffer audio while Deepgram connection is establishing
      const audioBuffer: Buffer[] = [];
      let deepgramReady = false;

      decoder.on('data', (chunk: Buffer) => {
        if (!deepgramReady) {
          audioBuffer.push(chunk);
        } else if (dgConn.readyState === 1) {
          dgConn.sendMedia(chunk);
        }
      });

      opusStream.once('end', () => {
        try {
          // Tell Deepgram to finalize transcription, then close after results arrive
          dgConn.sendFinalize({ type: 'Finalize' });
          setTimeout(() => {
            try {
              dgConn.close();
            } catch {
              /* ignore */
            }
          }, 3000);
        } catch {
          /* ignore */
        }
      });

      dgConn.connect();
      try {
        await dgConn.waitForOpen();
        deepgramReady = true;
        logger.info(
          { userId, bufferedChunks: audioBuffer.length },
          'Deepgram open — flushing buffer',
        );
        // Flush buffered audio captured during connection establishment
        for (const chunk of audioBuffer) {
          if (dgConn.readyState === 1) dgConn.sendMedia(chunk);
        }
        audioBuffer.length = 0;
      } catch {
        logger.warn({ userId }, 'Deepgram connection timed out for user');
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dgConn.on('message', (msg: any) => {
        logger.info(
          {
            userId,
            msgType: msg?.type,
            isFinal: msg?.is_final,
            transcript: msg?.channel?.alternatives?.[0]?.transcript,
          },
          'Deepgram message received',
        );
        if (msg?.type !== 'Results' || !msg.is_final) return;
        const transcript: string =
          msg.channel?.alternatives?.[0]?.transcript ?? '';
        if (!transcript.trim()) return;

        logger.info({ userId, transcript }, 'Voice transcript received');

        const group = this.registeredGroups()[session.textChannelJid];
        if (!group) return;

        this.onMessage(session.textChannelJid, {
          id: `voice-${Date.now()}-${userId}`,
          chat_jid: session.textChannelJid,
          sender: userId,
          sender_name: 'Voice',
          content: `@${ASSISTANT_NAME} ${transcript}`,
          timestamp: new Date().toISOString(),
          is_from_me: false,
        });
      });

      dgConn.on('error', (err: Error) => {
        logger.error({ err: err.message }, 'Deepgram transcription error');
      });
    } catch (err) {
      logger.error({ err, userId }, 'Error handling speaker');
    }
  }

  async speak(guildId: string, text: string): Promise<void> {
    const session = this.sessions.get(guildId);
    if (!session) {
      logger.warn({ guildId }, 'speak(): no session');
      return;
    }

    if (!getVoiceConnection(guildId)) {
      logger.warn({ guildId }, 'speak(): no voice connection');
      return;
    }

    logger.info({ guildId, textLength: text.length }, 'Speaking via Azure TTS');
    session.isSpeaking = true;
    try {
      const mp3 = await this.synthesize(text);
      logger.info(
        { guildId, mp3Bytes: mp3.length },
        'Azure TTS synthesis complete',
      );
      const resource = createAudioResource(Readable.from(mp3), {
        inputType: StreamType.Arbitrary,
      });
      session.player.play(resource);
      await entersState(session.player, AudioPlayerStatus.Idle, 120_000);
    } catch (err) {
      logger.error({ err }, 'Voice speak error');
    } finally {
      session.isSpeaking = false;
    }
  }

  private async synthesize(text: string): Promise<Buffer> {
    const escaped = text.replace(
      /[&<>'"]/g,
      (c) =>
        (
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&apos;',
            '"': '&quot;',
          }) as Record<string, string>
        )[c] ?? c,
    );
    const ssml = `<speak version='1.0' xml:lang='en-AU'><voice name='en-AU-NatashaNeural'>${escaped}</voice></speak>`;

    const url = `https://${this.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.azureKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
      },
      body: ssml,
    });

    if (!response.ok) {
      throw new Error(
        `Azure TTS failed: ${response.status} ${response.statusText}`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  getGuildForJid(textChannelJid: string): string | undefined {
    return this.textJidToGuild.get(textChannelJid);
  }

  leave(guildId: string): void {
    const session = this.sessions.get(guildId);
    if (session) {
      this.textJidToGuild.delete(session.textChannelJid);
      this.sessions.delete(guildId);
    }
    const conn = getVoiceConnection(guildId);
    if (conn) conn.destroy();
    logger.info({ guildId }, 'Left voice channel');
  }

  isActive(guildId: string): boolean {
    return this.sessions.has(guildId);
  }
}
