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

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

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
  needsTranscode?: boolean;
  probeData?: FFprobeData;
};

export const videoNormalize = task({
  id: "video_normalize",
  machine: {
    preset: "large-2x"
  },
  run: async (payload: { 
    url: string; 
    targetHeight?: number;  // Optional target height (e.g., 1080, 720, 480)
    targetFps?: number;    // Optional target FPS (e.g., 30, 24, 15)
  }): Promise<NormalizeVideoOutput> => {
    const inputUrl = payload.url;
    const strategy = "download";
    let tempInputPath: string | null = null;
    let needsTranscode = true;
    let probeData: FFprobeData | undefined;
    
    // Default settings
    const DEFAULT_TARGET_HEIGHT = 1080;
    const DEFAULT_TARGET_FPS = 60;
    
    // Height to width mapping
    const heightToWidth = {
      1080: 1920,
      720: 1280,
      480: 854,
      360: 640,
      240: 426
    };
    
    // Get target values
    const targetHeight = payload.targetHeight || DEFAULT_TARGET_HEIGHT;
    const targetFps = payload.targetFps || DEFAULT_TARGET_FPS;
    const targetWidth = heightToWidth[targetHeight as keyof typeof heightToWidth] || 
                       Math.round((targetHeight * 16) / 9);
    
    logger.info("Starting video normalization task", { 
      inputUrl,
      strategy,
      targetHeight,
      targetWidth,
      targetFps,
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
      const audioStream = probeData.streams.find(stream => stream.codec_type === 'audio');

      if (!videoStream) {
        throw new Error("No video stream found in input file");
      }

      // Calculate total frames and get fps
      const fps = videoStream.r_frame_rate ? 
        eval(videoStream.r_frame_rate) : // r_frame_rate comes as "30000/1001" format
        29.97; // fallback
      const durationInSeconds = probeData.format?.duration ? 
        parseFloat(probeData.format.duration) : 
        0;
      const totalFrames = Math.ceil(fps * durationInSeconds);

      // Check if processing is needed
      const needsResize = payload.targetHeight !== undefined || 
                         (videoStream.height && videoStream.height > targetHeight);
      const needsFpsAdjust = payload.targetFps !== undefined && 
                            fps > targetFps;
      
      // Check if we need to transcode based on requirements
      needsTranscode = needsResize || needsFpsAdjust || !(
        videoStream.codec_name === 'h264' &&
        (!audioStream || ( // Either no audio or audio meets requirements
          audioStream.codec_name === 'aac' &&
          audioStream.sample_rate === '48000' &&
          audioStream.channels === 2 &&
          audioStream.bit_rate && parseInt(audioStream.bit_rate) === 128000
        ))
      );

      logger.info("File probe results", {
        videoCodec: videoStream.codec_name,
        currentResolution: `${videoStream.width}x${videoStream.height}`,
        targetResolution: needsResize ? `${targetWidth}x${targetHeight}` : 'original',
        currentFps: fps,
        targetFps: needsFpsAdjust ? targetFps : 'original',
        totalFrames,
        durationInSeconds,
        needsResize,
        needsFpsAdjust,
        audioCodec: audioStream?.codec_name,
        sampleRate: audioStream?.sample_rate,
        channels: audioStream?.channels,
        bitRate: audioStream?.bit_rate,
        needsTranscode,
        format: probeData.format?.format_name
      });

      const outputFilename = `normalized-${Date.now()}.mp4`;
      const outputPath = path.join(os.tmpdir(), outputFilename);

      await logger.trace("ffmpeg-normalization", async (span) => {
        span.setAttribute("input_url", inputUrl);
        span.setAttribute("temp_input_path", tempInputPath || "");
        span.setAttribute("output_path", outputPath);
        span.setAttribute("strategy", strategy);
        span.setAttribute("video_codec", videoStream.codec_name);
        span.setAttribute("audio_codec", audioStream?.codec_name || "none");
        span.setAttribute("needs_transcode", needsTranscode);

        if (needsTranscode) {
          if (!tempInputPath) {
            throw new Error('Input path is required');
          }

          // Set up FFmpeg process with conservative settings
          const ffmpegArgs = [
            // Hardware acceleration
            '-hwaccel', 'auto',
            '-hwaccel_output_format', 'auto',
            
            // Input options
            '-y',                // Overwrite output without asking
            '-nostdin',          // Prevent stdin interaction
            '-fflags', '+genpts', // Generate presentation timestamps
            '-i', tempInputPath, // Input file
            
            // Thread control
            '-threads', '0',     // Let FFmpeg handle threads
            '-thread_type', 'frame', // Frame-level threading
            
            // Video settings
            '-c:v', 'libx264',
            '-preset', 'ultrafast', // Match the preset we're logging
            '-tune', 'fastdecode',
            '-crf', '28',
            '-rc-lookahead', '20',
            '-refs', '1',             // Reduce reference frames
            '-keyint_min', '48',      // Adjust keyframe intervals
            '-g', '48',               // GOP size
            '-sc_threshold', '0',     // Disable scene change detection
            '-b_strategy', '0',        // Faster B-frame decisions
          ];

          // Calculate GOP size based on target FPS if specified
          if (needsFpsAdjust) {
            const gopSize = Math.round(targetFps * 2); // 2 seconds worth of frames
            ffmpegArgs.push(
              '-g', gopSize.toString(),
              '-keyint_min', Math.round(gopSize / 2).toString()
            );
          }

          // Build filter chain for resize and fps adjustment
          const filters = [];
          if (needsResize) {
            filters.push(`scale=-2:${targetHeight}:flags=fast_bilinear`); // Use faster scaling algorithm
          }
          if (needsFpsAdjust) {
            filters.push(`fps=${targetFps}`);
          }

          // Add filter complex if we have any filters
          if (filters.length > 0) {
            ffmpegArgs.push('-vf', filters.join(','));
          }

          // Add output path
          ffmpegArgs.push(outputPath);

          logger.info("Starting FFmpeg process with hardware acceleration", { 
            ffmpegArgs,
            inputResolution: `${videoStream.width}x${videoStream.height}`,
            videoCodec: videoStream.codec_name,
            audioCodec: audioStream?.codec_name,
            audioChannels: audioStream?.channels,
            preset: "ultrafast",
            threads: 0,
            hwaccel: "auto"
          });
          
          const ffmpeg: ChildProcess = spawn('ffmpeg', ffmpegArgs);
          
          let stderr = '';
          let lastProgress = '';
          let lastProgressTime = 0;
          const PROGRESS_INTERVAL = 5000; // Log progress every 5 seconds

          // Collect stderr for error reporting and progress
          ffmpeg.stderr?.on('data', (data: Buffer) => {
            const output = data.toString();
            stderr += output;
            
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
                  percentComplete: `${progressPercent}%`
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
                // Provide detailed error information
                reject(new Error(`FFmpeg process failed with code ${code}. Full error log: ${stderr}`));
              }
            });
            
            ffmpeg.on('error', (err: Error) => {
              reject(new Error(`FFmpeg process error: ${err.message}. Full error log: ${stderr}`));
            });

            // Add timeout handling
            const timeout = setTimeout(() => {
              ffmpeg.kill('SIGTERM');
              reject(new Error(`FFmpeg process timed out after 30 minutes. Last progress: ${lastProgress}`));
            }, 30 * 60 * 1000);

            ffmpeg.on('close', () => clearTimeout(timeout));
          });

          logger.info("FFmpeg normalization complete", { 
            outputPath,
            strategy,
            videoCodec: videoStream.codec_name,
            audioCodec: audioStream?.codec_name,
            lastProgress
          });
        } else {
          // If no transcode needed, just copy the file
          await writeFile(outputPath, buffer);
          logger.info("File copied without transcoding", {
            outputPath,
            videoCodec: videoStream.codec_name,
            audioCodec: audioStream?.codec_name
          });
        }
      });

      // Upload to R2
      const r2Key = `normalized-videos/${outputFilename}`;
      
      await logger.trace("upload-to-r2", async (span) => {
        span.setAttribute("r2_key", r2Key);
        const startTime = Date.now();
        
        const upload = new Upload({
          client: s3Client,
          params: {
            Bucket: process.env.R2_BUCKET!,
            Key: r2Key,
            Body: createReadStream(outputPath),
            ContentType: "video/mp4",
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
          
          logger.info("Video file uploaded to R2", { 
            r2Key,
            uploadKey: result.Key,
            bucket: process.env.R2_BUCKET,
            uploadDurationMs: endTime - startTime,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString()
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
            audioCodec: audioStream?.codec_name,
            needsTranscode,
            probeData
          };
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

      logger.info("Video normalization task completed successfully", {
        r2Key,
        outputFilename,
        strategy,
        videoCodec: videoStream.codec_name,
        audioCodec: audioStream?.codec_name,
        needsTranscode,
        processingTime: Date.now() - parseInt(outputFilename.split("-")[1]),
      });

      return {
        success: true,
        outputFilename,
        r2Key,
        r2Bucket: process.env.R2_BUCKET,
        publicUrl: `${process.env.R2_PUBLIC_URL}/${r2Key}`,
        strategy,
        videoCodec: videoStream.codec_name,
        audioCodec: audioStream?.codec_name,
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

      logger.error("Video normalization failed", { 
        error: error instanceof Error ? error.message : "Unknown error",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        inputUrl,
        strategy
      });
      
      return {
        success: false,
        outputFilename: "",
        error: error instanceof Error ? error.message : "Unknown error",
        strategy
      };
    }
  },
}); 