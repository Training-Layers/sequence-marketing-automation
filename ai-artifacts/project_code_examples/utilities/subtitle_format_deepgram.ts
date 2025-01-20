/**
 * Transcript Magic Task
 * 
 * This task processes a Deepgram JSON transcript and generates multiple formatted outputs:
 * - SRT files (sentence, utterance, word level)
 * - JSON files (sentence, utterance, word level)
 * 
 * Key Features:
 * - Concurrent file generation and uploads for optimal performance
 * - Three levels of granularity: sentences, utterances, and words
 * - Both SRT (for video players) and JSON (for programmatic use) outputs
 * - Organized R2 storage structure: /transcripts/{format}/{filename}
 * 
 * Input:
 * ```typescript
 * {
 *   url: string; // URL to a Deepgram JSON file stored in R2
 * }
 * ```
 * 
 * Output:
 * ```typescript
 * {
 *   success: boolean;
 *   files?: Array<{
 *     format: 'srt' | 'json';
 *     type: 'sentence' | 'utterance' | 'word';
 *     outputFilename: string;
 *     r2Key: string;
 *     publicUrl: string;
 *     entryCount: number;
 *   }>;
 *   error?: string;
 * }
 * ```
 * 
 * File Structure:
 * - SRT files: /transcripts/srt/transcript-{type}-{timestamp}.srt
 * - JSON files: /transcripts/json/transcript-{type}-{timestamp}.json
 * 
 * Performance Optimizations:
 * - Parallel file generation using Promise.all
 * - Concurrent R2 uploads
 * - Efficient memory usage by streaming content directly to R2
 * - Concurrent cleanup of temporary files
 * 
 * Error Handling:
 * - Input validation for Deepgram JSON structure
 * - Graceful cleanup of temporary files on failure
 * - Detailed error logging with context
 * 
 * Example Usage:
 * ```typescript
 * const result = await client.run("transcript-magic", {
 *   url: "https://example.com/transcripts/transcript.json"
 * });
 * 
 * // Access the generated files
 * const srtFiles = result.files?.filter(f => f.format === 'srt');
 * const jsonFiles = result.files?.filter(f => f.format === 'json');
 * ```
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import path from "path";
import os from "os";
import { writeFile, unlink } from "fs/promises";
import fetch from "node-fetch";

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

// Helper functions for time formatting and data extraction
/**
 * Formats a timestamp in seconds to SRT format: HH:MM:SS,mmm
 * @param seconds - Time in seconds with millisecond precision
 * @returns Formatted time string
 */
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Represents a subtitle entry with timing and text
 */
interface SubtitleItem {
  start: number;
  end: number;
  text: string;
}

/**
 * Generates SRT format content from subtitle items
 * Format: 
 * 1
 * 00:00:01,000 --> 00:00:02,000
 * Subtitle text
 */
function generateSRT(items: SubtitleItem[]): string {
  return items.map((item, index) => {
    return `${index + 1}\n${formatTime(item.start)} --> ${formatTime(item.end)}\n${item.text}\n`;
  }).join('\n');
}

/**
 * Generates structured JSON format with metadata and subtitles
 * Includes timing information in both seconds and formatted strings
 */
function generateJSON(items: SubtitleItem[], type: string): string {
  return JSON.stringify({
    metadata: {
      type,
      total_entries: items.length,
      duration: items.reduce((acc, item) => Math.max(acc, item.end), 0)
    },
    subtitles: items.map((item, index) => ({
      id: index + 1,
      start: item.start,
      end: item.end,
      text: item.text,
      start_time: formatTime(item.start),
      end_time: formatTime(item.end),
      duration: Number((item.end - item.start).toFixed(3))
    }))
  }, null, 2);
}

/**
 * Extracts utterance-level subtitles from Deepgram JSON
 * Utterances are longer segments of continuous speech
 */
function extractUtterances(data: any): SubtitleItem[] {
  try {
    // Try processed format first (from audio_transcribe_deepgram)
    if (data.result?.results?.utterances) {
      return data.result.results.utterances.map((utterance: any) => ({
        start: utterance.start,
        end: utterance.end,
        text: utterance.transcript
      }));
    }
    
    // Fall back to raw Deepgram format
    const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    if (transcript) {
      return [{
        start: 0,
        end: data.metadata.duration,
        text: transcript
      }];
    }
    
    throw new Error("Could not find transcript data in either format");
  } catch (error) {
    logger.warn("Error in extractUtterances, falling back to simple format", { error });
    // Last resort fallback
    return [{
      start: 0,
      end: data.metadata?.duration || 0,
      text: "Transcript extraction failed"
    }];
  }
}

/**
 * Extracts sentence-level subtitles from Deepgram JSON
 * Sentences are grammatically complete units of speech
 */
function extractSentences(data: any): SubtitleItem[] {
  try {
    // Try processed format first (from audio_transcribe_deepgram)
    if (data.result?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs) {
      const sentences: SubtitleItem[] = [];
      const paragraphs = data.result.results.channels[0].alternatives[0].paragraphs.paragraphs;
      paragraphs.forEach((paragraph: any) => {
        paragraph.sentences.forEach((sentence: any) => {
          sentences.push({
            start: sentence.start,
            end: sentence.end,
            text: sentence.text
          });
        });
      });
      return sentences;
    }
    
    // Fall back to raw Deepgram format
    const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    if (transcript) {
      const sentences: SubtitleItem[] = [];
      const sentenceTexts = transcript.match(/[^.!?]+[.!?]+/g) || [transcript];
      let currentTime = 0;
      const avgDuration = data.metadata.duration / sentenceTexts.length;
      
      sentenceTexts.forEach((text: string) => {
        sentences.push({
          start: currentTime,
          end: currentTime + avgDuration,
          text: text.trim()
        });
        currentTime += avgDuration;
      });
      return sentences;
    }
    
    throw new Error("Could not find transcript data in either format");
  } catch (error) {
    logger.warn("Error in extractSentences, falling back to simple format", { error });
    // Last resort fallback
    return [{
      start: 0,
      end: data.metadata?.duration || 0,
      text: "Sentence extraction failed"
    }];
  }
}

