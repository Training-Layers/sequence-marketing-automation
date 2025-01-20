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
  sample_rate?: string;
  channels?: number;
  bit_rate?: string;
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

// Processing strategy definitions
enum ProcessingStrategy {
  DIRECT_COPY = "DIRECT_COPY",              // Both video and audio can be copied (-c copy)
  COPY_VIDEO_REENCODE_AUDIO = "COPY_VIDEO_REENCODE_AUDIO", // Video can be copied, audio needs work
  COPY_AUDIO_REENCODE_VIDEO = "COPY_AUDIO_REENCODE_VIDEO", // Audio can be copied, video needs work
  FULL_TRANSCODE = "FULL_TRANSCODE"         // Both streams need processing
}

interface ProcessingRequirements {
  needsVideoReencode: boolean;
  needsAudioReencode: boolean;
  needsResize: boolean;
  needsFpsChange: boolean;
  reason: string[];
}

// Helper functions for processing analysis
function analyzeProcessingNeeds(
  videoStream: FFprobeStream,
  audioStream: FFprobeStream | undefined,
  options: {
    targetHeight?: number,
    targetFps?: number,
    forceUpscale?: boolean // default false
  }
): ProcessingRequirements {
  const reasons: string[] = [];
  
  // Video Codec Check
  const isVideoCompatible = videoStream.codec_name === 'h264';
  if (!isVideoCompatible) {
    reasons.push(`Input video codec ${videoStream.codec_name} needs conversion to h264`);
  }

  // Resize Check
  const needsResize = !!(options.targetHeight && videoStream.height && (
    options.forceUpscale === true
      ? videoStream.height !== options.targetHeight
      : videoStream.height > options.targetHeight
  ));
  if (needsResize) {
    reasons.push(`Resolution change needed: ${videoStream.height}p → ${options.targetHeight}p`);
  }

  // FPS Check
  const sourceFps = videoStream.r_frame_rate 
    ? eval(videoStream.r_frame_rate)
    : undefined;
  const needsFpsChange = options.targetFps && sourceFps && sourceFps > options.targetFps;
  if (needsFpsChange) {
    reasons.push(`FPS reduction needed: ${sourceFps} → ${options.targetFps}`);
  }

  // Audio Check
  const isAudioCompatible = !audioStream || (
    audioStream.codec_name === 'aac' &&
    audioStream.sample_rate === '48000' &&
    audioStream.channels === 2 &&
    audioStream.bit_rate && 
    parseInt(audioStream.bit_rate) <= 128000
  );
  if (!isAudioCompatible && audioStream) {
    reasons.push(`Audio needs conversion: ${audioStream.codec_name} ${audioStream.sample_rate}Hz ${audioStream.channels}ch`);
  }

  return {
    needsVideoReencode: !isVideoCompatible || needsResize || needsFpsChange,
    needsAudioReencode: !isAudioCompatible,
    needsResize,
    needsFpsChange,
    reason: reasons
  };
}

function determineStrategy(requirements: ProcessingRequirements): ProcessingStrategy {
  const { needsVideoReencode, needsAudioReencode } = requirements;

  if (!needsVideoReencode && !needsAudioReencode) {
    return ProcessingStrategy.DIRECT_COPY;
  }
  if (!needsVideoReencode && needsAudioReencode) {
    return ProcessingStrategy.COPY_VIDEO_REENCODE_AUDIO;
  }
  if (needsVideoReencode && !needsAudioReencode) {
    return ProcessingStrategy.COPY_AUDIO_REENCODE_VIDEO;
  }
  return ProcessingStrategy.FULL_TRANSCODE;
}

