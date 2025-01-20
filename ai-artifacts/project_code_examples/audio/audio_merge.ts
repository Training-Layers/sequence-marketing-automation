/**
 * Audio Merger Task
 * 
 * Merges multiple MP3 files into a single output file.
 * Automatically detects if files can be directly muxed or need transcoding.
 * 
 * Features:
 * - Smart format detection
 * - Direct muxing when possible (faster)
 * - Transcoding when needed (44.1kHz, 128kbps, mono)
 * - Organized R2 storage structure
 * - Progress tracking
 * 
 * Input:
 * ```typescript
 * {
 *   name: string;        // Output filename (without extension)
 *   files: string[];     // Array of MP3 URLs in desired order
 * }
 * ```
 * 
 * Output:
 * ```typescript
 * {
 *   success: boolean;
 *   outputFile: {
 *     name: string;      // Original output name
 *     r2Key: string;     // Storage path
 *     publicUrl: string; // Public access URL
 *     duration: number;  // Duration in seconds
 *     size: number;      // File size in bytes
 *     transcoded: boolean; // Whether transcoding was needed
 *   };
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
import { spawn } from "child_process";
import fetch from "node-fetch";

// Initialize S3 client for R2 storage
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

// Interface for audio file metadata
interface AudioMetadata {
  path: string;          // Local temp file path
  format: string;        // Audio format
  channels: number;      // Number of channels
  sampleRate: number;    // Sample rate in Hz
  bitrate: number;      // Bitrate in bps
  duration: number;      // Duration in seconds
}

// Interface for output file details
interface OutputFile {
  name: string;         // Original output name
  r2Key: string;        // Storage path
  publicUrl: string;    // Public access URL
  duration: number;     // Duration in seconds
  size: number;         // File size in bytes
  transcoded: boolean;  // Whether transcoding was needed
}

/**
 * Download a file from a URL to a local path
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
  logger.info("Downloading file", { url });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
  logger.info("Download complete", { url, size: buffer.length });
}

/**
 * Probe an audio file using FFprobe to get its metadata
 */
