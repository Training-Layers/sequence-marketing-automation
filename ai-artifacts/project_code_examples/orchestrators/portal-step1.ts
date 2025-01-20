/**
 * Portal Step 1 Orchestration Task
 * 
 * This task orchestrates multiple parallel processing flows for a media file:
 * Flow 1: Audio extraction and transcription
 *   - Extract audio in multiple formats (MP3, AAC, WAV)
 *   - Send WAV to Deepgram for transcription
 *   - Generate subtitle files (SRT and JSON)
 * 
 * Flow 2: Video Processing
 *   - Detect input format (MP4/WebM)
 *   - Process with appropriate task (processVideoTask/processWebMVideoTask)
 *   - Convert to both MP4/H.264 and WebM/VP9 formats
 * 
 * Input:
 * ```typescript
 * {
 *   url: string;              // URL of the media file to process
 *   targetHeight?: number;    // Optional: Height to resize videos to
 *   outputPrefix?: string;    // Optional: Prefix for output filenames
 * }
 * ```
 * 
 * Output:
 * ```typescript
 * {
 *   success: boolean;
 *   error?: string;
 *   audio: {
 *     mp3Url?: string;
 *     aacUrl?: string;
 *     wavUrl?: string;
 *     transcription?: {
 *       srtUrls: { type: string; url: string }[];
 *       jsonUrls: { type: string; url: string }[];
 *     };
 *   };
 *   video: {
 *     mp4Url?: string;
 *     webm?: {
 *       withAudioUrl?: string;
 *       noAudioUrl?: string;
 *     };
 *   };
 *   processingDetails?: {
 *     duration: number;
 *     audioExtractionTime?: number;
 *     transcriptionTime?: number;
 *     mp4ProcessingTime?: number;
 *     webmProcessingTime?: number;
 *     inputFormat?: string;
 *   };
 * }
 * ```
 */

import { task, logger, runs } from "@trigger.dev/sdk/v3";
import { audioExtract } from "../audio/audio_extract";
import { audioSttDeepgram } from "../audio/audio_stt_deepgram";
import { transcriptMagic } from "../utilities/subtitle_format_deepgram";
import { processVideoTask } from "../video/video_process";
import { processWebMVideoTask } from "../video/video_process_webm";
import { videoStripAudio } from "../video/video_strip_audio";
import { promisify } from "util";
import { exec } from "child_process";
import fetch from "node-fetch";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

interface FFprobeData {
  streams: {
    codec_type: string;
    codec_name?: string;
  }[];
  format?: {
    format_name?: string;
  };
}

interface AudioOutputFile {
  format: string;
  outputFilename: string;
  r2Key: string;
  r2Bucket: string;
  publicUrl: string;
  audioCodec: string;
  needsTranscode: boolean;
}

interface PortalStep1Output {
  success: boolean;
  error?: string;
  audio: {
    mp3Url?: string;
    aacUrl?: string;
    wavUrl?: string;
    transcription?: {
      srtUrls: { type: string; url: string }[];
      jsonUrls: { type: string; url: string }[];
    };
  };
  video: {
    mp4Url?: string;
    webm?: {
      withAudioUrl?: string;
      noAudioUrl?: string;
    };
  };
  processingDetails?: {
    duration: number;
    audioExtractionTime?: number;
    transcriptionTime?: number;
    mp4ProcessingTime?: number;
    webmProcessingTime?: number;
    inputFormat?: string;
  };
}

