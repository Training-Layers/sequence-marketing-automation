/**
 * Silence Generator Task
 * 
 * Generates one or more MP3 files containing silence of specified durations.
 * Each silence file is identified by a name and has a precise duration.
 * 
 * Features:
 * - High-quality MP3 output (128kbps, 44.1kHz)
 * - Precise duration control (supports decimals)
 * - Concurrent file generation and upload
 * - Organized R2 storage structure
 * 
 * Input:
 * ```typescript
 * {
 *   silences: Array<[string, number]>;  // Array of [name, duration] tuples
 * }
 * ```
 * 
 * Example:
 * ```json
 * {
 *   "silences": [
 *     ["gap-1", 1.1],  // 1.1 seconds
 *     ["gap-2", 2.3],  // 2.3 seconds
 *     ["gap-3", 0.8]   // 0.8 seconds
 *   ]
 * }
 * ```
 * 
 * For single silence generation:
 * ```json
 * {
 *   "silences": [
 *     ["single-gap", 1.5]  // One 1.5 second silence
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
 *     duration: number;
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
import { unlink } from "fs/promises";
import { spawn } from "child_process";

// Initialize S3 client for R2 storage
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

// Interface for a single silence file output
interface SilenceFile {
  name: string;        // File identifier
  duration: number;    // Duration in seconds
  r2Key: string;      // Storage path
  publicUrl: string;  // Public access URL
}

// Task output interface
interface SilenceGeneratorOutput {
  success: boolean;
  files: SilenceFile[];
  error?: string;
}

/**
 * Generate a single silence MP3 file
 * 
 * Uses FFmpeg to create high-quality silence:
 * - 44.1kHz sample rate
 * - 128kbps bitrate
 * - Mono channel
 * - Precise duration control
 */
function generateSilence(duration: number, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=mono',
      '-t', duration.toString(),
      '-b:a', '128k',
      '-acodec', 'libmp3lame',
      '-ar', '44100',
      '-ac', '1',
      '-y',
      outputPath
    ]);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Main task definition for silence generation
 * 
 * Workflow:
 * 1. Validate input format and durations
 * 2. Generate silence files concurrently
 * 3. Upload to R2 storage
 * 4. Clean up temporary files
 * 
 * Features:
 * - Concurrent processing
 * - Proper error handling
 * - Temporary file cleanup
 * - Detailed logging
 */
export const audioSilenceGenerate = task({
  id: "audio_silence_generate",
  machine: {
    preset: "small-1x",  // CPU-focused task
  },
  run: async (payload: {
    silences: Array<[string, number]>;  // [name, duration] tuples
  }): Promise<SilenceGeneratorOutput> => {
    const tempFiles: string[] = [];      // Track temp files for cleanup
    const outputFiles: SilenceFile[] = []; // Track generated files
    const timestamp = Date.now();        // Unique identifier for this run

    try {
      // Validate input
      if (!payload.silences?.length) {
        throw new Error("Must provide at least one silence specification");
      }

      // Validate all durations
      payload.silences.forEach(([name, duration], index) => {
        if (duration <= 0) {
          throw new Error(`Invalid duration at index ${index}: ${duration}`);
        }
        if (!name || typeof name !== 'string') {
          throw new Error(`Invalid name at index ${index}: ${name}`);
        }
      });

      logger.info("Starting silence generation", {
        count: payload.silences.length,
        totalDuration: payload.silences.reduce((sum, [_, duration]) => sum + duration, 0)
      });

      // Generate all silence files concurrently
      const generationPromises = payload.silences.map(async ([name, duration]) => {
        const filename = `silence-${name}-${timestamp}.mp3`;
        const filePath = path.join(os.tmpdir(), filename);
        tempFiles.push(filePath);

        // Generate the silence file
        await generateSilence(duration, filePath);

        // Upload to R2
        const r2Key = `silences/${filename}`;
        
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
          name,
          duration,
          r2Key,
          publicUrl: `${process.env.R2_PUBLIC_URL}/${r2Key}`
        });

        logger.info(`Generated silence file`, {
          name,
          duration,
          filename
        });
      });

      // Wait for all generations to complete
      await Promise.all(generationPromises);

      // Clean up temp files concurrently
      await Promise.all(tempFiles.map(file => 
        unlink(file).catch(err => 
          logger.warn("Failed to clean up temp file", { file, error: err })
        )
      ));

      logger.info("Silence generation completed", {
        totalFiles: outputFiles.length,
        totalDuration: outputFiles.reduce((sum, f) => sum + f.duration, 0)
      });

      return {
        success: true,
        files: outputFiles
      };

    } catch (error) {
      logger.error("Silence generation failed", {
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