async function probeAudio(filePath: string): Promise<AudioMetadata> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ]);

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data;
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data;
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFprobe failed: ${stderr}`));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        const audioStream = data.streams.find((s: any) => s.codec_type === 'audio');
        
        resolve({
          path: filePath,
          format: audioStream.codec_name,
          channels: audioStream.channels,
          sampleRate: parseInt(audioStream.sample_rate),
          bitrate: parseInt(data.format.bit_rate),
          duration: parseFloat(data.format.duration)
        });
      } catch (error) {
        reject(new Error(`Failed to parse FFprobe output: ${error}`));
      }
    });
  });
}

/**
 * Check if a set of audio files can be directly muxed
 */
function canDirectlyMux(files: AudioMetadata[]): boolean {
  if (files.length === 0) return true;
  const first = files[0];
  
  return files.every(file => 
    file.format === first.format &&
    file.channels === first.channels &&
    file.sampleRate === first.sampleRate &&
    file.bitrate === first.bitrate
  );
}

/**
 * Merge audio files using FFmpeg
 */
async function mergeAudio(
  files: AudioMetadata[],
  outputPath: string,
  needsTranscoding: boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create FFmpeg input arguments
    const inputArgs = files.flatMap(file => ['-i', file.path]);
    
    // Create filter complex for concatenation
    const filterInputs = files.map((_, i) => `[${i}:a]`).join('');
    const filterComplex = `${filterInputs}concat=n=${files.length}:v=0:a=1[out]`;
    
    // Base arguments for all operations
    const baseArgs = [
      '-y',
      ...inputArgs,
      '-filter_complex', filterComplex,
      '-map', '[out]'
    ];
    
    // Add transcoding arguments if needed
    const outputArgs = needsTranscoding ? [
      '-acodec', 'libmp3lame',
      '-ar', '44100',
      '-ac', '1',
      '-b:a', '128k'
    ] : [];
    
    // Combine all arguments
    const ffmpegArgs = [...baseArgs, ...outputArgs, outputPath];
    
    // Run FFmpeg
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    
    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data;
    });
    
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg failed: ${stderr}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Main task definition for audio merging
 */
export const audioMerge = task({
  id: "audio_merge",
  run: async (payload: {
    name: string;
    files: string[];
  }): Promise<{
    success: boolean;
    outputFile?: OutputFile;
    error?: string;
    failedFiles?: { url: string; error: string }[];
  }> => {
    const tempFiles: string[] = [];
    const timestamp = Date.now();
    const failedFiles: { url: string; error: string }[] = [];
    
    try {
      // Validate input
      if (!payload.files?.length) {
        throw new Error("Must provide at least one audio file");
      }
      if (!payload.name) {
        throw new Error("Must provide an output name");
      }

      logger.info("Starting audio merge", {
        outputName: payload.name,
        fileCount: payload.files.length,
        files: payload.files
      });

      // Download all files
      const downloadedFiles = await Promise.all(
        payload.files.map(async (url, index) => {
          const filename = `input-${index}-${timestamp}.mp3`;
          const filePath = path.join(os.tmpdir(), filename);
          tempFiles.push(filePath);
          
          try {
            await downloadFile(url, filePath);
            return filePath;
          } catch (error) {
            failedFiles.push({
              url,
              error: error instanceof Error ? error.message : "Unknown error"
            });
            throw error; // Re-throw to fail the Promise.all
          }
        })
      );

      // If any downloads failed, abort
      if (failedFiles.length > 0) {
        throw new Error(`Failed to download ${failedFiles.length} files`);
      }

      // Probe all files
      const audioMetadata = await Promise.all(
        downloadedFiles.map(file => probeAudio(file))
      );

      // Check if we need to transcode
      const needsTranscoding = !canDirectlyMux(audioMetadata);
      
      logger.info("Audio analysis complete", {
        needsTranscoding,
        fileCount: audioMetadata.length
      });

      // Merge the files
      const outputFilename = `${payload.name}-${timestamp}.mp3`;
      const outputPath = path.join(os.tmpdir(), outputFilename);
      tempFiles.push(outputPath);

      await mergeAudio(audioMetadata, outputPath, needsTranscoding);

      // Get output file metadata
      const outputMetadata = await probeAudio(outputPath);

      // Upload to R2
      const r2Key = `audio/${outputFilename}`;
      
      await new Upload({
        client: s3Client,
        params: {
          Bucket: process.env.R2_BUCKET!,
          Key: r2Key,
          Body: await require('fs').promises.readFile(outputPath),
          ContentType: 'audio/mpeg',
        },
        partSize: 5 * 1024 * 1024,
        leavePartsOnError: false,
      }).done();

      // Clean up temp files
      await Promise.all(tempFiles.map(file => 
        unlink(file).catch(err => 
          logger.warn("Failed to clean up temp file", { file, error: err })
        )
      ));

      logger.info("Audio merge completed", {
        outputName: payload.name,
        duration: outputMetadata.duration,
        transcoded: needsTranscoding
      });

      return {
        success: true,
        outputFile: {
          name: payload.name,
          r2Key,
          publicUrl: `${process.env.R2_PUBLIC_URL}/${r2Key}`,
          duration: outputMetadata.duration,
          size: (await require('fs').promises.stat(outputPath)).size,
          transcoded: needsTranscoding
        }
      };

    } catch (error) {
      logger.error("Audio merge failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        failedFiles
      });

      // Clean up temp files
      await Promise.all(tempFiles.map(file => 
        unlink(file).catch(() => {/* ignore cleanup errors */})
      ));

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        failedFiles: failedFiles.length > 0 ? failedFiles : undefined
      };
    }
  },
}); 