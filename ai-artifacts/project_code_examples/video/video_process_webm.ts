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

// Types for WebM video processing
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

interface WebMVideoSegment {
  url: string;          // R2 URL
  index: number;        // Position in sequence
  keyframes?: number[]; // Keyframe positions
  duration?: number;    // Segment duration
  startTime: number;    // Start time in seconds
  endTime: number;      // End time in seconds
  originalCodec?: string; // Store original codec info (VP8/VP9)
}

interface WebMSplitOutput {
  success: boolean;
  segments: WebMVideoSegment[];
  error?: string;
  probeData?: FFprobeData;
  totalDuration?: number;
  originalCodec?: string;
}

interface WebMProcessSegmentPayload {
  url: string;
  index: number;
  startTime: number;
  endTime: number;
  targetHeight?: number;
  dropAudio?: boolean;
  originalCodec?: string;
  transcodeThreads?: number;
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

interface WebMProcessSegmentOutput {
  success: boolean;
  url?: string;          // R2 URL of processed segment
  error?: string;
  index: number;         // Maintain order for reassembly
  processingStrategy?: string;
}

interface WebMProcessVideoPayload {
  url: string;                    // Required: URL of the WebM video to process
  numberOfSegments?: number;      // Optional: Number of segments to split into (default: 4)
  targetHeight?: number;          // Optional: Height to resize to, maintains aspect ratio (default: original height)
  dropAudio?: boolean;            // Optional: Whether to remove audio track (default: false)
  outputFileName?: string;        // Optional: Name for the output file (default: auto-generated)
  maxConcurrency?: number;        // Optional: Max parallel processing tasks (default: 4)
  parallelProbeThreads?: number;  // Optional: Threads for parallel keyframe analysis (default: 8)
  transcodeThreads?: number;      // Optional: Threads for FFmpeg transcoding (default: 0 for auto)
  outputFormat?: 'mp4' | 'webm';  // Optional: Output container format (default: 'mp4')
  codecOptions?: {
    // All codec options are optional with sensible defaults
    // VP9 options (used when outputFormat is 'webm')
    quality?: number;   // Quality: 0-63, lower is better (default: 31)
    speed?: number;    // Encoding speed: 0-5 (default: 1)
    // H.264 options (used when outputFormat is 'mp4')
    preset?: string;   // Encoding preset: ultrafast to veryslow (default: 'medium')
    crf?: number;     // Quality: 0-51, lower is better (default: 23)
    // Common options
    threads?: number; // Number of encoding threads, 0 for auto (default: 0)
  };
}

interface WebMProcessVideoOutput {
  success: boolean;
  error?: string;
  inputUrl: string;
  outputUrl?: string;
  duration?: number;
  processingDetails?: {
    segmentCount: number;
    targetHeight?: number;
    dropAudio: boolean;
    originalDuration?: number;
    finalDuration?: number;
    originalCodec?: string;
    inputFormat?: string;
    outputFormat?: string;
    transcodeStrategy?: string;
  };
}

// We can reuse the ReassembleVideoPayload and ReassembleVideoOutput types
// since by that point everything is MP4/H.264
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

interface WebMSplitPayload {
  url: string;
  numberOfSegments: number;
  parallelProbeThreads?: number;  // Renamed for clarity
}

// Update the segments task payload interface
interface WebMProcessSegmentsPayload {
  segments: WebMVideoSegment[];
  targetHeight?: number;
  dropAudio?: boolean;
  maxConcurrency?: number;
  transcodeThreads?: number;  // Added for FFmpeg transcode control
}

export const videoProcessWebm = task({
  id: "video_process_webm",
  machine: {
    preset: "large-2x"
  },
  run: async (payload: WebMSplitPayload): Promise<WebMSplitOutput> => {
    let tempInputPath: string | null = null;
    let probeData: FFprobeData | undefined;
    
    logger.info("Starting WebM split task", { 
      inputUrl: payload.url,
      numberOfSegments: payload.numberOfSegments,
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
      await logger.trace("download-webm", async (span) => {
        const startTime = Date.now();
        span.setAttribute("input_url", payload.url);

        const response = await fetch(payload.url);
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
          if (now - lastProgressLog >= PROGRESS_LOG_INTERVAL) {
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
        tempInputPath = path.join(os.tmpdir(), `input-${Date.now()}.webm`);
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

      // Get general probe data first to identify codec
      logger.info("Starting file probe", { tempInputPath });
      const probeCommand = `ffprobe -v quiet -print_format json -show_format -show_streams "${tempInputPath}"`;
      const { stdout } = await execAsync(probeCommand);
      probeData = JSON.parse(stdout) as FFprobeData;

      // Verify it's a WebM file with VP8/VP9
      const videoStream = probeData.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        throw new Error("[FAILED] No video stream found in WebM file");
      }

      const codec = videoStream.codec_name?.toLowerCase();
      if (!codec || !['vp8', 'vp9'].includes(codec)) {
        throw new Error(`[FAILED] Invalid codec for WebM processing: ${codec}`);
      }

      // Save metadata probe output for inspection
      const metadataPath = path.join(os.tmpdir(), `metadata_${Date.now()}.json`);
      await writeFile(metadataPath, JSON.stringify(probeData, null, 2));
      
      // Upload metadata to R2 for inspection
      const metadataR2Key = `debug/probe-data/metadata_${path.basename(tempInputPath!, '.webm')}_${Date.now()}.json`;
      const metadataUpload = new Upload({
        client: s3Client,
        params: {
          Bucket: process.env.R2_BUCKET!,
          Key: metadataR2Key,
          Body: JSON.stringify(probeData, null, 2),
          ContentType: "application/json",
        },
        queueSize: QUEUE_SIZE,
        partSize: PART_SIZE,
        leavePartsOnError: false,
      });

      await metadataUpload.done();

      logger.info("Saved metadata probe data", {
        localPath: metadataPath,
        debugUrl: `${process.env.R2_PUBLIC_URL}/${metadataR2Key}`,
        metadata: {
          codec: videoStream.codec_name,
          width: videoStream.width,
          height: videoStream.height,
          duration: probeData.format?.duration,
          size: probeData.format?.size,
          bitRate: probeData.format?.bit_rate
        }
      });

      // Get video duration - use format duration as the primary source
      const duration = probeData.format?.duration ? 
        parseFloat(probeData.format.duration) : 
        null;

      if (!duration) {
        throw new Error("[FAILED] Could not determine video duration");
      }

      logger.info("Video details", {
        codec,
        duration: duration.toFixed(2),
        width: videoStream.width,
        height: videoStream.height
      });

      // Get keyframes using the specialized WebM keyframe detection
      const parallelProbeThreads = payload.parallelProbeThreads || 8; // Default to 8 threads if not specified
      logger.info("Starting parallel keyframe analysis", { 
        tempInputPath,
        startTime: Date.now(),
        duration,
        parallelProbeThreads
      });
      
      const analyzeInterval = async (startTime: number, endTime: number): Promise<number[]> => {
        return new Promise((resolve, reject) => {
          const intervalKeyframes: number[] = [];
          let buffer = '';
          let frameCount = 0;
          let bufferedBytes = 0;
          const probeStartTime = Date.now();

          const keyframeProcess = spawn('ffprobe', [
            '-select_streams', 'v',
            '-show_frames',
            '-show_entries', 'frame=best_effort_timestamp_time,key_frame,pict_type',
            '-read_intervals', `${startTime}%${endTime}`,
            '-of', 'json',
            tempInputPath!
          ], {
            stdio: ['pipe', 'pipe', 'pipe']
          });

          if (!keyframeProcess.stdout || !keyframeProcess.stderr) {
            reject(new Error("Failed to create FFprobe process streams"));
            return;
          }

          keyframeProcess.stdout.on('data', (data: Buffer) => {
            buffer += data.toString();
            bufferedBytes += data.length;
          });

          keyframeProcess.stderr.on('data', (data: Buffer) => {
            logger.debug("FFprobe stderr", { 
              output: data.toString(),
              interval: `${startTime}-${endTime}`,
              timestamp: Date.now()
            });
          });

          keyframeProcess.on('close', async (code: number | null) => {
            if (code === 0) {
              try {
                const data = JSON.parse(buffer);
                if (data.frames) {
                  for (const frame of data.frames) {
                    frameCount++;
                    const isKeyframe = frame.key_frame === 1;
                    const timestamp = frame.best_effort_timestamp_time;

                    if (isKeyframe && timestamp !== undefined && timestamp !== null) {
                      intervalKeyframes.push(parseFloat(timestamp));
                    }
                  }
                }

                logger.info("Interval analysis complete", {
                  interval: `${startTime}-${endTime}`,
                  durationMs: Date.now() - probeStartTime,
                  bufferedMB: (bufferedBytes / 1024 / 1024).toFixed(2),
                  keyframesFound: intervalKeyframes.length,
                  framesProcessed: frameCount
                });

                resolve(intervalKeyframes);
              } catch (e) {
                reject(new Error(`Failed to parse interval ${startTime}-${endTime}: ${e instanceof Error ? e.message : String(e)}`));
              }
            } else {
              reject(new Error(`FFprobe process exited with code ${code} for interval ${startTime}-${endTime}`));
            }
          });

          keyframeProcess.on('error', (err: Error) => {
            reject(new Error(`FFprobe process error for interval ${startTime}-${endTime}: ${err.message}`));
          });
        });
      };

      try {
        // Split duration into intervals
        const intervalSize = duration / parallelProbeThreads;
        const intervals = Array.from({ length: parallelProbeThreads }, (_, i) => ({
          start: i * intervalSize,
          end: (i + 1) * intervalSize
        }));

        // Run parallel analysis
        const analysisStartTime = Date.now();
        const results = await Promise.all(
          intervals.map(({ start, end }) => analyzeInterval(start, end))
        );

        // Merge and sort keyframes
        const keyframes = results
          .flat()
          .sort((a, b) => a - b)
          // Remove any duplicates that might occur at interval boundaries
          .filter((value, index, array) => index === 0 || value !== array[index - 1]);

        logger.info("Parallel keyframe analysis complete", {
          totalDurationMs: Date.now() - analysisStartTime,
          totalKeyframes: keyframes.length,
          intervalsProcessed: parallelProbeThreads
        });

        if (keyframes.length === 0) {
          throw new Error("[FAILED] No keyframes found in WebM video");
        }

        // Calculate split points based on keyframes
        const segmentDuration = duration / payload.numberOfSegments;
        const splitPoints: number[] = [];

        // Include start and end points
        splitPoints.push(0); // Always start at 0
        for (let i = 1; i < payload.numberOfSegments; i++) {
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
        const segments: WebMVideoSegment[] = [];
        const segmentFiles: { path: string; segment: Omit<WebMVideoSegment, 'url'> }[] = [];

        // First, create all segments
        for (let i = 0; i < splitPoints.length - 1; i++) {
          const startTime = splitPoints[i];
          const endTime = splitPoints[i + 1];
          const segmentIndex = i + 1;
          const paddedIndex = segmentIndex.toString().padStart(2, '0');
          const outputFile = path.join(os.tmpdir(), `segment_${paddedIndex}.webm`);

          // Split using FFmpeg, maintaining WebM container for now
          const splitCommand = [
            'ffmpeg', '-y',
            '-i', tempInputPath,
            '-ss', startTime.toString(),
            '-to', endTime.toString(),
            '-c', 'copy',  // Copy streams without re-encoding
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
                  logger.info(`Created WebM segment ${segmentIndex}: ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s`);
                  resolve();
                } else {
                  reject(new Error(`FFmpeg split failed with code ${code}. Error: ${stderr}`));
                }
              });
            });

            // Store segment info for bulk upload
            segmentFiles.push({
              path: outputFile,
              segment: {
                index: i,
                startTime,
                endTime,
                duration: endTime - startTime,
                keyframes: keyframes.filter(k => k >= startTime && k <= endTime),
                originalCodec: codec
              }
            });

          } catch (error) {
            logger.error(`Error creating WebM segment ${segmentIndex}:`, {
              error: error instanceof Error ? error.message : String(error),
              startTime,
              endTime
            });
            throw error;
          }
        }

        // Bulk upload all segments
        logger.info("Starting bulk upload of segments", {
          segmentCount: segmentFiles.length
        });

        const uploadStartTime = Date.now();
        await Promise.all(segmentFiles.map(async ({ path: filePath, segment }) => {
          const r2Key = `webm-segments/${path.basename(tempInputPath!, '.webm')}/${path.basename(filePath)}`;
          const upload = new Upload({
            client: s3Client,
            params: {
              Bucket: process.env.R2_BUCKET!,
              Key: r2Key,
              Body: createReadStream(filePath),
              ContentType: "video/webm",
            },
            queueSize: QUEUE_SIZE,
            partSize: PART_SIZE,
            leavePartsOnError: false,
          });

          await upload.done();

          segments.push({
            ...segment,
            url: `${process.env.R2_PUBLIC_URL}/${r2Key}`
          });
        }));

        logger.info("Bulk upload complete", {
          uploadDurationMs: Date.now() - uploadStartTime,
          segmentsUploaded: segments.length
        });

        // Cleanup all temporary files
        logger.info("Starting cleanup");
        await Promise.all([
          ...segmentFiles.map(f => unlink(f.path)),
          tempInputPath ? unlink(tempInputPath) : Promise.resolve()
        ]);
        logger.info("Cleanup complete");

        logger.info("WebM split operation complete", {
          segmentCount: segments.length,
          totalDuration: duration,
          codec
        });

        return {
          success: true,
          segments,
          probeData,
          totalDuration: duration,
          originalCodec: codec
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

        logger.error(`WebM split ${status.toLowerCase()}`, {
          error: cleanMessage,
          status,
          url: payload.url
        });

        return {
          success: false,
          segments: [],
          error: `[${status}] ${cleanMessage}`
        };
      }
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

      logger.error(`WebM split ${status.toLowerCase()}`, {
        error: cleanMessage,
        status,
        url: payload.url
      });

      return {
        success: false,
        segments: [],
        error: `[${status}] ${cleanMessage}`
      };
    }
  }
}); 

export const webmProcessTask = task({
  id: "webm-process",
  machine: {
    preset: "large-2x"
  },
  queue: {
    concurrencyLimit: 4
  },
  run: async (payload: WebMProcessSegmentPayload): Promise<WebMProcessSegmentOutput> => {
    let tempInputPath: string | null = null;
    let tempOutputPath: string | null = null;

    try {
      logger.info("Starting WebM segment processing", {
        url: payload.url,
        index: payload.index,
        targetHeight: payload.targetHeight,
        dropAudio: payload.dropAudio,
        originalCodec: payload.originalCodec
      });

      // Download segment
      const response = await fetch(payload.url);
      if (!response.ok) {
        throw new Error(`Failed to download segment: ${response.statusText}`);
      }

      // Save to temp file
      tempInputPath = path.join(os.tmpdir(), `input_${Date.now()}.webm`);
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
        // VP9 defaults
        quality: 31,
        speed: 1,
        // H.264 defaults
        preset: 'medium',
        crf: 23,
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
      logger.debug("Running FFmpeg transcode command", { command: ffmpegArgs.join(' ') });
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
            reject(new Error(`FFmpeg transcode failed with code ${code}. Error: ${stderr}`));
          }
        });
      });

      // Verify the output has a keyframe at start
      const { stdout: keyframeCheck } = await execAsync(
        `ffprobe -select_streams v -show_frames -show_entries frame=key_frame,pkt_pts_time -of json -read_intervals "%+#1" "${tempOutputPath}"`
      );
      
      const keyframeData = JSON.parse(keyframeCheck);
      const firstFrame = keyframeData.frames?.[0];
      
      if (!firstFrame?.key_frame) {
        logger.warn("First frame is not a keyframe, this might cause issues", {
          segment: payload.index
        });
      }

      // Update R2 key and content type based on format
      const r2Key = `processed-segments/${path.basename(tempInputPath, '.webm')}_${targetWidth}x${targetHeight}.${outputExt}`;
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
        processingStrategy: `transcode-${payload.originalCodec}-to-${outputFormat === 'webm' ? 'vp9' : 'h264'}${payload.dropAudio ? '-no-audio' : ''}`
      };

    } catch (error) {
      // Cleanup on error
      if (tempInputPath) {
        try { await unlink(tempInputPath); } catch {}
      }
      if (tempOutputPath) {
        try { await unlink(tempOutputPath); } catch {}
      }

      logger.error("WebM segment processing failed", {
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

export const webmProcessSegmentsTask = task({
  id: "webm-process-segments",
  machine: {
    preset: "large-2x"
  },
  queue: {
    concurrencyLimit: 1  // Keep orchestrator single-threaded
  },
  run: async (payload: WebMProcessSegmentsPayload) => {
    const concurrencyLimit = payload.maxConcurrency || 4;
    
    logger.info("Starting parallel WebM segment processing", {
      segmentCount: payload.segments.length,
      targetHeight: payload.targetHeight,
      dropAudio: payload.dropAudio,
      concurrencyLimit
    });

    // Create a dynamic queue for this batch
    const queueName = `webm-resize-segments-${Date.now()}`;
    const dynamicQueue = {
      name: queueName,
      concurrencyLimit
    };

    // Process segments in parallel using batchTriggerAndWait
    const batchResult = await webmProcessTask.batchTriggerAndWait(
      payload.segments.map(segment => ({
        payload: {
          url: segment.url,
          index: segment.index,
          startTime: segment.startTime,
          endTime: segment.endTime,
          targetHeight: payload.targetHeight,
          dropAudio: payload.dropAudio,
          originalCodec: segment.originalCodec,
          transcodeThreads: payload.transcodeThreads  // Pass through to individual segment processing
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
      logger.error("Some WebM segments failed processing", {
        totalSegments: payload.segments.length,
        failedSegments: failures.length,
        errors: failures.map(failure => 
          failure.error instanceof Error ? failure.error.message : String(failure.error)
        )
      });
      throw new Error(`${failures.length} WebM segments failed processing`);
    }

    // Get successful results
    const successfulResults = results
      .filter((r): r is { ok: true; id: string; taskIdentifier: "webm-process"; output: WebMProcessSegmentOutput } => r.ok)
      .map(r => r.output)
      .sort((a, b) => a.index - b.index);

    return {
      success: true,
      segments: successfulResults.map(r => ({
        url: r.url!,
        index: r.index
      }))
    };
  }
}); 

export const processWebMVideoTask = task({
  id: "process-webm-video",
  machine: {
    preset: "large-2x"
  },
  queue: {
    concurrencyLimit: 2  // Allow 2 full video processes at once
  },
  run: async (payload: WebMProcessVideoPayload): Promise<WebMProcessVideoOutput> => {
    try {
      logger.info("Starting WebM video processing pipeline", {
        url: payload.url,
        targetHeight: payload.targetHeight,
        dropAudio: payload.dropAudio,
        numberOfSegments: payload.numberOfSegments,
        maxConcurrency: payload.maxConcurrency || 4
      });

      // 1. Split WebM video into segments
      const splitResult = await videoProcessWebm.triggerAndWait({
        url: payload.url,
        numberOfSegments: payload.numberOfSegments || 4,
        parallelProbeThreads: payload.parallelProbeThreads
      });

      if (!splitResult.ok) {
        throw new Error(`WebM split task failed: ${splitResult.error}`);
      }

      if (!splitResult.output.success) {
        throw new Error(`WebM split operation failed: ${splitResult.output.error}`);
      }

      logger.info("WebM split complete", {
        segmentCount: splitResult.output.segments.length,
        totalDuration: splitResult.output.totalDuration,
        originalCodec: splitResult.output.originalCodec
      });

      // 2. Process segments in parallel with dynamic concurrency
      const processResult = await webmProcessSegmentsTask.triggerAndWait({
        segments: splitResult.output.segments,
        targetHeight: payload.targetHeight,
        dropAudio: payload.dropAudio,
        maxConcurrency: payload.maxConcurrency
      });

      if (!processResult.ok) {
        throw new Error(`Process WebM segments task failed: ${processResult.error}`);
      }

      logger.info("WebM segment processing complete", {
        processedCount: processResult.output.segments.length
      });

      // 3. Reassemble processed segments (now in MP4 format)
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

      logger.info("WebM video processing complete", {
        outputUrl: reassembleResult.output.url,
        duration: reassembleResult.output.duration
      });

      return {
        success: true,
        inputUrl: payload.url,
        outputUrl: reassembleResult.output.url,
        duration: reassembleResult.output.duration,
        processingDetails: {
          segmentCount: splitResult.output.segments.length,
          targetHeight: payload.targetHeight,
          dropAudio: payload.dropAudio || false,
          originalDuration: splitResult.output.totalDuration,
          finalDuration: reassembleResult.output.duration,
          originalCodec: splitResult.output.originalCodec,
          inputFormat: 'webm',
          outputFormat: payload.outputFormat || 'mp4',
          transcodeStrategy: `webm-to-h264-${splitResult.output.originalCodec}`
        }
      };

    } catch (error) {
      logger.error("WebM video processing pipeline failed", {
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

      // Determine output format from first segment URL
      const isWebM = payload.segments[0]?.url.toLowerCase().endsWith('.webm');
      const extension = isWebM ? '.webm' : '.mp4';
      const contentType = isWebM ? 'video/webm' : 'video/mp4';

      // Create working directory
      const workDir = path.join(os.tmpdir(), `reassemble_${Date.now()}`);
      await mkdir(workDir, { recursive: true });

      // Download all segments
      await Promise.all(payload.segments.map(async (segment, idx) => {
        const response = await fetch(segment.url);
        if (!response.ok) {
          throw new Error(`Failed to download segment ${idx}: ${response.statusText}`);
        }

        const segmentPath = path.join(workDir, `segment_${idx.toString().padStart(3, '0')}${extension}`);
        const buffer = await response.arrayBuffer();
        await writeFile(segmentPath, Buffer.from(buffer));
        segmentPaths.push(segmentPath);

        logger.debug(`Downloaded segment ${idx}`, { path: segmentPath });
      }));

      // Create concat file
      concatFilePath = path.join(workDir, 'concat.txt');
      const concatContent = segmentPaths
        .sort((a, b) => {
          const aIdx = parseInt(path.basename(a, extension).split('_')[1]);
          const bIdx = parseInt(path.basename(b, extension).split('_')[1]);
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
      tempOutputPath = path.join(workDir, `output_${Date.now()}${extension}`);
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
      const outputFileName = payload.outputFileName || `merged_${Date.now()}${extension}`;
      const r2Key = `final-videos/${outputFileName}`;
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