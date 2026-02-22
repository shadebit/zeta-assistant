import { writeFileSync, unlinkSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { WinstonLogger } from '../logger/index.js';

export class AudioTranscriber {
  private readonly client: OpenAI;
  private readonly logger = new WinstonLogger(AudioTranscriber.name);
  private readonly tempDir: string;

  constructor(apiKey: string, tempDir: string) {
    this.client = new OpenAI({ apiKey });
    this.tempDir = tempDir;
  }

  async transcribe(base64Audio: string, mimetype: string): Promise<string> {
    const ext = mimetype.includes('ogg') ? 'ogg' : 'mp3';
    const tempPath = join(this.tempDir, `${randomUUID()}.${ext}`);

    try {
      writeFileSync(tempPath, Buffer.from(base64Audio, 'base64'));

      this.logger.info(`Transcribing audio (${ext})...`);

      const transcription = await this.client.audio.transcriptions.create({
        model: 'whisper-1',
        file: createReadStream(tempPath),
      });

      this.logger.info(`Transcription: "${transcription.text.slice(0, 80)}"`);
      return transcription.text;
    } finally {
      try {
        unlinkSync(tempPath);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