function buildFFmpegArgs(
  strategy: ProcessingStrategy,
  requirements: ProcessingRequirements,
  options: {
    inputPath: string;
    outputPath: string;
    targetHeight?: number;
    targetFps?: number;
  }
): string[] {
  const args: string[] = [
    '-y',
    '-nostdin',
    '-threads', '0'  // Use all available CPU threads
  ];

  args.push('-i', options.inputPath);

  // Build filter chain if needed
  const filters: string[] = [];
  if (requirements.needsResize) {
    filters.push(`scale=-2:${options.targetHeight}:flags=fast_bilinear`);
  }
  if (requirements.needsFpsChange) {
    filters.push(`fps=${options.targetFps}`);
  }

  switch (strategy) {
    case ProcessingStrategy.DIRECT_COPY:
      args.push(
        '-c', 'copy',
        '-movflags', '+faststart'
      );
      break;

    case ProcessingStrategy.COPY_VIDEO_REENCODE_AUDIO:
      args.push(
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-ar', '48000',
        '-ac', '2',
        '-b:a', '128k',
        '-movflags', '+faststart'
      );
      break;

    case ProcessingStrategy.COPY_AUDIO_REENCODE_VIDEO:
      args.push(
        '-c:v', 'libx264',
        '-preset', 'superfast',  // Changed from veryfast to superfast
        '-crf', '23',
        '-c:a', 'copy'
      );
      if (filters.length > 0) {
        args.push('-vf', filters.join(','));
      }
      args.push('-movflags', '+faststart');
      break;

    case ProcessingStrategy.FULL_TRANSCODE:
      args.push(
        '-c:v', 'libx264',
        '-preset', 'superfast',  // Changed from veryfast to superfast
        '-crf', '23',
        '-c:a', 'aac',
        '-ar', '48000',
        '-ac', '2',
        '-b:a', '128k'
      );
      if (filters.length > 0) {
        args.push('-vf', filters.join(','));
      }
      args.push('-movflags', '+faststart');
      break;
  }

  args.push(options.outputPath);
  return args;
}

// Initialize S3 client for R2 with optimized settings
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
  forcePathStyle: true  // Added for R2 optimization
});

// Constants for upload optimization
const PART_SIZE = 20 * 1024 * 1024;  // 20MB chunks
const QUEUE_SIZE = 8;                 // 8 parallel uploads
const PROGRESS_LOG_INTERVAL = 5000;   // Log every 5 seconds

export type NormalizeVideoOutput = {
  success: boolean;
  outputFilename: string;
  r2Key?: string;
  r2Bucket?: string;
  publicUrl?: string;
  error?: string;
  strategy?: string;
  videoCodec?: string;
  audioCodec?: string;
  needsVideoReencode?: boolean;
  needsAudioReencode?: boolean;
  probeData?: FFprobeData;
};

