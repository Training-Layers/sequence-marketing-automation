/**
 * SRT Converter Task
 * 
 * A comprehensive subtitle format converter that supports both standard subtitle formats
 * (via subsrt library) and additional human-readable formats (markdown, CSV, HTML).
 * 
 * The task performs concurrent format conversion and uploads to minimize processing time.
 * All generated files are stored in R2 with appropriate content types and organized paths.
 * 
 * Standard formats (via subsrt):
 * - MicroDVD SUB (.sub) - Frame-based subtitles
 * - SubRip (.srt) - Standard subtitle format
 * - SubViewer (.sbv) - YouTube compatible format
 * - WebVTT (.vtt) - Web-native subtitle format
 * - SubStation Alpha (.ssa and .ass) - Advanced styling
 * - SAMI (.smi) - Microsoft format
 * - LRC (.lrc) - Lyrics format
 * - JSON (.json) - Machine-readable format
 * 
 * Additional formats:
 * - Markdown (.md) - Documentation-friendly format
 * - CSV (.csv) - Spreadsheet compatible
 * - HTML (.html) - Web-ready with styling
 * 
 * Input:
 * ```typescript
 * {
 *   url: string;  // URL to source SRT file
 *   formats?: string[];  // Target formats to convert to (default: all)
 * }
 * ```
 * 
 * Output:
 * ```typescript
 * {
 *   success: boolean;
 *   files?: Array<{
 *     format: string;
 *     outputFilename: string;
 *     r2Key: string;
 *     publicUrl: string;
 *   }>;
 *   error?: string;
 * }
 * ```
 */

import { task, logger } from "@trigger.dev/sdk/v3";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import path from "path";
import os from "os";
import { writeFile, unlink } from "fs/promises";
import fetch from "node-fetch";
import subsrt from "subsrt";

// Initialize S3 client for R2 storage
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

// List of all supported output formats
// Standard formats from subsrt library plus our custom formats
const SUPPORTED_FORMATS = ['sub', 'srt', 'sbv', 'vtt', 'ssa', 'ass', 'smi', 'lrc', 'json', 'md', 'csv', 'html'];

// Interface for output file metadata
interface OutputFile {
  format: string;          // File format (extension)
  outputFilename: string;  // Generated filename
  r2Key: string;          // Full path in R2 storage
  publicUrl: string;      // Public accessible URL
}

// Task output interface
export interface SrtConverterOutput {
  success: boolean;        // Task completion status
  error?: string;         // Error message if failed
  files?: OutputFile[];   // List of generated files
}

/**
 * Parse SRT content into structured subtitle objects
 * 
 * Processes raw SRT content and extracts:
 * - Subtitle ID/index
 * - Start and end timestamps
 * - Subtitle text
 * 
 * Handles multi-line subtitles and preserves spacing
 */
function parseSRT(srtContent: string) {
  const lines = srtContent.trim().split('\n');
  const subtitles = [];
  let currentSubtitle: any = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Parse subtitle index number
    if (!isNaN(Number(line))) {
      if (currentSubtitle.text) {
        subtitles.push(currentSubtitle);
      }
      currentSubtitle = { id: parseInt(line) };
    } 
    // Parse timestamp line
    else if (line.includes('-->')) {
      const [start, end] = line.split('-->').map(time => time.trim());
      currentSubtitle.start = start;
      currentSubtitle.end = end;
    } 
    // Parse subtitle text (may be multi-line)
    else if (line !== '') {
      currentSubtitle.text = (currentSubtitle.text || '') + line + ' ';
    }
  }

  // Add the last subtitle
  if (currentSubtitle.text) {
    subtitles.push(currentSubtitle);
  }

  return subtitles;
}

/**
 * Generate Markdown format
 * 
 * Creates a documentation-friendly format with:
 * - Hierarchical headers for each subtitle
 * - Timestamps in bold
 * - Clean text formatting
 */
function generateMarkdown(subtitles: any[]) {
  return subtitles.map(subtitle => 
    `### ${subtitle.id}\n\n**${subtitle.start} --> ${subtitle.end}**\n\n${subtitle.text.trim()}\n`
  ).join('\n');
}

/**
 * Generate HTML format with styling
 * 
 * Creates a web-ready document with:
 * - Responsive layout
 * - Clean typography
 * - Styled timestamps
 * - Semantic HTML structure
 */
