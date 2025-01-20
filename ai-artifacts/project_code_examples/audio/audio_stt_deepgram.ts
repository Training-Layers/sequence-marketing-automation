/**
 * Audio to Transcript Task
 * 
 * This task sends audio files to Deepgram for transcription and stores the results.
 * It supports direct audio file processing and includes detailed metadata in the output.
 * 
 * Key Features:
 * - Multiple audio format support (MP3, WAV, M4A)
 * - Smart formatting with punctuation
 * - Speaker diarization
 * - Detailed progress logging
 * - Configurable transcription options
 * - Multiple language support
 * 
 * Technical Details:
 * - Uses Deepgram's nova-2 model by default
 * - Stores full response with word-level timing
 * - Includes speaker diarization when enabled
 * - Preserves all metadata for downstream processing
 * 
 * Input Options:
 * - url: Direct URL to audio file (required)
 * - model: Deepgram model selection (default: "nova-2")
 * - language: Language code (default: "en")
 * - options: Deepgram configuration object
 *   - smart_format: Enable smart formatting (default: true)
 *   - punctuate: Add punctuation (default: true)
 *   - diarize: Enable speaker detection (default: true)
 * 
 * Output Format:
 * ```json
 * {
 *   "success": true,
 *   "outputFilename": "transcript-1234567890.json",
 *   "r2Key": "transcriptions/transcript-1234567890.json",
 *   "r2Bucket": "your-bucket-name",
 *   "publicUrl": "https://example.com/transcriptions/transcript-1234567890.json",
 *   "transcript": "Full text transcript...",
 *   "result": {
 *     // Full Deepgram response including:
 *     // - Word-level timing
 *     // - Speaker diarization
 *     // - Confidence scores
 *     // - Paragraph formatting
 *   }
 * }
 * ```
 * 
 * Storage Details:
 * - Files are stored in R2 with 'transcriptions/' prefix
 * - JSON format with full metadata
 * - Public URL provided for easy access
 * 
 * Error Handling:
 * - Validates input URL
 * - Handles Deepgram API errors
 * - Cleans up temporary files
 * - Provides detailed error messages
 * 
 * Example Usage:
 * ```typescript
 * // Basic usage
 * await client.run("audio-to-transcript", {
 *   url: "https://example.com/audio.mp3"
 * });
 * 
 * // Advanced usage with options
 * await client.run("audio-to-transcript", {
 *   url: "https://example.com/audio.mp3",
 *   model: "nova-2",
 *   language: "en",
 *   options: {
 *     smart_format: true,
 *     punctuate: true,
 *     diarize: true,
 *     utterance_split: true
 *   }
 * });
 * ```
 * 
 * @see https://developers.deepgram.com/docs/
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@deepgram/sdk";
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

export interface TranscriptionOptions {
  smart_format?: boolean;
  punctuate?: boolean;
  diarize?: boolean;
  [key: string]: any;  // Allow additional Deepgram options
}

export interface AudioToTranscriptOutput {
  success: boolean;
  outputFilename?: string;
  r2Key?: string;
  r2Bucket?: string;
  publicUrl?: string;
  error?: string;
  transcript?: string;
  result?: any;  // Full Deepgram response
}

export const audioSttDeepgram = task({
  id: "audio_stt_deepgram",
  machine: {
    preset: "medium-1x",
  },
  run: async (payload: { 
    url: string;
    model?: string;
    language?: string;
    options?: TranscriptionOptions;
  }): Promise<AudioToTranscriptOutput> => {
    const {
      url,
      model = "nova-2",
      language = "en",
      options = {
        model: "nova-2",
        detect_language: true,
        smart_format: true,
        punctuate: true,
        paragraphs: true,
        utterances: true,
        utt_split: 1.1
      }
    } = payload;

    let tempFile: string | undefined;

    try {
      logger.info("Starting transcription task", { 
        url,
        model,
        language,
        options,
        timestamp: new Date().toISOString()
      });

      // Transcribe the audio using Deepgram
      const transcriptionResult = await logger.trace("deepgram-transcription", async (span) => {
        span.setAttribute("audio_url", url);
        span.setAttribute("model", model);
        span.setAttribute("language", language);

        const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
          { url },
          {
            model,
            language,
            ...options
          }
        );

        if (error) {
          logger.error("Failed to transcribe audio", { error });
          throw error;
        }

        return { result, error };
      });

      const transcript = transcriptionResult.result.results.channels[0].alternatives[0].transcript;

      if (!transcript) {
        throw new Error("No transcript returned from Deepgram");
      }

      logger.info("Transcription completed", { 
        transcriptLength: transcript.length,
        wordCount: transcript.split(/\s+/).length,
        hasMultipleSpeakers: transcriptionResult.result.results.channels[0].alternatives[0].words?.some(w => w.speaker !== undefined)
      });

      // Save transcription to R2
      const outputFilename = `transcript-${Date.now()}.json`;
      const transcriptionPath = path.join(os.tmpdir(), outputFilename);
      tempFile = transcriptionPath;
      
      await logger.trace("save-transcription", async (span) => {
        const transcriptionData = JSON.stringify({
          transcript,
          metadata: {
            model,
            language,
            options,
            timestamp: new Date().toISOString(),
            audioUrl: url
          },
          result: transcriptionResult.result
        }, null, 2);

        span.setAttribute("file_path", transcriptionPath);
        span.setAttribute("data_size", transcriptionData.length);

        await writeFile(transcriptionPath, transcriptionData);
        logger.info("Transcription saved temporarily", { 
          transcriptionPath,
          sizeBytes: transcriptionData.length 
        });

        const r2Key = `transcriptions/${outputFilename}`;
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
            uploadDurationMs: endTime - startTime
          });

          return {
            r2Key,
            transcriptionData
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

      // Clean up temporary file
      try {
        await unlink(tempFile);
        logger.info("Temporary file cleaned up", { tempFile });
      } catch (cleanupError) {
        logger.warn("Failed to clean up temporary file", { 
          tempFile,
          error: cleanupError instanceof Error ? cleanupError.message : "Unknown error" 
        });
      }

      const publicUrl = `${process.env.R2_PUBLIC_URL}/transcriptions/${outputFilename}`;

      logger.info("Transcription task completed successfully", {
        outputFilename,
        transcriptLength: transcript.length,
        processingTime: Date.now() - parseInt(outputFilename.split("-")[1])
      });

      return {
        success: true,
        outputFilename,
        r2Key: `transcriptions/${outputFilename}`,
        r2Bucket: process.env.R2_BUCKET,
        publicUrl,
        transcript,
        result: transcriptionResult.result
      };

    } catch (error) {
      logger.error("Transcription failed", { 
        error: error instanceof Error ? error.message : "Unknown error",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        url
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
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },
}); 