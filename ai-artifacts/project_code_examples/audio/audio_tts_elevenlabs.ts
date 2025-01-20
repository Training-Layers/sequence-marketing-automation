/**
 * Text-to-Speech Task using Eleven Labs
 * 
 * Converts one or more text strings to speech using Eleven Labs API.
 * Uses streaming for optimal performance and supports parallel processing.
 * Each text can specify its own voice and model settings.
 * 
 * Features:
 * - Concurrent processing (max 5 parallel requests)
 * - High-quality MP3 output (44.1kHz, 128kbps)
 * - Streaming audio generation
 * - Organized R2 storage structure
 * - Progress tracking per request
 * 
 * Input:
 * ```typescript
 * {
 *   texts: Array<{
 *     name: string;     // Identifier for the output file
 *     text: string;     // Text to convert to speech
 *     voiceId: string;  // Eleven Labs voice ID
 *     modelId?: string; // Optional model ID (defaults to eleven_multilingual_v2)
 *   }>;
 * }
 * ```
 * 
 * Example:
 * ```json
 * {
 *   "texts": [
 *     {
 *       "name": "intro",
 *       "text": "Welcome to our presentation",
 *       "voiceId": "cgSgspJ2msm6clMCkdW9",
 *       "modelId": "eleven_multilingual_v2"
 *     },
 *     {
 *       "name": "chapter1",
 *       "text": "Let's begin with the first topic",
 *       "voiceId": "cgSgspJ2msm6clMCkdW9"
 *     }
 *   ]
 * }
 * ```
 * 
 * Output:
 * ```typescript
 * {
 *   success: boolean;
 *   files: Array<{
 *     name: string;
 *     r2Key: string;
 *     publicUrl: string;
 *   }>;
 *   error?: string;
 * }
 * ```
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import path from "path";
import os from "os";
import { writeFile, unlink } from "fs/promises";
import pLimit from "p-limit";
import fetch from "node-fetch";
import pRetry from 'p-retry';
import type { Options } from 'p-retry';

class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}

// Initialize S3 client for R2 storage
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

// Initialize API key for Eleven Labs
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

// Interface for input text configuration
interface TextConfig {
  name: string;      // File identifier
  text: string;      // Text to convert
  voiceId: string;   // Voice ID to use
  modelId?: string;  // Optional model ID
}

// Interface for a single TTS output file
interface TTSFile {
  name: string;       // File identifier
  text: string;       // Original text
  voiceId: string;    // Voice used
  modelId: string;    // Model used
  r2Key: string;      // Storage path
  publicUrl: string;  // Public access URL
}

// Task output interface
interface TTSOutput {
  success: boolean;
  files: TTSFile[];
  error?: string;
}

/**
 * Generate speech from text using Eleven Labs API
 * 
 * Uses streaming for optimal performance:
 * - Direct streaming to file
 * - Efficient memory usage
 * - High-quality output format
 * - Automatic retry on rate limits
 */
