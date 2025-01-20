/**
 * Audio Conversion Task
 * 
 * This task handles the conversion of various audio formats to standardized MP3 format
 * with consistent quality settings. It supports both direct copying of compatible MP3s
 * and transcoding of other formats.
 * 
 * Key Features:
 * - Automatic format detection using FFprobe
 * - Smart transcoding decision based on audio quality
 * - Consistent output format: 44.1kHz, stereo, 192kbps MP3
 * - Progress tracking for long conversions
 * - Efficient R2 storage integration
 * 
 * Input:
 * ```typescript
 * {
 *   url: string;  // URL to source audio file
 * }
 * ```
 * 
 * Output:
 * ```typescript
 * {
 *   success: boolean;
 *   outputFilename: string;
 *   r2Key?: string;
 *   r2Bucket?: string;
 *   error?: string;
 *   strategy?: string;
 *   inputCodec?: string;
 *   needsTranscode?: boolean;
 *   probeData?: FFprobeData;
 * }
 * ```
 * 
 * Processing Steps:
 * 1. Download source audio file
 * 2. Probe format with FFprobe
 * 3. Determine if transcoding is needed
 * 4. Convert if necessary using FFmpeg
 * 5. Upload to R2 storage
 * 6. Clean up temporary files
 * 
 * Quality Standards:
 * - Sample Rate: 44.1 kHz
 * - Channels: Stereo (2)
 * - Bitrate: 192 kbps
 * - Format: MP3
 * 
 * Performance Optimizations:
 * - Skip transcoding for compatible MP3s
 * - Efficient memory usage with streams
 * - Concurrent cleanup operations
 * 
 * Error Handling:
 * - Graceful cleanup of temporary files
 * - Detailed error logging with context
 * - Progress tracking for debugging
 */

import { task } from "@trigger.dev/sdk/v3";
import { spawn, ChildProcess } from "node:child_process";
import { logger } from "@trigger.dev/sdk/v3";
import path from "path";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { unlink, writeFile } from "fs/promises";
import { createReadStream } from "fs";
import fetch from "node-fetch";
import os from "os";
import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

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

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export type ConvertToMp3Output = {
  success: boolean;
  outputFilename: string;
  r2Key?: string;
  r2Bucket?: string;
  error?: string;
  strategy?: string;
  inputCodec?: string;
  needsTranscode?: boolean;
  probeData?: FFprobeData;
};

