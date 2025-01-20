/**
 * Audio Extraction Task
 * 
 * This task extracts audio from media files (video or audio) and saves it in the specified format.
 * It attempts to use direct stream copy when possible, falling back to transcoding when needed.
 * 
 * Key Features:
 * - Multiple output format support (MP3, AAC, WAV)
 * - High-quality audio settings
 * - Progress monitoring
 * - Automatic format detection and conversion
 * 
 * FFmpeg Command Explanation:
 * - '-vn': Remove video stream
 * - '-c:a': Audio codec selection (copy/mp3/aac/pcm)
 * - Quality settings vary by format:
 *   - MP3: 128kbps, 44.1kHz, Stereo
 *   - AAC: 128kbps, 48kHz, Stereo
 *   - WAV: 16-bit PCM, 44.1kHz, Stereo
 * 
 * Example Usage:
 * ```typescript
 * await client.run("audio_extract", {
 *   url: "https://example.com/video.mp4",
 *   format: "mp3"  // Optional: defaults to mp3
 * });
 * ```
 * 
 * @returns {AudioExtractOutput} Object containing success status, file locations, and metadata
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { spawn, ChildProcess } from "node:child_process";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import path from "path";
import os from "os";
import { unlink, writeFile } from "fs/promises";
import { createReadStream } from "fs";
import fetch from "node-fetch";
import { promisify } from "util";
import { exec } from "child_process";
import { PassThrough, Readable } from "stream";
import { pipeline } from "stream/promises";
import { 
  ReadableStream as NodeWebReadableStream,
  ReadableStreamDefaultReader
} from 'node:stream/web';

// Define the Web Stream type we're working with
type WebStream = NodeWebReadableStream<Uint8Array>;

const execAsync = promisify(exec);

// Supported output formats and their settings
interface FormatSettings {
  extension: string;
  codec: string;
  bitrate?: string;  // Optional since WAV doesn't use it
  sampleRate: string;
  contentType: string;
}

const FORMAT_SETTINGS: Record<string, FormatSettings> = {
  mp3: {
    extension: 'mp3',
    codec: 'libmp3lame',
    bitrate: '128k',
    sampleRate: '44100',
    contentType: 'audio/mpeg'
  },
  aac: {
    extension: 'm4a',
    codec: 'aac',
    bitrate: '128k',
    sampleRate: '48000',
    contentType: 'audio/mp4'
  },
  wav: {
    extension: 'wav',
    codec: 'pcm_s16le',
    sampleRate: '44100',
    contentType: 'audio/wav'
  }
};

type OutputFormat = keyof typeof FORMAT_SETTINGS;

// FFprobe type definitions
interface FFprobeStream {
  codec_type: string;
  codec_name: string;
  sample_rate?: string;
  channels?: number;
  bit_rate?: string;
}

interface FFprobeData {
  streams: FFprobeStream[];
  format?: {
    duration?: string;
    size?: string;
    bit_rate?: string;
    format_name?: string;
  };
}

// Constants for R2 optimization
const PART_SIZE = 20 * 1024 * 1024;  // 20MB chunks
const QUEUE_SIZE = 8;                 // 8 parallel uploads
const PROGRESS_LOG_INTERVAL = 1000;   // Log every 1 second

// Initialize S3 client for R2 with optimized settings
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
  forcePathStyle: true
});

export type AudioExtractOutput = {
  success: boolean;
  outputs: {
    format: OutputFormat;
    outputFilename: string;
    r2Key: string;
    r2Bucket: string;
    publicUrl: string;
    audioCodec: string;
    needsTranscode: boolean;
  }[];
  error?: string;
  strategy?: string;
  duration?: string;
  probeData?: FFprobeData;
};

// Helper function to upload a file to R2
async function uploadFile({
  format,
  path,
  r2Key,
  outputFilename,
  canCopy,
  audioStream,
  cleanup
}: {
  format: OutputFormat;
  path: string;
  r2Key: string;
  outputFilename: string;
  canCopy: boolean;
  audioStream: FFprobeStream;
  cleanup: boolean;
}): Promise<AudioExtractOutput['outputs'][0]> {
  return logger.trace("upload-to-r2", async (span) => {
    const formatSettings = FORMAT_SETTINGS[format];
    span.setAttribute("r2_key", r2Key);
    const startTime = Date.now();
    let lastProgressLog = 0;
    
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.R2_BUCKET!,
        Key: r2Key,
        Body: createReadStream(path),
        ContentType: formatSettings.contentType,
      },
      queueSize: QUEUE_SIZE,
      partSize: PART_SIZE,
      leavePartsOnError: false,
    });

    // Track upload progress
    upload.on('httpUploadProgress', (progress) => {
      const now = Date.now();
      if (now - lastProgressLog >= PROGRESS_LOG_INTERVAL) {
        lastProgressLog = now;
        const elapsedSeconds = (now - startTime) / 1000;
        const uploadedMB = (progress.loaded || 0) / 1024 / 1024;
        const totalMB = (progress.total || 0) / 1024 / 1024;
        const speedMBps = (uploadedMB / elapsedSeconds).toFixed(2);
        const percentComplete = progress.total ? 
          Math.round((progress.loaded || 0) / progress.total * 100) : 0;

        logger.info("Upload progress", { 
          format,
          uploadedMB: uploadedMB.toFixed(2),
          totalMB: totalMB.toFixed(2),
          speedMBps,
          percentComplete: `${percentComplete}%`,
          elapsedSeconds: Math.round(elapsedSeconds)
        });
      }
    });

    await upload.done();

    const endTime = Date.now();
    logger.info("Upload complete", { 
      format,
      r2Key,
      uploadDurationMs: endTime - startTime
    });

    // Clean up the file if requested
    if (cleanup) {
      try {
        await unlink(path);
        logger.info("Cleaned up temporary file", { format });
      } catch (cleanupError) {
        logger.warn("Failed to clean up temporary file", {
          format,
          error: cleanupError instanceof Error ? cleanupError.message : "Unknown error"
        });
      }
    }

    // Generate public URL
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${r2Key}`;
    logger.info("Generated public URL", { 
      format,
      publicUrl,
      r2Key
    });

    return {
      format,
      outputFilename,
      r2Key,
      r2Bucket: process.env.R2_BUCKET!,
      publicUrl,
      audioCodec: canCopy ? audioStream.codec_name : FORMAT_SETTINGS[format].codec,
      needsTranscode: !canCopy
    };
  });
}

// Helper function for chunked downloads
async function downloadInChunks(url: string, totalSize: number, numChunks = 8): Promise<Buffer> {
  const chunkSize = Math.ceil(totalSize / numChunks);
  const chunks: Buffer[] = new Array(numChunks);
  
  // Create download promises for each chunk
  const downloadPromises = Array.from({ length: numChunks }, async (_, index) => {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize - 1, totalSize - 1);
    
    const response = await fetch(url, {
      headers: {
        Range: `bytes=${start}-${end}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to download chunk ${index}: ${response.statusText}`);
    }

    const chunk = await response.buffer();
    chunks[index] = chunk;

    // Log progress
    const downloadedMB = (chunk.length / 1024 / 1024).toFixed(2);
    logger.info("Chunk download complete", { 
      chunk: index + 1, 
      of: numChunks,
      chunkSizeMB: downloadedMB
    });
  });

  // Download all chunks in parallel
  await Promise.all(downloadPromises);

  // Combine chunks in correct order
  return Buffer.concat(chunks);
}

export const audioExtract = task({
  id: "audio_extract",
  machine: {
    preset: "large-2x",
  },
  run: async (payload: { 
    url: string;
    formats?: OutputFormat[];
  }): Promise<AudioExtractOutput> => {
    const inputUrl = payload.url;
    const outputFormats = payload.formats || ['mp3'];
    const strategy = "download";
    let probeData: FFprobeData | undefined;
    let audioStream: FFprobeStream | undefined;
    const outputs: AudioExtractOutput['outputs'] = [];
    
    try {
      // Get file size first
      logger.info("Starting download", { inputUrl });
      const headResponse = await fetch(inputUrl, { method: 'HEAD' });
      if (!headResponse.ok) {
        throw new Error(`Failed to fetch file info: ${headResponse.statusText}`);
      }

      // Get the file content
      let buffer: Buffer;
      const contentLength = parseInt(headResponse.headers.get('content-length') ?? '0');
      
      if (!contentLength) {
        // Fall back to regular download if content-length is not available
        logger.info("Content-Length not available, falling back to regular download");
        const response = await fetch(inputUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch input file: ${response.statusText}`);
        }
        buffer = await response.buffer();
      } else {
        // Download in parallel chunks
        buffer = await downloadInChunks(inputUrl, contentLength);
      }

      logger.info("Download complete", { 
        sizeBytes: buffer.length,
        sizeMB: (buffer.length / 1024 / 1024).toFixed(2)
      });

      // Write to temporary input file
      const tempInputPath = path.join(os.tmpdir(), `input-${Date.now()}`);
      await writeFile(tempInputPath, buffer);
      
      try {
        // Get probe data from file
        const probe = spawn('ffprobe', [
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_format',
          '-show_streams',
          tempInputPath
        ]);
        let probeOutput = '';
        let probeError = '';
        
        probe.stdout.on('data', (data) => {
          probeOutput += data.toString();
        });

        probe.stderr.on('data', (data) => {
          probeError += data.toString();
        });

        await new Promise<void>((resolve, reject) => {
          probe.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Probe failed with code ${code}. Error: ${probeError}`));
          });
        });

        probeData = JSON.parse(probeOutput) as FFprobeData;

        // Get audio stream info
        audioStream = probeData?.streams.find(s => s.codec_type === 'audio');
        if (!audioStream) {
          throw new Error("No audio stream found in input file");
        }

        // First extract to WAV as intermediate format
        const intermediateWavPath = path.join(os.tmpdir(), `intermediate-${Date.now()}.wav`);
        
        logger.info("Extracting to intermediate WAV format", {
          audioCodec: audioStream.codec_name,
          sampleRate: audioStream.sample_rate,
          channels: audioStream.channels
        });

        // Extract to WAV first
        const wavArgs = [
          // Logging options
          '-hide_banner',
          '-loglevel', 'error',
          
          // Thread settings
          '-threads', '0',
          
          // Input options
          '-y',
          '-nostdin',
          '-i', tempInputPath,
          
          // Output options
          '-vn',
          '-c:a', 'pcm_s16le',  // High quality PCM
          '-ar', '48000',       // High sample rate
          '-ac', '2',           // Stereo
          intermediateWavPath
        ];

        const wavFfmpeg = spawn('ffmpeg', wavArgs);
        
        // Process WAV extraction
        await new Promise<void>((resolve, reject) => {
          let stderr = '';
          let lastProgress = '';

          wavFfmpeg.stderr?.on('data', (data: Buffer) => {
            const output = data.toString();
            stderr += output;
            lastProgress = output.trim();
            
            if (output.includes('time=')) {
              logger.info("WAV extraction progress", { progress: lastProgress });
            }
          });

          wavFfmpeg.on('close', (code: number | null) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`WAV extraction failed with code ${code}. Error: ${stderr}`));
            }
          });
          
          wavFfmpeg.on('error', (err: Error) => {
            reject(new Error(`WAV extraction error: ${err.message}. Error: ${stderr}`));
          });
        });

        // Process each requested format from WAV
        const uploadPromises: Promise<AudioExtractOutput['outputs'][0]>[] = [];

        for (const outputFormat of outputFormats) {
          if (outputFormat === 'wav') {
            // For WAV, start upload immediately
            const outputFilename = `audio-${Date.now()}.wav`;
            const r2Key = `extracted-audio/${outputFilename}`;
            uploadPromises.push(uploadFile({
              format: outputFormat,
              path: intermediateWavPath,
              r2Key,
              outputFilename,
              canCopy: false,
              audioStream: audioStream!,
              cleanup: false // Don't cleanup WAV yet as other formats need it
            }));
            continue;
          }

          const formatSettings = FORMAT_SETTINGS[outputFormat];
          const tempOutputPath = path.join(os.tmpdir(), `output-${Date.now()}.${formatSettings.extension}`);
          const outputFilename = `audio-${Date.now()}.${formatSettings.extension}`;
          const r2Key = `extracted-audio/${outputFilename}`;

          // Transcode from WAV to target format
          const ffmpegArgs = [
            // Logging options
            '-hide_banner',
            '-loglevel', 'error',
            
            // Thread settings
            '-threads', '0',
            
            // Input options
            '-y',
            '-nostdin',
            '-i', intermediateWavPath,
            
            // Audio settings
            '-c:a', formatSettings.codec,
            '-ar', formatSettings.sampleRate,
            '-ac', '2'
          ];

          // Add bitrate for lossy formats
          if (outputFormat !== 'wav' && formatSettings.bitrate) {
            ffmpegArgs.push('-b:a', formatSettings.bitrate);
          }

          // Add movflags for MP4/M4A output
          if (outputFormat === 'aac') {
            ffmpegArgs.push('-movflags', '+faststart');
          }

          ffmpegArgs.push(tempOutputPath);

          logger.info("Starting transcoding from WAV", { 
            outputFormat,
            codec: formatSettings.codec,
            sampleRate: formatSettings.sampleRate,
            bitrate: formatSettings.bitrate
          });

          const ffmpeg = spawn('ffmpeg', ffmpegArgs);
          
          // Process with FFmpeg and start upload immediately after
          const processPromise = new Promise<void>((resolve, reject) => {
            let stderr = '';
            let lastProgress = '';

            ffmpeg.stderr?.on('data', (data: Buffer) => {
              const output = data.toString();
              stderr += output;
              lastProgress = output.trim();
              
              if (output.includes('time=')) {
                logger.info("Transcoding progress", { 
                  format: outputFormat,
                  progress: lastProgress 
                });
              }
            });

            ffmpeg.on('close', (code: number | null) => {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`Transcoding failed with code ${code}. Error: ${stderr}`));
              }
            });
            
            ffmpeg.on('error', (err: Error) => {
              reject(new Error(`Transcoding error: ${err.message}. Error: ${stderr}`));
            });
          });

          // Start upload as soon as transcode completes
          uploadPromises.push(
            processPromise.then(() => uploadFile({
              format: outputFormat,
              path: tempOutputPath,
              r2Key,
              outputFilename,
              canCopy: false,
              audioStream: audioStream!,
              cleanup: true
            }))
          );
        }

        // Wait for all uploads to complete
        outputs.push(...await Promise.all(uploadPromises));

        // Clean up intermediate WAV file
        try {
          await Promise.all([
            unlink(tempInputPath),
            unlink(intermediateWavPath)
          ]);
          logger.info("Cleaned up temporary files");
        } catch (cleanupError) {
          logger.warn("Failed to clean up temporary files", {
            error: cleanupError instanceof Error ? cleanupError.message : "Unknown error"
          });
        }

        return {
          success: true,
          outputs,
          strategy,
          duration: probeData?.format?.duration,
          probeData
        };

      } catch (error: unknown) {
        logger.error("Audio extraction failed", {
          error: error instanceof Error ? error.message : "Unknown error",
          inputUrl,
          strategy
        });
        
        return {
          success: false,
          outputs: [],
          error: error instanceof Error ? error.message : "Unknown error",
          strategy
        };
      }

    } catch (error: unknown) {
      logger.error("Audio extraction failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        inputUrl,
        strategy
      });
      
      return {
        success: false,
        outputs: [],
        error: error instanceof Error ? error.message : "Unknown error",
        strategy
      };
    }
  },
}); 