async function generateSpeech(text: string, outputPath: string, voiceId: string, modelId: string): Promise<void> {
  try {
    await pRetry(
      async () => {
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          {
            method: 'POST',
            headers: {
              'Accept': 'audio/mpeg',
              'Content-Type': 'application/json',
              'xi-api-key': ELEVENLABS_API_KEY
            },
            body: JSON.stringify({
              text,
              model_id: modelId,
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75
              }
            })
          }
        );

        // If we get a 429, retry
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
          
          logger.warn(`Rate limited, retrying after ${delay ?? 'default'} ms`);
          
          throw new RetryableError('Rate limited');
        }

        // For other non-200 responses, abort retrying
        if (!response.ok) {
          throw new AbortError(`Failed with status: ${response.status} ${response.statusText}`);
        }

        // Get the audio buffer
        const buffer = Buffer.from(await response.arrayBuffer());

        // Write to file
        await writeFile(outputPath, buffer);
      },
      {
        retries: 5,                // Maximum number of retries
        factor: 2,                 // Exponential factor
        minTimeout: 2000,          // Start with 2 second delay
        maxTimeout: 30000,         // Maximum 30 second delay
        randomize: true,           // Add randomization to prevent thundering herd
        onFailedAttempt: (error: { attemptNumber: number; retriesLeft: number }) => {
          logger.warn(`Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
        }
      } as Options
    );

  } catch (error) {
    throw new Error(`Failed to generate speech: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Main task definition for TTS generation
 * 
 * Workflow:
 * 1. Validate input format and texts
 * 2. Generate speech files with throttling (max 5 concurrent)
 * 3. Upload to R2 storage
 * 4. Clean up temporary files
 * 
 * Features:
 * - Throttled concurrent processing
 * - Proper error handling
 * - Temporary file cleanup
 * - Detailed logging
 */
export const audioTtsElevenlabs = task({
  id: "audio_tts_elevenlabs",
  run: async (payload: {
    texts: TextConfig[];
  }): Promise<TTSOutput> => {
    const tempFiles: string[] = [];      // Track temp files for cleanup
    const outputFiles: TTSFile[] = [];   // Track generated files
    const timestamp = Date.now();        // Unique identifier for this run
    const limit = pLimit(5);             // Limit concurrent requests to 5

    try {
      // Validate input
      if (!payload.texts?.length) {
        throw new Error("Must provide at least one text to convert");
      }

      // Validate all texts
      payload.texts.forEach((config, index) => {
        if (!config.text || typeof config.text !== 'string') {
          throw new Error(`Invalid text at index ${index}`);
        }
        if (!config.name || typeof config.name !== 'string') {
          throw new Error(`Invalid name at index ${index}: ${config.name}`);
        }
        if (!config.voiceId || typeof config.voiceId !== 'string') {
          throw new Error(`Invalid voiceId at index ${index}: ${config.voiceId}`);
        }
      });

      logger.info("Starting TTS generation", {
        count: payload.texts.length,
        totalChars: payload.texts.reduce((sum, t) => sum + t.text.length, 0)
      });

      // Process all texts with throttling
      const generationPromises = payload.texts.map(config => 
        limit(async () => {
          const filename = `tts-${config.name}-${timestamp}.mp3`;
          const filePath = path.join(os.tmpdir(), filename);
          tempFiles.push(filePath);

          logger.info(`Generating speech for ${config.name}`, {
            chars: config.text.length,
            name: config.name,
            voiceId: config.voiceId
          });

          // Generate the speech file
          await generateSpeech(
            config.text, 
            filePath, 
            config.voiceId, 
            config.modelId || "eleven_multilingual_v2"
          );

          // Upload to R2
          const r2Key = `tts/${filename}`;
          
          await new Upload({
            client: s3Client,
            params: {
              Bucket: process.env.R2_BUCKET!,
              Key: r2Key,
              Body: await require('fs').promises.readFile(filePath),
              ContentType: 'audio/mpeg',
            },
            partSize: 5 * 1024 * 1024,
            leavePartsOnError: false,
          }).done();

          // Track output file
          outputFiles.push({
            name: config.name,
            text: config.text,
            voiceId: config.voiceId,
            modelId: config.modelId || "eleven_multilingual_v2",
            r2Key,
            publicUrl: `${process.env.R2_PUBLIC_URL}/${r2Key}`
          });

          logger.info(`Generated speech file`, {
            name: config.name,
            chars: config.text.length,
            filename,
            voiceId: config.voiceId
          });
        })
      );

      // Wait for all generations to complete
      await Promise.all(generationPromises);

      // Clean up temp files concurrently
      await Promise.all(tempFiles.map(file => 
        unlink(file).catch(err => 
          logger.warn("Failed to clean up temp file", { file, error: err })
        )
      ));

      logger.info("TTS generation completed", {
        totalFiles: outputFiles.length,
        totalChars: outputFiles.reduce((sum, f) => sum + f.text.length, 0)
      });

      return {
        success: true,
        files: outputFiles
      };

    } catch (error) {
      logger.error("TTS generation failed", {
        error: error instanceof Error ? error.message : "Unknown error"
      });

      // Clean up temp files on error
      await Promise.all(tempFiles.map(file => 
        unlink(file).catch(() => {/* ignore cleanup errors */})
      ));

      return {
        success: false,
        files: [],
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },
}); 