// Implementation of the video normalization task
const createNormalizeVideoTask = (id: string, preset: "micro" | "small-1x" | "small-2x" | "medium-1x" | "medium-2x" | "large-1x" | "large-2x") => task({
  id,
  machine: {
    preset
  },
  run: async (payload: { 
    url: string; 
    targetHeight?: number;
    targetFps?: number;
    forceUpscale?: boolean;
  }): Promise<NormalizeVideoOutput> => {
    const inputUrl = payload.url;
    const strategy = "download";
    let tempInputPath: string | null = null;
    let probeData: FFprobeData | undefined;
    
    logger.info(`Starting video normalization task (${preset})`, { 
      inputUrl,
      strategy,
      targetHeight: payload.targetHeight,
      targetFps: payload.targetFps,
      forceUpscale: payload.forceUpscale,
      timestamp: new Date().toISOString()
    });

    try {
      // Check available disk space before starting
      const { stdout: dfOutput } = await execAsync('df -k /tmp');
      const availableKB = parseInt(dfOutput.split('\n')[1].split(/\s+/)[3]);
      if (availableKB < 1024 * 1024) { // Less than 1GB
        throw new Error(`[CRASHED] Insufficient disk space in /tmp: ${Math.floor(availableKB/1024)}MB available`);
      }

      // Download the file first
      await logger.trace("download-video", async (span) => {
        const startTime = Date.now();
        span.setAttribute("input_url", inputUrl);

        // Start download with streaming
        const response = await fetch(inputUrl);
        if (!response.ok) {
          throw new Error(`[FAILED] Failed to fetch input file: ${response.statusText}`);
        }

        // Get content length if available
        const totalBytes = parseInt(response.headers.get('content-length') ?? '0');
        span.setAttribute("total_bytes", totalBytes);
        
        // Track download progress
        let downloadedBytes = 0;
        let lastProgressLog = 0;
        const chunks: Uint8Array[] = [];

        // Stream the response
        for await (const chunk of response.body as any) {
          downloadedBytes += chunk.length;
          chunks.push(chunk);

          // Log progress every 5 seconds
          const now = Date.now();
          if (now - lastProgressLog >= 5000) {
            lastProgressLog = now;
            const elapsedSeconds = (now - startTime) / 1000;
            const downloadSpeedMBps = ((downloadedBytes / 1024 / 1024) / elapsedSeconds).toFixed(2);
            const percentComplete = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0;

            logger.info("Download progress", {
              downloadedMB: (downloadedBytes / 1024 / 1024).toFixed(2),
              totalMB: totalBytes ? (totalBytes / 1024 / 1024).toFixed(2) : 'unknown',
              speedMBps: downloadSpeedMBps,
              percentComplete: `${percentComplete}%`,
              elapsedSeconds: Math.round(elapsedSeconds)
            });
          }
        }

        // Combine chunks and write to temp file
        const buffer = Buffer.concat(chunks);
        tempInputPath = path.join(os.tmpdir(), `input-${Date.now()}`);
        await writeFile(tempInputPath, buffer);

        const endTime = Date.now();
        const durationSeconds = (endTime - startTime) / 1000;
        const averageSpeedMBps = ((buffer.length / 1024 / 1024) / durationSeconds).toFixed(2);
        
        logger.info("Download completed", { 
          tempInputPath,
          sizeMB: (buffer.length / 1024 / 1024).toFixed(2),
          durationSeconds: Math.round(durationSeconds),
          averageSpeedMBps
        });

        span.setAttribute("download_size_bytes", buffer.length);
        span.setAttribute("download_duration_seconds", durationSeconds);
        span.setAttribute("download_speed_mbps", parseFloat(averageSpeedMBps));
      });

      logger.info("Starting file probe", { tempInputPath });

      // Probe the file to check format
      const probeCommand = `ffprobe -v quiet -print_format json -show_format -show_streams "${tempInputPath}"`;
      const { stdout } = await execAsync(probeCommand);
      probeData = JSON.parse(stdout) as FFprobeData;
      
      const videoStream = probeData.streams.find(stream => stream.codec_type === 'video');
      const audioStream = probeData.streams.find(stream => stream.codec_type === 'audio');

      if (!videoStream) {
        throw new Error("[FAILED] No video stream found in input file");
      }

      // Analyze processing requirements
      const requirements = analyzeProcessingNeeds(videoStream, audioStream, {
        targetHeight: payload.targetHeight,
        targetFps: payload.targetFps,
        forceUpscale: payload.forceUpscale
      });

      // Determine processing strategy
      const processingStrategy = determineStrategy(requirements);

      logger.info("Determined processing strategy", {
        strategy: processingStrategy,
        requirements: requirements.reason,
        videoStream: {
          codec: videoStream.codec_name,
          height: videoStream.height,
          fps: videoStream.r_frame_rate
        },
        audioStream: audioStream ? {
          codec: audioStream.codec_name,
          sampleRate: audioStream.sample_rate,
          channels: audioStream.channels,
          bitrate: audioStream.bit_rate
        } : 'none'
      });

      const outputFilename = `normalized-${Date.now()}.mp4`;
      const outputPath = path.join(os.tmpdir(), outputFilename);

      await logger.trace("ffmpeg-normalization", async (span) => {
        span.setAttribute("input_url", inputUrl);
        span.setAttribute("temp_input_path", tempInputPath || "");
        span.setAttribute("output_path", outputPath);
        span.setAttribute("strategy", processingStrategy);
        span.setAttribute("video_codec", videoStream.codec_name);
        span.setAttribute("audio_codec", audioStream?.codec_name || "none");
        span.setAttribute("processing_reasons", requirements.reason.join("; "));

        // Monitor memory usage
        let lastMemoryCheck = Date.now();
        const checkMemory = async () => {
          if (Date.now() - lastMemoryCheck < 5000) return; // Check every 5 seconds
          lastMemoryCheck = Date.now();
          
          const { stdout: meminfo } = await execAsync('cat /proc/meminfo');
          const availableMem = parseInt(meminfo.match(/MemAvailable:\s+(\d+)/)?.[1] || '0');
          if (availableMem < 100 * 1024) { // Less than 100MB available
            throw new Error(`[CRASHED] System memory critically low: ${Math.floor(availableMem/1024)}MB available`);
          }
        };

        // Build FFmpeg command
        const ffmpegArgs = buildFFmpegArgs(
          processingStrategy,
          requirements,
          {
            inputPath: tempInputPath!,
            outputPath,
            targetHeight: payload.targetHeight,
            targetFps: payload.targetFps
          }
        );

        logger.info("Starting FFmpeg process", { 
          ffmpegArgs,
          processingStrategy,
          requirements: requirements.reason
        });
        
        const ffmpeg: ChildProcess = spawn('ffmpeg', ffmpegArgs);
        
        let stderr = '';
        let lastProgress = '';
        let lastProgressTime = 0;
        const PROGRESS_INTERVAL = 5000; // Log progress every 5 seconds

        // Calculate total frames for progress tracking
        const fps = videoStream.r_frame_rate ? 
          eval(videoStream.r_frame_rate) : 
          29.97;
        const durationInSeconds = probeData?.format?.duration ? 
          parseFloat(probeData.format.duration) : 
          0;
        const totalFrames = Math.ceil(fps * durationInSeconds);

        // Collect stderr for error reporting and progress
        ffmpeg.stderr?.on('data', async (data: Buffer) => {
          const output = data.toString();
          stderr += output;
          
          // Check memory periodically
          await checkMemory();
          
          // Only log progress updates with time-based throttling
          if (output.includes('frame=') && output.includes('fps=')) {
            const now = Date.now();
            if (now - lastProgressTime >= PROGRESS_INTERVAL) {
              lastProgress = output.trim();
              lastProgressTime = now;

              // Extract current frame number
              const frameMatch = output.match(/frame=\s*(\d+)/);
              const currentFrame = frameMatch ? parseInt(frameMatch[1]) : 0;
              const progressPercent = totalFrames > 0 ? 
                Math.min(100, Math.round((currentFrame / totalFrames) * 100)) : 
                0;

              logger.info("FFmpeg progress", { 
                progress: lastProgress,
                elapsedTime: Math.floor((now - lastProgressTime) / 1000) + 's',
                currentFrame,
                totalFrames,
                percentComplete: `${progressPercent}%`,
                preset,
                processingStrategy
              });
            }
          }
        });

        // Wait for FFmpeg to finish with better error handling
        await new Promise<void>((resolve, reject) => {
          ffmpeg.on('close', (code: number | null) => {
            if (code === 0) {
              resolve();
            } else {
              // Map FFmpeg exit codes to appropriate error types
              if (code === null) {
                reject(new Error(`[SYSTEM_FAILURE] FFmpeg process was terminated unexpectedly. Full error log: ${stderr}`));
              } else if (code === 137) { // SIGKILL - typically OOM
                reject(new Error(`[CRASHED] FFmpeg process was killed, likely due to out of memory. Full error log: ${stderr}`));
              } else {
                reject(new Error(`[FAILED] FFmpeg process failed with code ${code}. Full error log: ${stderr}`));
              }
            }
          });
          
          ffmpeg.on('error', (err: Error) => {
            reject(new Error(`[SYSTEM_FAILURE] FFmpeg process error: ${err.message}. Full error log: ${stderr}`));
          });

          // Add timeout handling
          const timeout = setTimeout(() => {
            ffmpeg.kill('SIGTERM');
            reject(new Error(`[TIMED_OUT] FFmpeg process timed out after 30 minutes. Last progress: ${lastProgress}`));
          }, 30 * 60 * 1000);

          ffmpeg.on('close', () => clearTimeout(timeout));
        });

        logger.info("FFmpeg processing complete", { 
          outputPath,
          strategy: processingStrategy,
          videoCodec: videoStream.codec_name,
          audioCodec: audioStream?.codec_name,
          lastProgress
        });
      });

      // Upload to R2
      const r2Key = `normalized-videos/${outputFilename}`;
      let lastProgressLog = 0;
      
      await logger.trace("upload-to-r2", async () => {
        const startTime = Date.now();
        
        const upload = new Upload({
          client: s3Client,
          params: {
            Bucket: process.env.R2_BUCKET!,
            Key: r2Key,
            Body: createReadStream(outputPath),
            ContentType: "video/mp4",
          },
          queueSize: QUEUE_SIZE,
          partSize: PART_SIZE,
          leavePartsOnError: false,
        });

        // Throttled progress logging
        upload.on("httpUploadProgress", (progress) => {
          const now = Date.now();
          if (now - lastProgressLog >= PROGRESS_LOG_INTERVAL) {
            lastProgressLog = now;
            const loaded = progress.loaded ?? 0;
            const total = progress.total ?? 0;
            const percentComplete = total > 0 ? Math.round((loaded / total) * 100) : 0;
            
            logger.info("Upload progress", {
              percentComplete: `${percentComplete}%`,
              loaded,
              total,
              timeElapsed: Math.round((now - startTime) / 1000) + 's'
            });
          }
        });

        try {
          const result = await upload.done();
          const endTime = Date.now();
          const durationSeconds = Math.round((endTime - startTime) / 1000);
          
          logger.info("Upload completed", {
            r2Key,
            durationSeconds,
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
            strategy: processingStrategy,
            videoCodec: videoStream.codec_name,
            audioCodec: audioStream?.codec_name,
            needsVideoReencode: requirements.needsVideoReencode,
            probeData
          };
        } catch (uploadError) {
          logger.error("Upload failed", {
            error: uploadError instanceof Error ? uploadError.message : "Unknown upload error",
            r2Key,
            timeElapsed: Math.round((Date.now() - startTime) / 1000) + 's'
          });
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

      logger.info("Video normalization task completed successfully", {
        r2Key,
        outputFilename,
        strategy,
        videoCodec: videoStream.codec_name,
        audioCodec: audioStream?.codec_name,
        needsVideoReencode: requirements.needsVideoReencode,
        processingTime: Date.now() - parseInt(outputFilename.split("-")[1]),
      });

      return {
        success: true,
        outputFilename,
        r2Key,
        r2Bucket: process.env.R2_BUCKET,
        publicUrl: `${process.env.R2_PUBLIC_URL}/${r2Key}`,
        strategy: processingStrategy,
        videoCodec: videoStream.codec_name,
        audioCodec: audioStream?.codec_name,
        needsVideoReencode: requirements.needsVideoReencode,
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

      // Extract status code from error message if present
      const statusMatch = error instanceof Error ? error.message.match(/^\[(.*?)\]/) : null;
      const status = statusMatch ? statusMatch[1] : "FAILED";
      const cleanMessage = error instanceof Error ? error.message.replace(/^\[.*?\]\s*/, '') : "Unknown error";

      logger.error(`Video normalization ${status.toLowerCase()}`, { 
        error: cleanMessage,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        status,
        inputUrl,
        strategy
      });
      
      // Re-throw with status code preserved
      throw new Error(`[${status}] ${cleanMessage}`);
    }
  },
});

// Create variants for each machine size
export const videoNormalizeMicro = createNormalizeVideoTask("video_normalize_micro", "micro");
export const videoNormalizeSmall1x = createNormalizeVideoTask("video_normalize_small_1x", "small-1x");
export const videoNormalizeSmall2x = createNormalizeVideoTask("video_normalize_small_2x", "small-2x");
export const videoNormalizeMedium1x = createNormalizeVideoTask("video_normalize_medium_1x", "medium-1x");
export const videoNormalizeMedium2x = createNormalizeVideoTask("video_normalize_medium_2x", "medium-2x");
export const videoNormalizeLarge1x = createNormalizeVideoTask("video_normalize_large_1x", "large-1x");
export const videoNormalizeLarge2x = createNormalizeVideoTask("video_normalize_large_2x", "large-2x"); 