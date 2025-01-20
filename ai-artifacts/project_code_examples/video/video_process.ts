/**
 * Video Processing Tasks
 * 
 * This file contains two different video processing implementations:
 * 1. processVideoTask ("process-video"): A full-featured video processing pipeline
 * 2. videoProcess ("video_process"): A specialized video splitting task
 * 
 * =====================================
 * processVideoTask ("process-video")
 * =====================================
 * A comprehensive video processing pipeline that orchestrates multiple sub-tasks:
 * - Splits video into segments
 * - Processes segments in parallel (resize, audio control)
 * - Reassembles processed segments
 * 
 * Input:
 * ```typescript
 * {
 *   url: string;              // URL of the video to process
 *   numberOfSegments?: number;// Optional: Number of segments to split into (default: 4)
 *   targetHeight?: number;    // Optional: Height to resize video to
 *   dropAudio?: boolean;      // Optional: Whether to remove audio
 *   outputFileName?: string;  // Optional: Custom output filename
 *   maxConcurrency?: number;  // Optional: Max parallel processing threads (default: 4)
 * }
 * ```
 * 
 * Output:
 * ```typescript
 * {
 *   success: boolean;
 *   error?: string;
 *   inputUrl: string;
 *   outputUrl?: string;
 *   duration?: number;
 *   processingDetails?: {
 *     segmentsCreated: number;
 *     targetHeight?: number;
 *     dropAudio: boolean;
 *     originalDuration?: number;
 *     finalDuration?: number;
 *   };
 * }
 * ```
 * 
 * Example Usage:
 * ```typescript
 * const result = await client.run("process-video", {
 *   url: "https://example.com/video.mp4",
 *   targetHeight: 720,
 *   dropAudio: false,
 *   numberOfSegments: 4
 * });
 * ```
 * 
 * =====================================
 * videoProcess ("video_process")
 * =====================================
 * A specialized task focused solely on splitting videos at keyframe boundaries.
 * This task handles the technical aspects of:
 * - Analyzing video keyframes
 * - Splitting at optimal points
 * - Maintaining video quality
 * 
 * Input:
 * ```typescript
 * {
 *   url: string;           // URL of the video to split
 *   numberOfSegments: number; // Number of segments to create
 * }
 * ```
 * 
 * Output:
 * ```typescript
 * {
 *   success: boolean;
 *   segments: Array<{
 *     url: string;      // R2 URL of the segment
 *     index: number;    // Position in sequence
 *     keyframes?: number[]; // Keyframe positions
 *     duration?: number;    // Segment duration
 *     startTime: number;    // Start time in seconds
 *     endTime: number;      // End time in seconds
 *   }>;
 *   error?: string;
 *   probeData?: FFprobeData;
 *   totalDuration?: number;
 * }
 * ```
 * 
 * Example Usage:
 * ```typescript
 * const result = await client.run("video_process", {
 *   url: "https://example.com/video.mp4",
 *   numberOfSegments: 4
 * });
 * ```
 * 
 * Key Differences:
 * - processVideoTask: Full pipeline with resizing, audio control, and parallel processing
 * - videoProcess: Focused solely on optimal video splitting at keyframes
 * 
 * Choose processVideoTask when you need:
 * - Video resizing
 * - Audio control
 * - Parallel processing
 * - Custom output filenames
 * 
 * Choose videoProcess when you need:
 * - Just video splitting
 * - Direct control over segment boundaries
 * - Optimal keyframe-based splitting
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
import { mkdir, rm } from "fs/promises";

const execAsync = promisify(exec);

// Constants for R2 optimization
const PART_SIZE = 20 * 1024 * 1024;  // 20MB chunks
const QUEUE_SIZE = 8;                 // 8 parallel uploads
const PROGRESS_LOG_INTERVAL = 5000;   // Log every 5 seconds

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

// Types for video processing
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

interface VideoSegment {
  url: string;          // R2 URL
  index: number;        // Position in sequence
  keyframes?: number[]; // Keyframe positions
  duration?: number;    // Segment duration
  startTime: number;    // Start time in seconds
  endTime: number;      // End time in seconds
}

interface SplitVideoOutput {
  success: boolean;
  segments: VideoSegment[];
  error?: string;
  probeData?: FFprobeData;
  totalDuration?: number;
}

interface ResizeSegmentPayload {
  url: string;
  index: number;
  startTime: number;
  endTime: number;
  targetHeight?: number;
  dropAudio?: boolean;
  outputFormat?: 'mp4' | 'webm';  // Added for format conversion
  codecOptions?: {
    // VP8/VP9 options
    quality?: number;     // 0-63, lower is better
    speed?: number;      // 0-5
    // H.264 options
    preset?: string;     // ultrafast to veryslow
    crf?: number;        // 0-51, lower is better
    // Common options
    threads?: number;    // Number of threads
  };
}

interface ResizeSegmentOutput {
  success: boolean;
  url?: string;          // R2 URL of processed segment
  error?: string;
  index: number;         // Maintain order for reassembly
  processingStrategy?: string;
}

// Add new interfaces for reassembly
interface ReassembleVideoPayload {
  segments: {
    url: string;
    index: number;
  }[];
  outputFileName?: string;
}

interface ReassembleVideoOutput {
  success: boolean;
  url?: string;
  error?: string;
  duration?: number;
}

interface ProcessVideoPayload {
  url: string;                    // Required: URL of the video to process
  numberOfSegments?: number;      // Optional: Number of segments to split into (default: 4)
  targetHeight?: number;          // Optional: Height to resize to, maintains aspect ratio (default: original height)
  dropAudio?: boolean;            // Optional: Whether to remove audio track (default: false)
  outputFileName?: string;        // Optional: Name for the output file (default: auto-generated)
  maxConcurrency?: number;        // Optional: Max parallel processing tasks (default: 4)
  outputFormat?: 'mp4' | 'webm';  // Optional: Output container format (default: 'mp4')
  codecOptions?: {
    // All codec options are optional with sensible defaults
    // H.264 options (used when outputFormat is 'mp4')
    preset?: string;     // Encoding preset: ultrafast to veryslow (default: 'medium')
    crf?: number;       // Quality: 0-51, lower is better (default: 23)
    // VP9 options (used when outputFormat is 'webm')
    quality?: number;   // Quality: 0-63, lower is better (default: 31)
    speed?: number;    // Encoding speed: 0-5 (default: 1)
    // Common options
    threads?: number;  // Number of encoding threads, 0 for auto (default: 0)
  };
}

interface ProcessVideoOutput {
  success: boolean;
  error?: string;
  inputUrl: string;
  outputUrl?: string;
  duration?: number;
  processingDetails?: {
    segmentsCreated: number;
    targetHeight?: number;
    dropAudio: boolean;
    originalDuration?: number;
    finalDuration?: number;
    inputFormat?: string;
    outputFormat?: string;
    transcodeStrategy?: string;
  };
}

interface ProcessSegmentsPayload {
  segments: VideoSegment[];
  targetHeight?: number;
  dropAudio?: boolean;
  maxConcurrency?: number;
  outputFormat?: 'mp4' | 'webm';
  codecOptions?: {
    // VP8/VP9 options
    quality?: number;     // 0-63, lower is better
    speed?: number;      // 0-5
    // H.264 options
    preset?: string;     // ultrafast to veryslow
    crf?: number;        // 0-51, lower is better
    // Common options
    threads?: number;    // Number of threads
  };
}

// Split video task
export const splitVideoTask = task({
  id: "split-video",
  machine: {
    preset: "large-2x"
  },
  run: async (payload: { 
    url: string;
    numberOfSegments: number;
  }): Promise<SplitVideoOutput> => {
    const { url, numberOfSegments } = payload;
    let tempInputPath: string | null = null;
    let probeData: FFprobeData | undefined;
    
    logger.info("Starting video split task", { 
      url,
      numberOfSegments,
      timestamp: new Date().toISOString()
    });

    try {
      // Check available disk space
      const { stdout: dfOutput } = await execAsync('df -k /tmp');
      const availableKB = parseInt(dfOutput.split('\n')[1].split(/\s+/)[3]);
      if (availableKB < 1024 * 1024) { // Less than 1GB
        throw new Error(`[CRASHED] Insufficient disk space in /tmp: ${Math.floor(availableKB/1024)}MB available`);
      }

      // Download the file
      await logger.trace("download-video", async (span) => {
        const startTime = Date.now();
        span.setAttribute("input_url", url);

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`[FAILED] Failed to fetch input file: ${response.statusText}`);
        }

        const totalBytes = parseInt(response.headers.get('content-length') ?? '0');
        span.setAttribute("total_bytes", totalBytes);
        
        let downloadedBytes = 0;
        let lastProgressLog = 0;
        const chunks: Uint8Array[] = [];

        for await (const chunk of response.body as any) {
          downloadedBytes += chunk.length;
          chunks.push(chunk);

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

        const buffer = Buffer.concat(chunks);
        tempInputPath = path.join(os.tmpdir(), `input-${Date.now()}.mp4`);
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
      });

      if (!tempInputPath) {
        throw new Error("[FAILED] No input file was created");
      }

      // Probe duration first
      logger.info("Probing video duration", { tempInputPath });
      const durationCmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        tempInputPath
      ];
      
      const { stdout: durationOutput } = await execAsync(durationCmd.join(' '));
      const duration = parseFloat(durationOutput.trim());
      
      if (!duration) {
        throw new Error("[FAILED] Could not determine video duration");
      }
      
      logger.info(`Video duration: ${duration.toFixed(2)} seconds`);

      // Get general probe data
      logger.info("Starting file probe", { tempInputPath });
      const probeCommand = `ffprobe -v quiet -print_format json -show_format -show_streams "${tempInputPath}"`;
      const { stdout } = await execAsync(probeCommand);
      probeData = JSON.parse(stdout) as FFprobeData;

      // Get keyframes
      logger.info("Starting keyframe analysis", { tempInputPath });
      const keyframes: number[] = [];
      const frameTypes: string[] = [];
      
      await new Promise<void>((resolve, reject) => {
        const keyframeProcess = spawn('ffprobe', [
          '-select_streams', 'v',
          '-show_frames',
          '-show_entries', 'frame=best_effort_timestamp_time,key_frame,pict_type',
          '-of', 'json',
          tempInputPath!
        ], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let buffer = '';
        let frameCount = 0;

        if (!keyframeProcess.stdout || !keyframeProcess.stderr) {
          reject(new Error("Failed to create FFprobe process streams"));
          return;
        }

        keyframeProcess.stdout.on('data', (data: Buffer) => {
          buffer += data.toString();
        });

        keyframeProcess.stderr.on('data', (data: Buffer) => {
          logger.debug("FFprobe stderr", { output: data.toString() });
        });

        keyframeProcess.on('close', (code: number | null) => {
          if (code === 0) {
            try {
              // Save raw ffprobe output for debugging
              const rawOutputPath = path.join(os.tmpdir(), `ffprobe_output_${Date.now()}.json`);
              writeFile(rawOutputPath, buffer).catch(err => 
                logger.warn("Failed to save raw ffprobe output", { error: err.message })
              );
              logger.debug("Saved raw ffprobe output", { path: rawOutputPath });

              const data = JSON.parse(buffer);
              if (data.frames) {
                logger.debug(`Found ${data.frames.length} frames in probe data`);
                
                for (let i = 0; i < data.frames.length; i++) {
                  const frame = data.frames[i];
                  frameCount++;

                  // Log every 100th frame for debugging
                  if (i % 100 === 0) {
                    logger.debug(`Frame ${i}:`, frame);
                  }

                  const isKeyframe = frame.key_frame === 1 || frame.pict_type === "I";
                  const pictType = frame.pict_type || "Unknown";
                  const timestamp = frame.best_effort_timestamp_time;

                  if (isKeyframe) {
                    frameTypes.push(`Frame ${i}: ${pictType}`);
                    if (timestamp !== undefined && timestamp !== null) {
                      keyframes.push(parseFloat(timestamp));
                      logger.debug(`Found keyframe at ${timestamp}s (Frame ${i}, Type: ${pictType})`);
                    }
                  }
                }
              }
              
              logger.info(`Found ${keyframes.length} keyframes`);
              if (frameTypes.length > 0) {
                logger.debug("Frame types found: " + frameTypes.slice(0, 10).join(", "));
              }
              
              if (keyframes.length === 0) {
                reject(new Error("[FAILED] No keyframes found in video"));
                return;
              }
              
              resolve();
            } catch (e) {
              // Save problematic output for debugging
              const errorPath = path.join(os.tmpdir(), `ffprobe_error_${Date.now()}.log`);
              writeFile(errorPath, buffer).catch(err => 
                logger.warn("Failed to save error output", { error: err.message })
              );
              logger.error("Saved problematic ffprobe output", { path: errorPath });
              
              reject(new Error(`[FAILED] Failed to parse FFprobe output: ${e instanceof Error ? e.message : String(e)}`));
            }
          } else {
            reject(new Error(`FFprobe process exited with code ${code}`));
          }
        });

        keyframeProcess.on('error', (err: Error) => {
          reject(new Error(`FFprobe process error: ${err.message}`));
        });
      });

      // Calculate split points
      const segmentDuration = duration / numberOfSegments;
      const splitPoints: number[] = [];

      // Include start and end points
      splitPoints.push(0); // Always start at 0
      for (let i = 1; i < numberOfSegments; i++) {
        const targetTime = i * segmentDuration;
        // Find nearest keyframe
        const nearestKeyframe = keyframes.reduce((prev, curr) => 
          Math.abs(curr - targetTime) < Math.abs(prev - targetTime) ? curr : prev
        );
        if (!splitPoints.includes(nearestKeyframe)) {
          splitPoints.push(nearestKeyframe);
        }
      }
      splitPoints.push(duration); // Always end at duration

      // Ensure we have the exact number of segments
      splitPoints.sort((a, b) => a - b);

      // Process segments
      const segments: VideoSegment[] = [];
      for (let i = 0; i < splitPoints.length - 1; i++) {
        const startTime = splitPoints[i];
        const endTime = splitPoints[i + 1];
        const segmentIndex = i + 1;
        const paddedIndex = segmentIndex.toString().padStart(2, '0');
        const outputFile = path.join(os.tmpdir(), `segment_${paddedIndex}.mp4`);

        // Split using FFmpeg
        const splitCommand = [
          'ffmpeg', '-y',
          '-i', tempInputPath,
          '-ss', startTime.toString(),
          '-to', endTime.toString(),
          '-c', 'copy',
          outputFile
        ];

        logger.debug(`Running FFmpeg split command: ${splitCommand.join(' ')}`);

        try {
          await new Promise<void>((resolve, reject) => {
            const process = spawn(splitCommand[0], splitCommand.slice(1), {
              stdio: ['pipe', 'pipe', 'pipe']
            });

            let stderr = '';
            process.stderr?.on('data', (data: Buffer) => {
              stderr += data.toString();
            });
            
            process.on('close', (code: number | null) => {
              if (code === 0) {
                logger.info(`Created segment ${segmentIndex}: ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s`);
                resolve();
              } else {
                reject(new Error(`FFmpeg split failed with code ${code}. Error: ${stderr}`));
              }
            });
          });

          // Upload to R2
          const r2Key = `video-segments/${path.basename(tempInputPath, '.mp4')}/${path.basename(outputFile)}`;
          const upload = new Upload({
            client: s3Client,
            params: {
              Bucket: process.env.R2_BUCKET!,
              Key: r2Key,
              Body: createReadStream(outputFile),
              ContentType: "video/mp4",
            },
            queueSize: QUEUE_SIZE,
            partSize: PART_SIZE,
            leavePartsOnError: false,
          });

          await upload.done();

          // Add segment info
          segments.push({
            url: `${process.env.R2_PUBLIC_URL}/${r2Key}`,
            index: i,
            startTime,
            endTime,
            duration: endTime - startTime,
            keyframes: keyframes.filter(k => k >= startTime && k <= endTime)
          });

          // Cleanup segment file
          await unlink(outputFile);
          logger.debug(`Cleaned up temporary segment file: ${outputFile}`);

        } catch (error) {
          logger.error(`Error creating segment ${segmentIndex}:`, {
            error: error instanceof Error ? error.message : String(error),
            startTime,
            endTime
          });
          throw error;
        }
      }

      // Cleanup input file
      if (tempInputPath) {
        await unlink(tempInputPath);
      }

      logger.info("Split operation complete", {
        segmentCount: segments.length,
        totalDuration: duration
      });

      return {
        success: true,
        segments,
        probeData,
        totalDuration: duration
      };

    } catch (error) {
      // Cleanup on error
      if (tempInputPath) {
        try {
          await unlink(tempInputPath);
        } catch (cleanupError) {
          logger.warn("Failed to cleanup temp file", { tempInputPath });
        }
      }

      const statusMatch = error instanceof Error ? error.message.match(/^\[(.*?)\]/) : null;
      const status = statusMatch ? statusMatch[1] : "FAILED";
      const cleanMessage = error instanceof Error ? error.message.replace(/^\[.*?\]\s*/, '') : "Unknown error";

      logger.error(`Video split ${status.toLowerCase()}`, {
        error: cleanMessage,
        status,
        url
      });

      return {
        success: false,
        segments: [],
        error: `[${status}] ${cleanMessage}`
      };
    }
  }
});

