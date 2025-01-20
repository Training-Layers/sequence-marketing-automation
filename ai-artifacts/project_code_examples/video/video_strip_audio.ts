/**
 * No Audio Video Task
 * 
 * This task removes the audio track from a video file while preserving:
 * - Original video quality (no re-encoding)
 * - Original container format (WebM stays WebM, MP4 stays MP4)
 * 
 * Key Features:
 * - Preserves original video quality (no re-encoding)
 * - Maintains input container format
 * - Hardware acceleration for container format conversion
 * - Progress monitoring for muxing operations
 * - Automatic cleanup of temporary files
 * 
 * FFmpeg Command Explanation:
 * - '-c:v copy': Copy video stream without re-encoding
 * - '-an': Remove audio stream
 * - '-movflags +faststart': Optimize for web playback (MP4 only)
 * 
 * Example Usage:
 * ```typescript
 * await client.run("video_strip_audio", {
 *   url: "https://example.com/video.mp4" // or .webm
 * });
 * ```
 * 
 * @returns {NoAudioVideoOutput} Object containing success status, file locations, and metadata
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

const execAsync = promisify(exec);

// FFprobe type definitions
interface FFprobeStream {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
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

export type NoAudioVideoOutput = {
  success: boolean;
  outputFilename: string;
  r2Key?: string;
  r2Bucket?: string;
  publicUrl?: string;
  error?: string;
  strategy?: string;
  videoCodec?: string;
  containerFormat?: string;
  needsTranscode?: boolean;
  probeData?: FFprobeData;
};

export const videoStripAudio = task({
  id: "video_strip_audio",
  machine: {
    preset: "medium-1x",
  },
  run: async (payload: { url: string }): Promise<NoAudioVideoOutput> => {
    const inputUrl = payload.url;
    const strategy = "mux";
    let tempInputPath: string | null = null;
    let probeData: FFprobeData | undefined;
    
    logger.info("Starting no-audio video task", { 
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
      
      const videoStream = probeData.streams.find(stream => stream.codec_type === 'video');
      const formatName = probeData.format?.format_name?.toLowerCase() || '';

      if (!videoStream) {
        throw new Error("No video stream found in input file");
      }

      // Determine container format
      let containerFormat = 'mp4';
      let contentType = 'video/mp4';
      
      if (formatName.includes('webm') || formatName.includes('matroska')) {
        containerFormat = 'webm';
        contentType = 'video/webm';
      }

      logger.info("File probe results", {
        videoCodec: videoStream.codec_name,
        resolution: `${videoStream.width}x${videoStream.height}`,
        format: formatName,
        containerFormat
      });

      const outputFilename = `noaudio-${Date.now()}.${containerFormat}`;
      const outputPath = path.join(os.tmpdir(), outputFilename);

      await logger.trace("ffmpeg-noaudio", async (span) => {
        span.setAttribute("input_url", inputUrl);
        span.setAttribute("temp_input_path", tempInputPath || "");
        span.setAttribute("output_path", outputPath);
        span.setAttribute("strategy", strategy);
        span.setAttribute("video_codec", videoStream.codec_name);
        span.setAttribute("container_format", containerFormat);

        if (!tempInputPath) {
          throw new Error('Input path is required');
        }

        // Base FFmpeg arguments
        const ffmpegArgs = [
          // Hardware acceleration
          '-hwaccel', 'auto',
          '-hwaccel_output_format', 'auto',
          
          // Input options
          '-y',                // Overwrite output without asking
          '-nostdin',          // Prevent stdin interaction
          '-i', tempInputPath, // Input file
          
          // Video settings - copy without re-encoding
          '-c:v', 'copy',
          
          // Remove audio by not mapping it
          '-an'
        ];

        // Add container-specific options
        if (containerFormat === 'mp4') {
          ffmpegArgs.push('-movflags', '+faststart');
        }

        // Add output path
        ffmpegArgs.push(outputPath);

        logger.info("Starting FFmpeg process for audio removal", { 
          ffmpegArgs,
          inputResolution: `${videoStream.width}x${videoStream.height}`,
          videoCodec: videoStream.codec_name,
          containerFormat
        });
        
        const ffmpeg: ChildProcess = spawn('ffmpeg', ffmpegArgs);
        
        let stderr = '';
        let lastProgress = '';

        // Collect stderr for error reporting
        ffmpeg.stderr?.on('data', (data: Buffer) => {
          const output = data.toString();
          stderr += output;
          lastProgress = output.trim();
          
          // Only log significant progress updates
          if (output.includes('time=')) {
            logger.info("FFmpeg muxing progress", { progress: lastProgress });
          }
        });

        // Wait for FFmpeg to finish
        await new Promise<void>((resolve, reject) => {
          ffmpeg.on('close', (code: number | null) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`FFmpeg process failed with code ${code}. Error: ${stderr}`));
            }
          });
          
          ffmpeg.on('error', (err: Error) => {
            reject(new Error(`FFmpeg process error: ${err.message}. Error: ${stderr}`));
          });

          // Add timeout handling
          const timeout = setTimeout(() => {
            ffmpeg.kill('SIGTERM');
            reject(new Error(`FFmpeg process timed out after 30 minutes. Last progress: ${lastProgress}`));
          }, 30 * 60 * 1000);

          ffmpeg.on('close', () => clearTimeout(timeout));
        });

        logger.info("Audio removal complete", { 
          outputPath,
          strategy,
          videoCodec: videoStream.codec_name,
          containerFormat
        });
      });

      // Upload to R2
      const r2Key = `noaudio-videos/${outputFilename}`;
      
      await logger.trace("upload-to-r2", async (span) => {
        span.setAttribute("r2_key", r2Key);
        const startTime = Date.now();
        
        const upload = new Upload({
          client: s3Client,
          params: {
            Bucket: process.env.R2_BUCKET!,
            Key: r2Key,
            Body: createReadStream(outputPath),
            ContentType: contentType,
          },
          queueSize: 4,
          partSize: 10 * 1024 * 1024,
          leavePartsOnError: false,
        });

        try {
          const result = await upload.done();
          const endTime = Date.now();
          
          logger.info("Video file uploaded to R2", { 
            r2Key,
            durationSeconds: Math.round((endTime - startTime) / 1000),
            uploadKey: result.Key,
            bucket: process.env.R2_BUCKET
          });

          // Generate public URL
          const publicUrl = `${process.env.R2_PUBLIC_URL}/${r2Key}`;
          return {
            success: true,
            outputFilename,
            r2Key,
            r2Bucket: process.env.R2_BUCKET,
            publicUrl,
            strategy,
            videoCodec: videoStream.codec_name,
            containerFormat,
            needsTranscode: false,
            probeData
          };
        } catch (uploadError) {
          throw new Error(`Failed to upload to R2: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`);
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
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        });
      }

      return {
        success: true,
        outputFilename,
        r2Key,
        r2Bucket: process.env.R2_BUCKET,
        publicUrl: `${process.env.R2_PUBLIC_URL}/${r2Key}`,
        strategy,
        videoCodec: videoStream.codec_name,
        containerFormat,
        needsTranscode: false,
        probeData
      };

    } catch (error) {
      logger.error("No-audio video task failed", {
        error: error instanceof Error ? error.message : String(error),
        inputUrl
      });

      // Clean up temporary files on error
      try {
        if (tempInputPath) {
          await unlink(tempInputPath);
          logger.info("Cleaned up temporary input file after error", { tempInputPath });
        }
      } catch (cleanupError) {
        logger.warn("Failed to clean up temporary file after error", {
          tempInputPath,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        });
      }

      return {
        success: false,
        outputFilename: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}); 