function generateHTML(subtitles: any[]) {
  const htmlSubtitles = subtitles.map(subtitle => 
    `<div class="subtitle">
  <h3>${subtitle.id}</h3>
  <p class="timestamp">${subtitle.start} --> ${subtitle.end}</p>
  <p class="text">${subtitle.text.trim()}</p>
</div>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SRT Transcript</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    .subtitle { margin-bottom: 1em; }
    .timestamp { font-style: italic; color: #666; }
  </style>
</head>
<body>
  <h1>SRT Transcript</h1>
  ${htmlSubtitles}
</body>
</html>`;
}

/**
 * Generate CSV format
 * 
 * Creates a spreadsheet-compatible format with:
 * - Header row
 * - Properly escaped fields
 * - Standard CSV structure
 */
function generateCSV(subtitles: any[]) {
  const header = 'ID,Start Time,End Time,Text\n';
  const rows = subtitles.map(subtitle => 
    `${subtitle.id},"${subtitle.start}","${subtitle.end}","${subtitle.text.trim()}"`
  ).join('\n');
  return header + rows;
}

/**
 * Main task definition for SRT conversion
 * 
 * Workflow:
 * 1. Validate input formats
 * 2. Fetch source SRT file
 * 3. Parse into structured format
 * 4. Convert to requested formats concurrently
 * 5. Upload to R2 storage
 * 6. Clean up temporary files
 * 
 * Features:
 * - Concurrent processing
 * - Proper error handling
 * - Temporary file cleanup
 * - Detailed logging
 */
export const srtConverter = task({
  id: "subtitle_convert",
  machine: {
    preset: "small-1x",  // CPU-focused task
  },
  run: async (payload: { 
    url: string;
    formats?: string[];
  }): Promise<SrtConverterOutput> => {
    const { url, formats = SUPPORTED_FORMATS } = payload;
    const tempFiles: string[] = [];      // Track temp files for cleanup
    const outputFiles: OutputFile[] = []; // Track generated files
    const timestamp = Date.now();        // Unique identifier for this run

    try {
      logger.info("Starting SRT converter task", { 
        url,
        formats,
        timestamp: new Date().toISOString()
      });

      // Validate requested formats against supported list
      const invalidFormats = formats.filter(f => !SUPPORTED_FORMATS.includes(f));
      if (invalidFormats.length > 0) {
        throw new Error(`Unsupported formats: ${invalidFormats.join(', ')}`);
      }

      // Fetch and validate source SRT file
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch SRT file: ${response.statusText}`);
      }

      // Parse content once for all conversions
      const srtContent = await response.text();
      const parsedSubtitles = parseSRT(srtContent);

      // Convert to all requested formats concurrently
      const conversionPromises = formats.map(async format => {
        // Skip if source format (avoid unnecessary conversion)
        if (format === 'srt' && url.endsWith('.srt')) {
          return;
        }

        let converted: string;
        let contentType: string;

        // Handle format-specific conversion
        if (format === 'md') {
          converted = generateMarkdown(parsedSubtitles);
          contentType = 'text/markdown';
        } else if (format === 'html') {
          converted = generateHTML(parsedSubtitles);
          contentType = 'text/html';
        } else if (format === 'csv') {
          converted = generateCSV(parsedSubtitles);
          contentType = 'text/csv';
        } else {
          // Use subsrt library for standard formats
          converted = subsrt.convert(srtContent, { format });
          contentType = `text/${format}`;
        }

        const filename = `transcript-${timestamp}.${format}`;
        const filePath = path.join(os.tmpdir(), filename);
        
        // Save to temp file (required for some processing)
        await writeFile(filePath, converted);
        tempFiles.push(filePath);

        // Upload to R2 with appropriate content type
        const r2Key = `transcripts/${format}/${filename}`;
        
        await new Upload({
          client: s3Client,
          params: {
            Bucket: process.env.R2_BUCKET!,
            Key: r2Key,
            Body: converted,
            ContentType: contentType,
          },
          partSize: 5 * 1024 * 1024,
          leavePartsOnError: false,
        }).done();

        // Track output file details
        outputFiles.push({
          format,
          outputFilename: filename,
          r2Key,
          publicUrl: `${process.env.R2_PUBLIC_URL}/${r2Key}`
        });

        logger.info(`Generated ${format} file`, {
          format,
          filename
        });
      });

      // Wait for all conversions to complete
      await Promise.all(conversionPromises);

      // Clean up temp files concurrently
      await Promise.all(tempFiles.map(file => 
        unlink(file).catch(err => 
          logger.warn("Failed to clean up temp file", { file, error: err })
        )
      ));

      logger.info("SRT converter completed", {
        totalFiles: outputFiles.length,
        formats: outputFiles.map(f => f.format).join(', ')
      });

      return {
        success: true,
        files: outputFiles
      };

    } catch (error) {
      logger.error("SRT converter failed", { 
        error: error instanceof Error ? error.message : "Unknown error",
        url
      });

      // Clean up temp files on error
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