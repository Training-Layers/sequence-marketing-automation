import { task, logger } from "@trigger.dev/sdk/v3";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import path from "path";
import os from "os";
import { writeFile, unlink } from "fs/promises";
import fetch from "node-fetch";

// Initialize S3 client for R2 (reusing the same config as other tasks)
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export type TTSInput = {
  text: string;
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  model?: "tts-1" | "tts-1-hd";
};

export type TTSOutput = {
  success: boolean;
  error?: string;
  r2Key?: string;
  r2Bucket?: string;
  publicUrl?: string;
};

export const audioTtsOpenaiCurl = task({
  id: "audio_tts_openai_curl",
  run: async (payload: TTSInput): Promise<TTSOutput> => {
    const { text, voice = "nova", model = "tts-1-hd" } = payload;
    let tempFile: string | undefined;

    try {
      logger.info("Starting text-to-speech task (direct fetch)", { 
        textLength: text.length,
        voice,
        model,
        timestamp: new Date().toISOString()
      });

      // Make direct API request
      const response = await logger.trace("openai-tts-request", async (span) => {
        span.setAttribute("model", model);
        span.setAttribute("voice", voice);
        span.setAttribute("text_length", text.length);

        const resp = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            input: text,
            voice,
          }),
        });

        if (!resp.ok) {
          throw new Error(`OpenAI API error: ${resp.status} ${resp.statusText}`);
        }

        return resp;
      });

      // Get the audio data as a buffer
      const audioBuffer = await logger.trace("process-audio-buffer", async (span) => {
        const buf = Buffer.from(await response.arrayBuffer());
        span.setAttribute("buffer_size", buf.length);
        return buf;
      });

      // Save to temporary file
      const outputFilename = `tts-${Date.now()}.mp3`;
      const outputPath = path.join(os.tmpdir(), outputFilename);
      tempFile = outputPath;
      
      await logger.trace("save-temp-file", async (span) => {
        span.setAttribute("file_path", outputPath);
        await writeFile(outputPath, audioBuffer);
        logger.info("Audio file saved temporarily", { 
          outputPath,
          sizeBytes: audioBuffer.length 
        });
      });

      // Upload to R2
      const r2Key = `tts-audio/${outputFilename}`;
      
      await logger.trace("upload-to-r2", async (span) => {
        span.setAttribute("r2_key", r2Key);
        span.setAttribute("file_size", audioBuffer.length);

        const upload = new Upload({
          client: s3Client,
          params: {
            Bucket: process.env.R2_BUCKET!,
            Key: r2Key,
            Body: audioBuffer,
            ContentType: "audio/mp3",
          },
        });

        await upload.done();
        logger.info("Audio file uploaded to R2", { 
          r2Key,
          sizeBytes: audioBuffer.length,
          bucket: process.env.R2_BUCKET 
        });
      });

      // Clean up the temporary file
      try {
        await unlink(outputPath);
        logger.info("Temporary file cleaned up", { outputPath });
      } catch (cleanupError) {
        logger.warn("Failed to clean up temporary file", { 
          outputPath,
          error: cleanupError instanceof Error ? cleanupError.message : "Unknown error" 
        });
      }

      // Construct the public URL
      const publicUrl = `${process.env.R2_PUBLIC_URL}/${r2Key}`;
      logger.info("Task completed successfully", {
        r2Key,
        publicUrl,
        processingTime: Date.now() - parseInt(outputFilename.split("-")[1]),
      });

      return {
        success: true,
        r2Key,
        r2Bucket: process.env.R2_BUCKET,
        publicUrl,
      };
    } catch (error) {
      logger.error("Text-to-speech conversion failed", { 
        error: error instanceof Error ? error.message : "Unknown error",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        textLength: text.length,
        voice,
        model
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