export const resizeSegmentTask = task({
  id: "resize-segment",
  machine: {
    preset: "large-2x"
  },
  queue: {
    concurrencyLimit: 4
  },
  run: async (payload: ResizeSegmentPayload): Promise<ResizeSegmentOutput> => {
    let tempInputPath: string | null = null;
    let tempOutputPath: string | null = null;

    try {
      logger.info("Starting segment resize", {
        url: payload.url,
        index: payload.index,
        targetHeight: payload.targetHeight,
        dropAudio: payload.dropAudio
      });

      // Download segment
      const response = await fetch(payload.url);
      if (!response.ok) {
        throw new Error(`Failed to download segment: ${response.statusText}`);
      }

      // Save to temp file
      tempInputPath = path.join(os.tmpdir(), `input_${Date.now()}.mp4`);
      const buffer = await response.arrayBuffer();
      await writeFile(tempInputPath, Buffer.from(buffer));

      // Probe video streams
      const probeCommand = `ffprobe -v quiet -print_format json -show_format -show_streams "${tempInputPath}"`;
      const { stdout } = await execAsync(probeCommand);
      const probeData = JSON.parse(stdout) as FFprobeData;

      // Find video stream
      const videoStream = probeData.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        throw new Error("No video stream found");
      }

      // Calculate dimensions
      let targetWidth: number;
      let targetHeight = payload.targetHeight;

      if (targetHeight) {
        // Calculate width maintaining aspect ratio
        const aspectRatio = (videoStream.width || 1920) / (videoStream.height || 1080);
        targetWidth = Math.round(targetHeight * aspectRatio);
        targetWidth += targetWidth % 2; // Ensure even width
      } else {
        // Use original dimensions
        targetWidth = videoStream.width || 1920;
        targetHeight = videoStream.height || 1080;
      }

      // Determine output format and extension
      const outputFormat = payload.outputFormat || 'mp4';
      const outputExt = outputFormat === 'webm' ? 'webm' : 'mp4';
      tempOutputPath = path.join(os.tmpdir(), `output_${Date.now()}.${outputExt}`);

      // Use sensible defaults for codec options
      const defaultCodecOptions = {
        // H.264 defaults
        preset: 'medium',
        crf: 23,
        // VP9 defaults
        quality: 31,
        speed: 1,
        // Common defaults
        threads: 0
      };

      const codecOptions = {
        ...defaultCodecOptions,
        ...payload.codecOptions
      };

      // Prepare FFmpeg command based on output format
      const ffmpegArgs = [
        '-y',
        '-i', tempInputPath,
        '-threads', `${codecOptions.threads}`,
      ];

      // Video codec settings based on output format
      if (outputFormat === 'webm') {
        ffmpegArgs.push(
          '-c:v', 'libvpx-vp9',
          '-b:v', '0',
          '-crf', `${codecOptions.quality}`,
          '-speed', `${codecOptions.speed}`,
          '-row-mt', '1'
        );
      } else {
        ffmpegArgs.push(
          '-c:v', 'libx264',
          '-preset', codecOptions.preset,
          '-crf', `${codecOptions.crf}`
        );
      }

      // Force keyframe at start for clean splits
      ffmpegArgs.push('-force_key_frames', '00:00:00.000');

      // Scale if needed
      if (payload.targetHeight) {
        ffmpegArgs.push('-vf', `scale=-2:${payload.targetHeight}`);
      }

      // Handle audio
      if (payload.dropAudio) {
        ffmpegArgs.push('-an');
      } else {
        const hasAudio = probeData.streams.some(s => s.codec_type === 'audio');
        if (hasAudio) {
          if (outputFormat === 'webm') {
            ffmpegArgs.push(
              '-c:a', 'libopus',
              '-b:a', '128k'
            );
          } else {
            ffmpegArgs.push(
              '-c:a', 'aac',
              '-b:a', '128k'
            );
          }
        }
      }

      // Output settings
      if (outputFormat === 'mp4') {
        ffmpegArgs.push('-movflags', '+faststart');
      }
      ffmpegArgs.push(tempOutputPath);

      // Process video
      logger.debug("Running FFmpeg command", { command: ffmpegArgs.join(' ') });
      await new Promise<void>((resolve, reject) => {
        const process = spawn('ffmpeg', ffmpegArgs, {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stderr = '';
        process.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        process.on('close', (code: number | null) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`FFmpeg failed with code ${code}. Error: ${stderr}`));
          }
        });
      });

      // Upload to R2
      const r2Key = `processed-segments/${path.basename(tempInputPath, '.mp4')}_${targetWidth}x${targetHeight}.${outputExt}`;
      const contentType = outputFormat === 'webm' ? 'video/webm' : 'video/mp4';

      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: process.env.R2_BUCKET!,
          Key: r2Key,
          Body: createReadStream(tempOutputPath),
          ContentType: contentType,
        },
        queueSize: QUEUE_SIZE,
        partSize: PART_SIZE,
        leavePartsOnError: false,
      });

      await upload.done();

      // Cleanup temp files
      if (tempInputPath) await unlink(tempInputPath);
      if (tempOutputPath) await unlink(tempOutputPath);

      return {
        success: true,
        url: `${process.env.R2_PUBLIC_URL}/${r2Key}`,
        index: payload.index,
        processingStrategy: `transcode-h264-to-${outputFormat === 'webm' ? 'vp9' : 'h264'}${payload.dropAudio ? '-no-audio' : ''}`
      };

    } catch (error) {
      // Cleanup on error
      if (tempInputPath) {
        try { await unlink(tempInputPath); } catch {}
      }
      if (tempOutputPath) {
        try { await unlink(tempOutputPath); } catch {}
      }

      logger.error("Segment processing failed", {
        error: error instanceof Error ? error.message : String(error),
        segment: payload
      });

      return {
        success: false,
        index: payload.index,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

export const processSegmentsTask = task({
  id: "process-segments",
  machine: {
    preset: "large-2x"
  },
  queue: {
    concurrencyLimit: 1
  },
  run: async (payload: ProcessSegmentsPayload) => {
    try {
      logger.info("Starting segment processing", {
        segmentCount: payload.segments.length,
        targetHeight: payload.targetHeight,
        dropAudio: payload.dropAudio,
        maxConcurrency: payload.maxConcurrency,
        outputFormat: payload.outputFormat
      });

      // Create a dynamic queue for this batch
      const queueName = `resize-segments-${Date.now()}`;
      const dynamicQueue = {
        name: queueName,
        concurrencyLimit: payload.maxConcurrency || 4
      };

      // Process segments in parallel using batchTriggerAndWait
      const batchResult = await resizeSegmentTask.batchTriggerAndWait(
        payload.segments.map(segment => ({
          payload: {
            url: segment.url,
            index: segment.index,
            startTime: segment.startTime,
            endTime: segment.endTime,
            targetHeight: payload.targetHeight,
            dropAudio: payload.dropAudio,
            outputFormat: payload.outputFormat,
            codecOptions: payload.codecOptions
          },
          options: {
            queue: dynamicQueue
          }
        }))
      );

      // Extract results array
      const results = batchResult.runs;

      // Check for any failures
      const failures = results.filter(result => !result.ok);
      if (failures.length > 0) {
        logger.error("Some segments failed processing", {
          totalSegments: payload.segments.length,
          failedSegments: failures.length,
          errors: failures.map(failure => 
            failure.error instanceof Error ? failure.error.message : String(failure.error)
          )
        });
        throw new Error(`${failures.length} segments failed processing`);
      }

      // Get successful results
      const successfulResults = results
        .filter((r): r is { ok: true; id: string; taskIdentifier: "resize-segment"; output: ResizeSegmentOutput } => r.ok)
        .map(r => r.output)
        .sort((a, b) => a.index - b.index);

      return {
        success: true,
        segments: successfulResults.map(r => ({
          url: r.url!,
          index: r.index
        }))
      };

    } catch (error) {
      logger.error("Segment processing failed", {
        error: error instanceof Error ? error.message : String(error),
        segments: payload.segments.length
      });

      return {
        success: false,
        segments: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

export const reassembleVideoTask = task({
  id: "reassemble-video",
  machine: {
    preset: "large-2x"
  },
  queue: {
    concurrencyLimit: 1  // Only one reassembly at a time since it's resource intensive
  },
  run: async (payload: ReassembleVideoPayload): Promise<ReassembleVideoOutput> => {
    let concatFilePath: string | null = null;
    let tempOutputPath: string | null = null;
    const segmentPaths: string[] = [];

    try {
      logger.info("Starting video reassembly", {
        segmentCount: payload.segments.length
      });

      // Create working directory
      const workDir = path.join(os.tmpdir(), `reassemble_${Date.now()}`);
      await mkdir(workDir, { recursive: true });

      // Download all segments
      await Promise.all(payload.segments.map(async (segment, idx) => {
        const response = await fetch(segment.url);
        if (!response.ok) {
          throw new Error(`Failed to download segment ${idx}: ${response.statusText}`);
        }

        const segmentPath = path.join(workDir, `segment_${idx.toString().padStart(3, '0')}.mp4`);
        const buffer = await response.arrayBuffer();
        await writeFile(segmentPath, Buffer.from(buffer));
        segmentPaths.push(segmentPath);

        logger.debug(`Downloaded segment ${idx}`, { path: segmentPath });
      }));

      // Create concat file
      concatFilePath = path.join(workDir, 'concat.txt');
      const concatContent = segmentPaths
        .sort((a, b) => {
          const aIdx = parseInt(path.basename(a, '.mp4').split('_')[1]);
          const bIdx = parseInt(path.basename(b, '.mp4').split('_')[1]);
          return aIdx - bIdx;
        })
        .map(p => `file '${p}'`)
        .join('\n');

      await writeFile(concatFilePath, concatContent);
      logger.debug("Created concat file", { 
        path: concatFilePath,
        content: concatContent
      });

      // Merge segments
      tempOutputPath = path.join(workDir, `output_${Date.now()}.mp4`);
      const ffmpegArgs = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
        '-c', 'copy',
        tempOutputPath
      ];

      logger.debug("Running FFmpeg merge command", { command: ffmpegArgs.join(' ') });
      await new Promise<void>((resolve, reject) => {
        const process = spawn('ffmpeg', ffmpegArgs, {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stderr = '';
        process.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        process.on('close', (code: number | null) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`FFmpeg merge failed with code ${code}. Error: ${stderr}`));
          }
        });
      });

      // Get final video duration
      const { stdout: durationStr } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempOutputPath}"`
      );
      const duration = parseFloat(durationStr);

      // Upload to R2
      const outputFileName = payload.outputFileName || `merged_${Date.now()}.mp4`;
      const r2Key = `final-videos/${outputFileName}`;
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: process.env.R2_BUCKET!,
          Key: r2Key,
          Body: createReadStream(tempOutputPath),
          ContentType: "video/mp4",
        },
        queueSize: QUEUE_SIZE,
        partSize: PART_SIZE,
        leavePartsOnError: false,
      });

      await upload.done();

      // Cleanup
      for (const path of [...segmentPaths, concatFilePath, tempOutputPath]) {
        if (path) {
          try { await unlink(path); } catch {}
        }
      }
      try { await rm(workDir, { recursive: true, force: true }); } catch {}

      return {
        success: true,
        url: `${process.env.R2_PUBLIC_URL}/${r2Key}`,
        duration
      };

    } catch (error) {
      // Cleanup on error
      for (const path of [...segmentPaths, concatFilePath, tempOutputPath]) {
        if (path) {
          try { await unlink(path); } catch {}
        }
      }

      logger.error("Video reassembly failed", {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

export const processVideoTask = task({
  id: "process-video",
  machine: {
    preset: "large-2x"
  },
  queue: {
    concurrencyLimit: 2
  },
  run: async (payload: ProcessVideoPayload): Promise<ProcessVideoOutput> => {
    try {
      logger.info("Starting video processing pipeline", {
        url: payload.url,
        targetHeight: payload.targetHeight,
        dropAudio: payload.dropAudio,
        numberOfSegments: payload.numberOfSegments,
        maxConcurrency: payload.maxConcurrency || 4,
        outputFormat: payload.outputFormat
      });

      // 1. Split video into segments
      const splitResult = await splitVideoTask.triggerAndWait({
        url: payload.url,
        numberOfSegments: payload.numberOfSegments || 4
      });

      if (!splitResult.ok) {
        throw new Error(`Split task failed: ${splitResult.error}`);
      }

      if (!splitResult.output.success) {
        throw new Error(`Split operation failed: ${splitResult.output.error}`);
      }

      logger.info("Split complete", {
        segmentCount: splitResult.output.segments.length,
        totalDuration: splitResult.output.totalDuration
      });

      // 2. Process segments in parallel with dynamic concurrency
      const processResult = await processSegmentsTask.triggerAndWait({
        segments: splitResult.output.segments,
        targetHeight: payload.targetHeight,
        dropAudio: payload.dropAudio,
        maxConcurrency: payload.maxConcurrency,
        outputFormat: payload.outputFormat,
        codecOptions: payload.codecOptions
      });

      if (!processResult.ok) {
        throw new Error(`Process segments task failed: ${processResult.error}`);
      }

      logger.info("Segment processing complete", {
        processedCount: processResult.output.segments.length
      });

      // 3. Reassemble processed segments
      const reassembleResult = await reassembleVideoTask.triggerAndWait({
        segments: processResult.output.segments,
        outputFileName: payload.outputFileName
      });

      if (!reassembleResult.ok) {
        throw new Error(`Reassemble task failed: ${reassembleResult.error}`);
      }

      if (!reassembleResult.output.success) {
        throw new Error(`Reassemble operation failed: ${reassembleResult.output.error}`);
      }

      logger.info("Video processing complete", {
        outputUrl: reassembleResult.output.url,
        duration: reassembleResult.output.duration
      });

      // Get input format from probe data
      const inputFormat = splitResult.output.probeData?.format?.format_name?.toLowerCase() || 'unknown';

      return {
        success: true,
        inputUrl: payload.url,
        outputUrl: reassembleResult.output.url,
        duration: reassembleResult.output.duration,
        processingDetails: {
          segmentsCreated: splitResult.output.segments.length,
          targetHeight: payload.targetHeight,
          dropAudio: payload.dropAudio || false,
          originalDuration: splitResult.output.totalDuration,
          finalDuration: reassembleResult.output.duration,
          inputFormat,
          outputFormat: payload.outputFormat || 'mp4',
          transcodeStrategy: `${inputFormat}-to-${payload.outputFormat || 'mp4'}`
        }
      };

    } catch (error) {
      logger.error("Video processing pipeline failed", {
        error: error instanceof Error ? error.message : String(error),
        input: payload
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        inputUrl: payload.url
      };
    }
  }
});

export const videoProcess = task({
  id: "video_process",
  machine: {
    preset: "large-2x"
  },
  run: async (payload: { 
    url: string;
    numberOfSegments: number;
  }): Promise<SplitVideoOutput> => {
    const { url, numberOfSegments } = payload;
    let tempInputPath: string | null = null;
    let probeData: FFprobeData | undefined;
    
    logger.info("Starting video split task", { 
      url,
      numberOfSegments,
      timestamp: new Date().toISOString()
    });

    try {
      // Check available disk space
      const { stdout: dfOutput } = await execAsync('df -k /tmp');
      const availableKB = parseInt(dfOutput.split('\n')[1].split(/\s+/)[3]);
      if (availableKB < 1024 * 1024) { // Less than 1GB
        throw new Error(`[CRASHED] Insufficient disk space in /tmp: ${Math.floor(availableKB/1024)}MB available`);
      }

      // Download the file
      await logger.trace("download-video", async (span) => {
        const startTime = Date.now();
        span.setAttribute("input_url", url);

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`[FAILED] Failed to fetch input file: ${response.statusText}`);
        }

        const totalBytes = parseInt(response.headers.get('content-length') ?? '0');
        span.setAttribute("total_bytes", totalBytes);
        
        let downloadedBytes = 0;
        let lastProgressLog = 0;
        const chunks: Uint8Array[] = [];

        for await (const chunk of response.body as any) {
          downloadedBytes += chunk.length;
          chunks.push(chunk);

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

        const buffer = Buffer.concat(chunks);
        tempInputPath = path.join(os.tmpdir(), `input-${Date.now()}.mp4`);
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
      });

      if (!tempInputPath) {
        throw new Error("[FAILED] No input file was created");
      }

      // Probe duration first
      logger.info("Probing video duration", { tempInputPath });
      const durationCmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        tempInputPath
      ];
      
      const { stdout: durationOutput } = await execAsync(durationCmd.join(' '));
      const duration = parseFloat(durationOutput.trim());
      
      if (!duration) {
        throw new Error("[FAILED] Could not determine video duration");
      }
      
      logger.info(`Video duration: ${duration.toFixed(2)} seconds`);

      // Get general probe data
      logger.info("Starting file probe", { tempInputPath });
      const probeCommand = `ffprobe -v quiet -print_format json -show_format -show_streams "${tempInputPath}"`;
      const { stdout } = await execAsync(probeCommand);
      probeData = JSON.parse(stdout) as FFprobeData;

      // Get keyframes
      logger.info("Starting keyframe analysis", { tempInputPath });
      const keyframes: number[] = [];
      const frameTypes: string[] = [];
      
      await new Promise<void>((resolve, reject) => {
        const keyframeProcess = spawn('ffprobe', [
          '-select_streams', 'v',
          '-show_frames',
          '-show_entries', 'frame=best_effort_timestamp_time,key_frame,pict_type',
          '-of', 'json',
          tempInputPath!
        ], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let buffer = '';
        let frameCount = 0;

        if (!keyframeProcess.stdout || !keyframeProcess.stderr) {
          reject(new Error("Failed to create FFprobe process streams"));
          return;
        }

        keyframeProcess.stdout.on('data', (data: Buffer) => {
          buffer += data.toString();
        });

        keyframeProcess.stderr.on('data', (data: Buffer) => {
          logger.debug("FFprobe stderr", { output: data.toString() });
        });

        keyframeProcess.on('close', (code: number | null) => {
          if (code === 0) {
            try {
              // Save raw ffprobe output for debugging
              const rawOutputPath = path.join(os.tmpdir(), `ffprobe_output_${Date.now()}.json`);
              writeFile(rawOutputPath, buffer).catch(err => 
                logger.warn("Failed to save raw ffprobe output", { error: err.message })
              );
              logger.debug("Saved raw ffprobe output", { path: rawOutputPath });

              const data = JSON.parse(buffer);
              if (data.frames) {
                logger.debug(`Found ${data.frames.length} frames in probe data`);
                
                for (let i = 0; i < data.frames.length; i++) {
                  const frame = data.frames[i];
                  frameCount++;

                  // Log every 100th frame for debugging
                  if (i % 100 === 0) {
                    logger.debug(`Frame ${i}:`, frame);
                  }

                  const isKeyframe = frame.key_frame === 1 || frame.pict_type === "I";
                  const pictType = frame.pict_type || "Unknown";
                  const timestamp = frame.best_effort_timestamp_time;

                  if (isKeyframe) {
                    frameTypes.push(`Frame ${i}: ${pictType}`);
                    if (timestamp !== undefined && timestamp !== null) {
                      keyframes.push(parseFloat(timestamp));
                      logger.debug(`Found keyframe at ${timestamp}s (Frame ${i}, Type: ${pictType})`);
                    }
                  }
                }
              }
              
              logger.info(`Found ${keyframes.length} keyframes`);
              if (frameTypes.length > 0) {
                logger.debug("Frame types found: " + frameTypes.slice(0, 10).join(", "));
              }
              
              if (keyframes.length === 0) {
                reject(new Error("[FAILED] No keyframes found in video"));
                return;
              }
              
              resolve();
            } catch (e) {
              // Save problematic output for debugging
              const errorPath = path.join(os.tmpdir(), `ffprobe_error_${Date.now()}.log`);
              writeFile(errorPath, buffer).catch(err => 
                logger.warn("Failed to save error output", { error: err.message })
              );
              logger.error("Saved problematic ffprobe output", { path: errorPath });
              
              reject(new Error(`[FAILED] Failed to parse FFprobe output: ${e instanceof Error ? e.message : String(e)}`));
            }
          } else {
            reject(new Error(`FFprobe process exited with code ${code}`));
          }
        });

        keyframeProcess.on('error', (err: Error) => {
          reject(new Error(`FFprobe process error: ${err.message}`));
        });
      });

      // Calculate split points
      const segmentDuration = duration / numberOfSegments;
      const splitPoints: number[] = [];

      // Include start and end points
      splitPoints.push(0); // Always start at 0
      for (let i = 1; i < numberOfSegments; i++) {
        const targetTime = i * segmentDuration;
        // Find nearest keyframe
        const nearestKeyframe = keyframes.reduce((prev, curr) => 
          Math.abs(curr - targetTime) < Math.abs(prev - targetTime) ? curr : prev
        );
        if (!splitPoints.includes(nearestKeyframe)) {
          splitPoints.push(nearestKeyframe);
        }
      }
      splitPoints.push(duration); // Always end at duration

      // Ensure we have the exact number of segments
      splitPoints.sort((a, b) => a - b);

      // Process segments
      const segments: VideoSegment[] = [];
      for (let i = 0; i < splitPoints.length - 1; i++) {
        const startTime = splitPoints[i];
        const endTime = splitPoints[i + 1];
        const segmentIndex = i + 1;
        const paddedIndex = segmentIndex.toString().padStart(2, '0');
        const outputFile = path.join(os.tmpdir(), `segment_${paddedIndex}.mp4`);

        // Split using FFmpeg
        const splitCommand = [
          'ffmpeg', '-y',
          '-i', tempInputPath,
          '-ss', startTime.toString(),
          '-to', endTime.toString(),
          '-c', 'copy',
          outputFile
        ];

        logger.debug(`Running FFmpeg split command: ${splitCommand.join(' ')}`);

        try {
          await new Promise<void>((resolve, reject) => {
            const process = spawn(splitCommand[0], splitCommand.slice(1), {
              stdio: ['pipe', 'pipe', 'pipe']
            });

            let stderr = '';
            process.stderr?.on('data', (data: Buffer) => {
              stderr += data.toString();
            });
            
            process.on('close', (code: number | null) => {
              if (code === 0) {
                logger.info(`Created segment ${segmentIndex}: ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s`);
                resolve();
              } else {
                reject(new Error(`FFmpeg split failed with code ${code}. Error: ${stderr}`));
              }
            });
          });

          // Upload to R2
          const r2Key = `video-segments/${path.basename(tempInputPath, '.mp4')}/${path.basename(outputFile)}`;
          const upload = new Upload({
            client: s3Client,
            params: {
              Bucket: process.env.R2_BUCKET!,
              Key: r2Key,
              Body: createReadStream(outputFile),
              ContentType: "video/mp4",
            },
            queueSize: QUEUE_SIZE,
            partSize: PART_SIZE,
            leavePartsOnError: false,
          });

          await upload.done();

          // Add segment info
          segments.push({
            url: `${process.env.R2_PUBLIC_URL}/${r2Key}`,
            index: i,
            startTime,
            endTime,
            duration: endTime - startTime,
            keyframes: keyframes.filter(k => k >= startTime && k <= endTime)
          });

          // Cleanup segment file
          await unlink(outputFile);
          logger.debug(`Cleaned up temporary segment file: ${outputFile}`);

        } catch (error) {
          logger.error(`Error creating segment ${segmentIndex}:`, {
            error: error instanceof Error ? error.message : String(error),
            startTime,
            endTime
          });
          throw error;
        }
      }

      // Cleanup input file
      if (tempInputPath) {
        await unlink(tempInputPath);
      }

      logger.info("Split operation complete", {
        segmentCount: segments.length,
        totalDuration: duration
      });

      return {
        success: true,
        segments,
        probeData,
        totalDuration: duration
      };

    } catch (error) {
      // Cleanup on error
      if (tempInputPath) {
        try {
          await unlink(tempInputPath);
        } catch (cleanupError) {
          logger.warn("Failed to cleanup temp file", { tempInputPath });
        }
      }

      const statusMatch = error instanceof Error ? error.message.match(/^\[(.*?)\]/) : null;
      const status = statusMatch ? statusMatch[1] : "FAILED";
      const cleanMessage = error instanceof Error ? error.message.replace(/^\[.*?\]\s*/, '') : "Unknown error";

      logger.error(`Video split ${status.toLowerCase()}`, {
        error: cleanMessage,
        status,
        url
      });

      return {
        success: false,
        segments: [],
        error: `[${status}] ${cleanMessage}`
      };
    }
  }
}); 