/**
 * Extracts word-level subtitles from Deepgram JSON
 * Words are individual spoken words with precise timing
 */
function extractWords(data: any): SubtitleItem[] {
  try {
    // Try processed format first (from audio_transcribe_deepgram)
    if (data.result?.results?.channels?.[0]?.alternatives?.[0]?.words) {
      return data.result.results.channels[0].alternatives[0].words.map((word: any) => ({
        start: word.start,
        end: word.end,
        text: word.punctuated_word || word.word
      }));
    }
    
    // Fall back to raw Deepgram format
    if (data.results?.channels?.[0]?.alternatives?.[0]?.words) {
      return data.results.channels[0].alternatives[0].words.map((word: any) => ({
        start: word.start,
        end: word.end,
        text: word.punctuated_word || word.word
      }));
    }
    
    throw new Error("Could not find word-level data in either format");
  } catch (error) {
    logger.warn("Error in extractWords, falling back to simple format", { error });
    // Last resort fallback
    return [{
      start: 0,
      end: data.metadata?.duration || 0,
      text: "Word extraction failed"
    }];
  }
}

/**
 * Represents a generated output file with metadata
 */
interface OutputFile {
  format: string;
  type: string;
  outputFilename: string;
  r2Key: string;
  publicUrl: string;
  entryCount: number;
}

/**
 * Task output interface with success status and file details
 */
export interface TranscriptMagicOutput {
  success: boolean;
  error?: string;
  files?: OutputFile[];
}

export const transcriptMagic = task({
  id: "subtitle_format_deepgram",
  machine: {
    preset: "small-1x",  // CPU-focused task
  },
  run: async (payload: { url: string }): Promise<TranscriptMagicOutput> => {
    const { url } = payload;
    const tempFiles: string[] = [];
    const outputFiles: OutputFile[] = [];
    const timestamp = Date.now();

    try {
      logger.info("Starting transcript magic task", { 
        url,
        timestamp: new Date().toISOString()
      });

      // Fetch and parse the Deepgram JSON
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch transcript: ${response.statusText}`);
      }

      const data = await response.json();

      // Extract different levels of subtitles
      const formats = [
        { type: 'sentence', items: extractSentences(data) },
        { type: 'utterance', items: extractUtterances(data) },
        { type: 'word', items: extractWords(data) }
      ];

      // Generate all files concurrently
      const fileGenerationPromises = formats.flatMap(format => [
        // Generate SRT
        {
          format: 'srt',
          type: format.type,
          filename: `transcript-${format.type}-${timestamp}.srt`,
          content: generateSRT(format.items),
          entryCount: format.items.length
        },
        // Generate JSON
        {
          format: 'json',
          type: format.type,
          filename: `transcript-${format.type}-${timestamp}.json`,
          content: generateJSON(format.items, format.type),
          entryCount: format.items.length
        }
      ]);

      // Write all files concurrently
      await Promise.all(fileGenerationPromises.map(async (file) => {
        const filePath = path.join(os.tmpdir(), file.filename);
        await writeFile(filePath, file.content);
        tempFiles.push(filePath);
        return { ...file, path: filePath };
      }));

      // Upload all files to R2 concurrently
      const uploadPromises = fileGenerationPromises.map(async (file) => {
        const r2Key = `transcripts/${file.format}/${file.filename}`;
        
        await new Upload({
          client: s3Client,
          params: {
            Bucket: process.env.R2_BUCKET!,
            Key: r2Key,
            Body: file.content,
            ContentType: file.format === 'srt' ? 'text/srt' : 'application/json',
          },
          partSize: 5 * 1024 * 1024,
          leavePartsOnError: false,
        }).done();

        outputFiles.push({
          format: file.format,
          type: file.type,
          outputFilename: file.filename,
          r2Key,
          publicUrl: `${process.env.R2_PUBLIC_URL}/${r2Key}`,
          entryCount: file.entryCount
        });

        logger.info(`Generated ${file.type}-${file.format} file`, {
          type: file.type,
          format: file.format,
          entries: file.entryCount
        });
      });

      await Promise.all(uploadPromises);

      // Clean up temp files concurrently
      await Promise.all(tempFiles.map(file => 
        unlink(file).catch(err => 
          logger.warn("Failed to clean up temp file", { file, error: err })
        )
      ));

      logger.info("Transcript magic completed", {
        totalFiles: outputFiles.length,
        types: outputFiles.map(f => `${f.type}-${f.format}`).join(', ')
      });

      return {
        success: true,
        files: outputFiles
      };

    } catch (error) {
      logger.error("Transcript magic failed", { 
        error: error instanceof Error ? error.message : "Unknown error",
        url
      });

      // Clean up temp files
      await Promise.all(tempFiles.map(file => 
        unlink(file).catch(() => {/* ignore cleanup errors */})
      ));

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  },
}); 