export const convertToMp3 = task({
  id: "audio_convert_mp3",
  machine: {
    preset: "small-2x",
  },
  run: async (payload: { url: string }): Promise<ConvertToMp3Output> => {
    const inputUrl = payload.url;
    const strategy = "download"; // Using download strategy
    let inputCodec = "unknown";
    let tempInputPath: string | null = null;
    let needsTranscode = true;
    let probeData: FFprobeData | undefined;
    
    logger.info("Starting FFmpeg conversion task", { 
      inputUrl,
      strategy,
      timestamp: new Date().toISOString()
    });

    try {
      // Download the file first
      const response = await fetch(inputUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch input file: ${response.statusText}`);
      }

      // Create temporary input file
      tempInputPath = path.join(os.tmpdir(), `input-${Date.now()}`);
      const buffer = await response.buffer();
      await writeFile(tempInputPath, buffer);
      
      logger.info("File downloaded successfully", { 
        tempInputPath,
        size: buffer.length
      });

      // Probe the file to check format
      const probeCommand = `ffprobe -v quiet -print_format json -show_format -show_streams "${tempInputPath}"`;
      const { stdout } = await execAsync(probeCommand);
      probeData = JSON.parse(stdout) as FFprobeData;
      
      const audioStream = probeData.streams.find(stream => stream.codec_type === 'audio');
      if (!audioStream) {
        throw new Error("No audio stream found in input file");
      }

      inputCodec = audioStream.codec_name;
      
      // Check if we need to transcode
      needsTranscode = !(
        inputCodec === 'mp3' && 
        audioStream.sample_rate === '44100' && 
        audioStream.channels === 2 &&
        audioStream.bit_rate && parseInt(audioStream.bit_rate) >= 192000
      );

      logger.info("File probe results", {
        inputCodec,
        sampleRate: audioStream.sample_rate,
        channels: audioStream.channels,
        bitRate: audioStream.bit_rate,
        needsTranscode,
        format: probeData.format?.format_name
      });

      const outputFilename = `output-${Date.now()}.mp3`;
      const outputPath = path.join(os.tmpdir(), outputFilename);

      await logger.trace("ffmpeg-conversion", async (span) => {
        span.setAttribute("input_url", inputUrl);
        span.setAttribute("temp_input_path", tempInputPath || "");
        span.setAttribute("output_path", outputPath);
        span.setAttribute("strategy", strategy);
        span.setAttribute("input_codec", inputCodec);
        span.setAttribute("needs_transcode", needsTranscode);

        if (needsTranscode) {
          // Set up FFmpeg process with proper typing
          const ffmpeg: ChildProcess = spawn('ffmpeg', [
            '-i', tempInputPath || "",
            '-vn',           // Disable video
            '-ar', '44100',  // Audio sample rate
            '-ac', '2',      // Stereo
            '-b:a', '192k',  // Bitrate
            '-f', 'mp3',     // Force mp3 format
            outputPath       // Output file
          ]);

          // Handle FFmpeg process output with proper typing
          ffmpeg.stderr?.on('data', (data: Buffer) => {
            const output = data.toString();
            logger.info("FFmpeg progress", { output });
          });

          // Wait for FFmpeg to finish with proper typing
          await new Promise<void>((resolve, reject) => {
            ffmpeg.on('close', (code: number) => {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`FFmpeg process exited with code ${code}`));
              }
            });
            ffmpeg.on('error', (err: Error) => reject(err));
          });

          logger.info("FFmpeg conversion complete", { 
            outputPath,
            strategy,
            inputCodec
          });
        } else {
          // If no transcode needed, just copy the file
          await writeFile(outputPath, buffer);
          logger.info("File copied without transcoding", {
            outputPath,
            inputCodec
          });
        }
      });

      // Upload to R2
      const r2Key = `audio-files/${outputFilename}`;
      
      await logger.trace("upload-to-r2", async (span) => {
        span.setAttribute("r2_key", r2Key);
        const startTime = Date.now();
        
        const upload = new Upload({
          client: s3Client,
          params: {
            Bucket: process.env.R2_BUCKET!,
            Key: r2Key,
            Body: createReadStream(outputPath),
            ContentType: "audio/mp3",
          },
          queueSize: 4,
          partSize: 10 * 1024 * 1024,
          leavePartsOnError: false,
        });

        // Track upload progress
        upload.on("httpUploadProgress", (progress) => {
          const currentTime = Date.now();
          logger.info("Upload progress", {
            loaded: progress.loaded,
            total: progress.total,
            part: progress.part,
            timeElapsed: currentTime - startTime,
            key: r2Key
          });
        });

        try {
          span.setAttribute("upload_started", true);
          span.setAttribute("upload_start_time", startTime);
          
          const result = await upload.done();
          
          const endTime = Date.now();
          span.setAttribute("upload_complete", true);
          span.setAttribute("upload_end_time", endTime);
          span.setAttribute("upload_duration_ms", endTime - startTime);
          span.setAttribute("upload_key", result.Key || "");
          
          logger.info("Audio file uploaded to R2", { 
            r2Key,
            uploadKey: result.Key,
            bucket: process.env.R2_BUCKET,
            uploadDurationMs: endTime - startTime,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString()
          });
        } catch (uploadError) {
          const errorTime = Date.now();
          span.setAttribute("upload_error", true);
          span.setAttribute("upload_error_time", errorTime);
          span.setAttribute("upload_duration_until_error_ms", errorTime - startTime);
          span.setAttribute("error", uploadError instanceof Error ? uploadError.message : "Unknown upload error");
          throw uploadError;
        }
      });

      // Clean up temporary files
      try {
        if (tempInputPath) {
          await unlink(tempInputPath);
          logger.info("Temporary input file cleaned up", { tempInputPath });
        }
        await unlink(outputPath);
        logger.info("Temporary output file cleaned up", { outputPath });
      } catch (cleanupError) {
        logger.warn("Failed to clean up temporary files", { 
          tempInputPath,
          outputPath,
          error: cleanupError instanceof Error ? cleanupError.message : "Unknown error" 
        });
      }

      logger.info("FFmpeg task completed successfully", {
        r2Key,
        outputFilename,
        strategy,
        inputCodec,
        needsTranscode,
        processingTime: Date.now() - parseInt(outputFilename.split("-")[1]),
      });

      return {
        success: true,
        outputFilename,
        r2Key,
        r2Bucket: process.env.R2_BUCKET,
        strategy,
        inputCodec,
        needsTranscode,
        probeData
      };
    } catch (error) {
      // Clean up temporary input file if it exists
      if (tempInputPath) {
        try {
          await unlink(tempInputPath);
          logger.info("Cleaned up temporary input file after error", { tempInputPath });
        } catch (cleanupError) {
          logger.warn("Failed to clean up temporary input file after error", {
            tempInputPath,
            error: cleanupError instanceof Error ? cleanupError.message : "Unknown error"
          });
        }
      }

      logger.error("FFmpeg conversion or upload failed", { 
        error: error instanceof Error ? error.message : "Unknown error",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        inputUrl,
        strategy,
        inputCodec,
        needsTranscode
      });
      
      return {
        success: false,
        outputFilename: "",
        error: error instanceof Error ? error.message : "Unknown error",
        strategy,
        inputCodec,
        needsTranscode,
        probeData
      };
    }
  },
}); 