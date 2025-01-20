/**
 * Audio Transcription Task
 * 
 * This task handles the transcription of audio files using the Deepgram API,
 * with support for advanced features like smart formatting, punctuation,
 * and speaker diarization.
 * 
 * Key Features:
 * - Integration with Deepgram's Nova-2 model
 * - Smart formatting and punctuation
 * - Speaker diarization support
 * - Progress tracking for long transcriptions
 * - R2 storage for both input and output
 * 
 * Input:
 * ```typescript
 * {
 *   conversionResult: {
 *     success: boolean;
 *     outputFilename: string;
 *     r2Key?: string;
 *     r2Bucket?: string;
 *     error?: string;
 *   }
 * }
 * ```
 * 
 * Output:
 * ```typescript
 * {
 *   success: boolean;
 *   error?: string;
 *   transcript?: string;
 *   r2Key?: string;
 *   r2Bucket?: string;
 *   result?: any;  // Full Deepgram response
 * }
 * ```
 * 
 * Processing Steps:
 * 1. Validate conversion result
 * 2. Generate R2 public URL
 * 3. Submit to Deepgram API
 * 4. Process transcription result
 * 5. Store result in R2
 * 6. Clean up temporary files
 * 
 * Deepgram Configuration:
 * - Model: Nova-2
 * - Smart Format: Enabled
 * - Punctuation: Enabled
 * - Diarization: Enabled
 * 
 * Performance Optimizations:
 * - Efficient file handling
 * - Single-chunk upload for typical transcripts
 * - Concurrent cleanup operations
 * 
 * Error Handling:
 * - Detailed validation of conversion results
 * - Graceful cleanup of temporary files
 * - Comprehensive error logging
 * - Progress tracking for debugging
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@deepgram/sdk";
import type { ConvertToMp3Output } from "./audio_convert_mp3";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import path from "path";
import os from "os";
import { writeFile, unlink } from "fs/promises";

// Initialize the Deepgram client
const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export type TranscriptionOutput = {
  success: boolean;
  error?: string;
  transcript?: string;
  r2Key?: string;
  r2Bucket?: string;
  result?: any;
};

export const transcribeAudio = task({
  id: "audio_transcribe_deepgram",
  run: async (payload: { conversionResult: ConvertToMp3Output }): Promise<TranscriptionOutput> => {
    const { conversionResult } = payload;
    let tempFile: string | undefined;

    if (!conversionResult.success || !conversionResult.r2Key || !conversionResult.r2Bucket) {
      logger.error("Cannot transcribe: conversion failed or R2 details missing", { 
        success: conversionResult.success,
        hasR2Key: !!conversionResult.r2Key,
        hasR2Bucket: !!conversionResult.r2Bucket,
        error: conversionResult.error
      });
      return {
        success: false,
        error: `Invalid conversion result: ${conversionResult.error || "missing R2 details"}`,
      };
    }

    try {
      // Use the public R2.dev URL for accessing the file
      const audioUrl = `${process.env.R2_PUBLIC_URL}/${conversionResult.r2Key}`;
      logger.info("Starting transcription task", { 
        audioUrl,
        r2Key: conversionResult.r2Key,
        timestamp: new Date().toISOString()
      });

      // Transcribe the audio using Deepgram
      const transcriptionResult = await logger.trace("deepgram-transcription", async (span) => {
        span.setAttribute("audio_url", audioUrl);
        span.setAttribute("r2_key", conversionResult.r2Key!);

        const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
          {
            url: audioUrl,
          },
          {
            model: "nova-2",
            smart_format: true,
            punctuate: true,
            diarize: true,
          }
        );

        if (error) {
          logger.error("Failed to transcribe audio", { error });
          throw error;
        }

        return { result, error };
      });

      const transcript = transcriptionResult.result.results.channels[0].alternatives[0].paragraphs?.transcript;

      if (!transcript) {
        throw new Error("No transcript returned from Deepgram");
      }

      logger.info("Transcription completed", { 
        transcriptLength: transcript.length,
        wordCount: transcript.split(/\s+/).length
      });

      // Save transcription to R2
      const transcriptionPath = path.join(os.tmpdir(), `transcription-${Date.now()}.json`);
      tempFile = transcriptionPath;
      
      await logger.trace("save-transcription", async (span) => {
        const transcriptionData = JSON.stringify({ transcript, result: transcriptionResult.result }, null, 2);
        span.setAttribute("file_path", transcriptionPath);
        span.setAttribute("data_size", transcriptionData.length);

        await writeFile(transcriptionPath, transcriptionData);
        logger.info("Transcription saved temporarily", { 
          transcriptionPath,
          sizeBytes: transcriptionData.length 
        });

        const r2Key = `transcriptions/${path.basename(transcriptionPath)}`;
        const startTime = Date.now();
        
        const upload = new Upload({
          client: s3Client,
          params: {
            Bucket: process.env.R2_BUCKET!,
            Key: r2Key,
            Body: transcriptionData,
            ContentType: "application/json",
          },
          partSize: 5 * 1024 * 1024, // Single 5MB chunk for typical transcript sizes
          leavePartsOnError: false,
        });

        // Track upload progress
        upload.on("httpUploadProgress", (progress) => {
          const currentTime = Date.now();
          logger.info("Transcription upload progress", {
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
          
          logger.info("Transcription uploaded to R2", { 
            r2Key,
            uploadKey: result.Key,
            bucket: process.env.R2_BUCKET,
            sizeBytes: transcriptionData.length,
            uploadDurationMs: endTime - startTime,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString()
          });

          return { r2Key, transcriptionData };
        } catch (uploadError) {
          const errorTime = Date.now();
          span.setAttribute("upload_error", true);
          span.setAttribute("upload_error_time", errorTime);
          span.setAttribute("upload_duration_until_error_ms", errorTime - startTime);
          span.setAttribute("error", uploadError instanceof Error ? uploadError.message : "Unknown upload error");
          throw uploadError;
        }
      });

      // Clean up the temporary file
      try {
        await unlink(transcriptionPath);
        logger.info("Temporary file cleaned up", { transcriptionPath });
      } catch (cleanupError) {
        logger.warn("Failed to clean up temporary file", { 
          transcriptionPath,
          error: cleanupError instanceof Error ? cleanupError.message : "Unknown error" 
        });
      }

      logger.info("Transcription task completed successfully", {
        r2Key: conversionResult.r2Key,
        transcriptLength: transcript.length,
        processingTime: Date.now() - parseInt(transcriptionPath.split("-")[1]),
      });

      return {
        success: true,
        transcript,
        result: transcriptionResult.result,
        r2Key: conversionResult.r2Key,
        r2Bucket: process.env.R2_BUCKET,
      };
    } catch (error) {
      logger.error("Transcription failed", { 
        error: error instanceof Error ? error.message : "Unknown error",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        audioUrl: `${process.env.R2_PUBLIC_URL}/${conversionResult.r2Key}`,
        r2Key: conversionResult.r2Key
      });
      // Try to clean up the temporary file if it exists
      if (tempFile) {
        try {
          await unlink(tempFile);
        } catch {
          // Ignore cleanup errors in the error case
        }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
}); 