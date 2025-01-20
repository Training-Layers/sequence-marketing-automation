import { task, logger } from "@trigger.dev/sdk/v3";
import { convertToMp3 } from "../utilities/audio_convert_mp3";
import { transcribeAudio } from "../utilities/audio_transcribe_deepgram";

export const processMedia = task({
  id: "process-media",
  run: async (payload: { url: string }) => {
    logger.info("Starting media processing task", { 
      url: payload.url,
      timestamp: new Date().toISOString()
    });

    // First convert to MP3 and upload to R2
    const conversionResult = await logger.trace("convert-to-mp3", async (span) => {
      span.setAttribute("input_url", payload.url);
      
      const result = await convertToMp3.triggerAndWait({
        url: payload.url
      });

      if (result.ok) {
        span.setAttribute("success", true);
        span.setAttribute("r2_key", result.output.r2Key || "");
      } else {
        span.setAttribute("success", false);
        span.setAttribute("error", String(result.error || "Unknown error"));
      }

      return result;
    });

    if (!conversionResult.ok) {
      logger.error("Media conversion failed", {
        error: conversionResult.error,
        url: payload.url
      });
      return {
        success: false,
        error: `Conversion failed: ${conversionResult.error}`,
        conversion: conversionResult,
      };
    }

    // Then transcribe using the R2 URL and save transcription to R2
    const transcriptionResult = await logger.trace("transcribe-audio", async (span) => {
      span.setAttribute("conversion_r2_key", conversionResult.output.r2Key || "");
      
      const result = await transcribeAudio.triggerAndWait({
        conversionResult: conversionResult.output
      });

      if (result.ok) {
        span.setAttribute("success", true);
        span.setAttribute("transcript_length", result.output.transcript?.length || 0);
      } else {
        span.setAttribute("success", false);
        span.setAttribute("error", String(result.error || "Unknown error"));
      }

      return result;
    });

    if (!transcriptionResult.ok) {
      logger.error("Transcription failed", {
        error: transcriptionResult.error,
        conversionR2Key: conversionResult.output.r2Key
      });
      return {
        success: false,
        error: `Transcription failed: ${transcriptionResult.error}`,
        conversion: conversionResult.output,
        transcription: transcriptionResult,
      };
    }

    const processingTime = Date.now() - parseInt(conversionResult.output.r2Key?.split("-")[1] || "0");
    logger.info("Media processing completed successfully", {
      url: payload.url,
      conversionR2Key: conversionResult.output.r2Key,
      transcriptionR2Key: transcriptionResult.output.r2Key,
      processingTime,
      transcriptLength: transcriptionResult.output.transcript?.length || 0
    });

    return {
      success: true,
      conversion: conversionResult.output,
      transcription: transcriptionResult.output,
    };
  },
}); 