export const portalStep1 = task({
  id: "portal-step1",
  machine: {
    preset: "large-2x"
  },
  run: async (payload: { 
    url: string;
    targetHeight?: number;
    outputPrefix?: string;
  }): Promise<PortalStep1Output> => {
    const startTime = Date.now();
    
    try {
      logger.info("Starting Portal Step 1 orchestration", {
        url: payload.url,
        targetHeight: payload.targetHeight,
        outputPrefix: payload.outputPrefix
      });

      // Check input format from URL extension
      const isWebM = payload.url.toLowerCase().endsWith('.webm');

      // Common video processing options
      const videoOptions = {
        url: payload.url,
        targetHeight: payload.targetHeight,
        numberOfSegments: 4,
        maxConcurrency: 4,
        codecOptions: {
          preset: 'medium',
          crf: 23,
          quality: 31,
          speed: 1,
          threads: 0
        }
      };

      // Start both tracks in parallel
      logger.info("Starting parallel audio and video tracks");

      // Track 1: Audio Processing - Start the chain
      logger.info("Starting audio track");
      const audioTrack = async () => {
        logger.info("Starting audio extraction");
        const audioResult = await audioExtract.triggerAndWait({
          url: payload.url,
          formats: ["mp3", "aac", "wav"]
        }).unwrap();

        logger.info("Audio extraction completed", { success: audioResult.success });

        if (!audioResult.success || !audioResult.outputs || audioResult.outputs.length === 0) {
          throw new Error("Audio extraction failed or produced no outputs");
        }

        const audioFiles = audioResult.outputs;
        const audioUrls = {
          mp3Url: audioFiles.find(f => f.format === "mp3")?.publicUrl,
          aacUrl: audioFiles.find(f => f.format === "aac")?.publicUrl,
          wavUrl: audioFiles.find(f => f.format === "wav")?.publicUrl
        };

        // Chain Deepgram transcription
        const wavFile = audioFiles.find(f => f.format === "wav");
        if (!wavFile?.publicUrl) {
          throw new Error("WAV file not found in audio extraction output");
        }

        logger.info("Starting Deepgram transcription", { wavUrl: wavFile.publicUrl });
        const transcriptionStartTime = Date.now();
        
        const transcriptionResult = await audioSttDeepgram.triggerAndWait({
          url: wavFile.publicUrl,
          model: "nova-2",
          options: {
            smart_format: true,
            punctuate: true,
            diarize: true,
            utterances: true,
            utt_split: 1.1
          }
        }).unwrap();

        if (!transcriptionResult.publicUrl) {
          throw new Error("No transcription URL in Deepgram output");
        }

        logger.info("Deepgram transcription completed", { 
          success: transcriptionResult.success,
          transcriptLength: transcriptionResult.transcript?.length || 0
        });

        // Chain subtitle formatting
        logger.info("Starting subtitle formatting", { transcriptionUrl: transcriptionResult.publicUrl });
        
        const subtitleResult = await transcriptMagic.triggerAndWait({
          url: transcriptionResult.publicUrl
        }).unwrap();

        logger.info("Subtitle formatting completed", { 
          success: subtitleResult.success,
          numFiles: subtitleResult.files?.length || 0
        });

        return {
          audioUrls,
          transcriptionStartTime,
          subtitleResult
        };
      };

      // Track 2: Video Processing - Start the chain
      logger.info("Starting video track");
      const videoTrack = async () => {
        let webmUrl: string;
        
        // If input is MP4, we need to convert to WebM first
        if (!isWebM) {
          logger.info("Converting MP4 to WebM", { 
            inputUrl: payload.url,
            targetHeight: payload.targetHeight
          });
          
          const processResult = await processVideoTask.triggerAndWait({
            url: payload.url,
            targetHeight: payload.targetHeight,
            numberOfSegments: 4,
            maxConcurrency: 4,
            outputFormat: 'webm',
            codecOptions: {
              preset: 'medium',
              crf: 23,
              quality: 31,
              speed: 1,
              threads: 0
            }
          }).unwrap();

          if (!processResult.outputUrl) {
            throw new Error("No output URL in video processing result");
          }

          logger.info("MP4 to WebM conversion completed", {
            webmUrl: processResult.outputUrl
          });

          webmUrl = processResult.outputUrl;
        } else {
          // Input is already WebM
          webmUrl = payload.url;
        }

        // Now we have a WebM file, create the no-audio version
        logger.info("Creating no-audio version from WebM", {
          inputUrl: webmUrl,
          taskId: "video_strip_audio"
        });

        const noAudioResult = await videoStripAudio.triggerAndWait({
          url: webmUrl
        }).unwrap();

        if (!noAudioResult.publicUrl) {
          throw new Error("No public URL in no-audio result");
        }

        logger.info("No-audio WebM version created successfully", {
          inputUrl: webmUrl,
          noAudioUrl: noAudioResult.publicUrl
        });

        return {
          webm: {
            withAudioUrl: webmUrl,
            noAudioUrl: noAudioResult.publicUrl
          }
        };
      };

      // Wait for both tracks to complete
      const [audioResults, videoResults] = await Promise.all([
        audioTrack(),
        videoTrack()
      ]);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Format transcription outputs
      const srtUrls = (audioResults.subtitleResult.files || [])
        .filter(f => f.format === "srt")
        .map(f => ({ type: f.type, url: f.publicUrl }));

      const jsonUrls = (audioResults.subtitleResult.files || [])
        .filter(f => f.format === "json")
        .map(f => ({ type: f.type, url: f.publicUrl }));

      return {
        success: true,
        audio: {
          ...audioResults.audioUrls,
          transcription: {
            srtUrls,
            jsonUrls
          }
        },
        video: videoResults,
        processingDetails: {
          duration,
          audioExtractionTime: audioResults.transcriptionStartTime - startTime,
          transcriptionTime: Date.now() - audioResults.transcriptionStartTime,
          inputFormat: isWebM ? 'webm' : 'mp4'
        }
      };
    } catch (error) {
      logger.error("Portal Step 1 orchestration failed", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        audio: {},
        video: {}
      };
    }
  }
}); 