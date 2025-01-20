/**
 * Task Registry
 * 
 * A simple registry of all available tasks in the system.
 * Each entry contains the essential information needed to understand and use the task.
 * 
 * THIS FILE IS AUTO-GENERATED. DO NOT EDIT DIRECTLY.
 * Edit the corresponding .task.json files in the task-registry directory instead.
 */

export const tasks = {
  "media_audio_extract": {
    "name": "Media Audio Extract",
    "taskFile": "src/trigger/media_audio_extract.ts",
    "description": "Extracts audio tracks from media files into multiple formats (WAV, MP3, AAC) with configurable quality settings",
    "input": {
      "required": {
        "url": {
          "type": "string",
          "description": "URL of the media file to extract audio from"
        }
      },
      "optional": {
        "trampData": {
          "type": "record",
          "description": "Arbitrary data to pass through the task unchanged",
          "items": "any"
        },
        "output": {
          "type": "object",
          "description": "Output format configuration",
          "properties": {
            "formats": {
              "type": "array",
              "items": "enum",
              "values": [
                "wav",
                "mp3",
                "aac"
              ],
              "description": "List of audio formats to extract (defaults to ['aac'])"
            },
            "preferredFormat": {
              "type": "enum",
              "values": [
                "wav",
                "mp3",
                "aac"
              ],
              "description": "Preferred format when source format doesn't match any requested formats (defaults to 'aac')"
            },
            "allowStreamCopy": {
              "type": "boolean",
              "description": "Whether to allow stream copying when source format matches target (defaults to true)"
            }
          }
        },
        "ffmpeg": {
          "type": "object",
          "description": "FFmpeg processing configuration",
          "properties": {
            "timeout": {
              "type": "number",
              "description": "Processing timeout in milliseconds (defaults to 1 hour, max 2 hours)"
            },
            "extraFFmpegArgs": {
              "type": "array",
              "items": "string",
              "description": "Additional FFmpeg command arguments"
            },
            "quality": {
              "type": "object",
              "description": "Quality settings for each format",
              "properties": {
                "mp3Bitrate": {
                  "type": "number",
                  "description": "MP3 bitrate in kbps (64-320, defaults to 256)"
                },
                "aacBitrate": {
                  "type": "number",
                  "description": "AAC bitrate in kbps (64-256, defaults to 128)"
                },
                "wavSampleRate": {
                  "type": "number",
                  "description": "WAV sample rate in Hz (44100, 48000, or 96000, defaults to 44100)"
                }
              }
            }
          }
        },
        "storage": {
          "type": "object",
          "description": "R2 storage configuration",
          "properties": {
            "customR2Bucket": {
              "type": "string",
              "description": "Custom R2 bucket name"
            },
            "customR2Key": {
              "type": "string",
              "description": "Custom storage key"
            },
            "skipR2Upload": {
              "type": "boolean",
              "description": "Skip uploading to R2"
            },
            "contentType": {
              "type": "string",
              "description": "Custom content type"
            }
          }
        },
        "cleanup": {
          "type": "object",
          "description": "Cleanup configuration",
          "properties": {
            "cleanupStrategy": {
              "type": "enum",
              "values": [
                "immediate",
                "delayed",
                "none"
              ],
              "description": "When to clean up temporary files"
            },
            "tempFilePrefix": {
              "type": "string",
              "description": "Prefix for temporary files"
            }
          }
        }
      }
    },
    "output": {
      "job": {
        "type": "object",
        "description": "Information about the task execution",
        "properties": {
          "success": {
            "type": "boolean",
            "description": "Whether the operation succeeded"
          },
          "taskName": {
            "type": "string",
            "description": "Name of the executed task"
          },
          "runId": {
            "type": "string",
            "description": "Trigger.dev run identifier"
          },
          "input": {
            "type": "object",
            "description": "Original input parameters (excluding trampData)"
          },
          "error": {
            "type": "string",
            "optional": true,
            "description": "Error message if task failed"
          }
        }
      },
      "results": {
        "type": "object",
        "description": "Task results",
        "properties": {
          "files": {
            "type": "array",
            "description": "List of extracted audio files",
            "items": {
              "type": "object",
              "properties": {
                "format": {
                  "type": "string",
                  "description": "Audio format (wav, mp3, aac)"
                },
                "container": {
                  "type": "string",
                  "description": "Container format (wav, mp3, m4a)"
                },
                "outputFilename": {
                  "type": "string",
                  "description": "Name of the output file"
                },
                "duration": {
                  "type": "number",
                  "description": "Duration in seconds"
                },
                "r2Key": {
                  "type": "string",
                  "optional": true,
                  "description": "Storage key in R2 (if uploaded)"
                },
                "r2Bucket": {
                  "type": "string",
                  "optional": true,
                  "description": "R2 bucket name (if uploaded)"
                },
                "publicUrl": {
                  "type": "string",
                  "optional": true,
                  "description": "Public URL of the file (if uploaded)"
                },
                "size": {
                  "type": "number",
                  "description": "File size in bytes"
                }
              }
            }
          }
        }
      },
      "metadata": {
        "type": "object",
        "description": "Information about the source audio and processing",
        "properties": {
          "sourceFormat": {
            "type": "string",
            "description": "Original audio format"
          },
          "sourceBitrate": {
            "type": "number",
            "optional": true,
            "description": "Original audio bitrate"
          },
          "sourceChannels": {
            "type": "number",
            "description": "Number of audio channels"
          },
          "sourceSampleRate": {
            "type": "number",
            "description": "Original sample rate"
          },
          "conversionStrategy": {
            "type": "string",
            "description": "Strategy used for conversion"
          },
          "probeData": {
            "type": "object",
            "optional": true,
            "description": "Full FFprobe metadata"
          }
        }
      },
      "trampData": {
        "type": "record",
        "description": "The same arbitrary data that was passed in, returned unchanged",
        "items": "any",
        "optional": true
      }
    }
  },
  "video_strip_audio": {
    "name": "Video Strip Audio",
    "taskFile": "src/trigger/video_strip_audios.ts",
    "description": "Removes audio track from video while preserving video quality",
    "input": {
      "required": {
        "url": {
          "type": "string",
          "description": "URL of the video to process"
        }
      },
      "optional": {
        "trampData": {
          "type": "record",
          "description": "Arbitrary data to pass through the task unchanged",
          "items": "any"
        },
        "ffmpeg": {
          "type": "object",
          "description": "FFmpeg processing options",
          "properties": {
            "hwaccel": {
              "type": "enum",
              "values": [
                "auto",
                "none",
                "cuda",
                "vaapi"
              ],
              "description": "Hardware acceleration mode"
            },
            "codecCopy": {
              "type": "boolean",
              "description": "Whether to copy video codec without re-encoding"
            },
            "timeout": {
              "type": "number",
              "description": "Processing timeout in milliseconds"
            },
            "extraFFmpegArgs": {
              "type": "array",
              "items": "string",
              "description": "Additional FFmpeg command arguments"
            }
          }
        },
        "output": {
          "type": "object",
          "description": "Output format options",
          "properties": {
            "format": {
              "type": "enum",
              "values": [
                "mp4",
                "webm",
                "same"
              ],
              "description": "Output container format"
            },
            "fastStart": {
              "type": "boolean",
              "description": "Optimize MP4 for web playback"
            }
          }
        },
        "storage": {
          "type": "object",
          "description": "Storage options",
          "properties": {
            "customR2Bucket": {
              "type": "string",
              "description": "Custom R2 bucket name"
            },
            "customR2Key": {
              "type": "string",
              "description": "Custom storage key"
            },
            "skipR2Upload": {
              "type": "boolean",
              "description": "Skip uploading to R2"
            },
            "contentType": {
              "type": "string",
              "description": "Custom content type"
            }
          }
        },
        "cleanup": {
          "type": "object",
          "description": "Cleanup options",
          "properties": {
            "cleanupStrategy": {
              "type": "enum",
              "values": [
                "immediate",
                "delayed",
                "none"
              ],
              "description": "Cleanup strategy for temporary files"
            },
            "tempFilePrefix": {
              "type": "string",
              "description": "Prefix for temporary files"
            }
          }
        }
      }
    },
    "output": {
      "job": {
        "type": "object",
        "description": "Information about the task execution",
        "properties": {
          "success": {
            "type": "boolean",
            "description": "Whether the operation succeeded"
          },
          "taskName": {
            "type": "string",
            "description": "Name of the executed task"
          },
          "runId": {
            "type": "string",
            "description": "Trigger.dev run identifier"
          },
          "input": {
            "type": "object",
            "description": "Original input parameters (excluding trampData)"
          },
          "error": {
            "type": "string",
            "optional": true,
            "description": "Error message if task failed"
          }
        }
      },
      "results": {
        "type": "object",
        "description": "Essential output data",
        "properties": {
          "outputFilename": {
            "type": "string",
            "description": "Name of the processed file"
          },
          "r2Key": {
            "type": "string",
            "optional": true,
            "description": "Storage key in R2 (if uploaded)"
          },
          "r2Bucket": {
            "type": "string",
            "optional": true,
            "description": "R2 bucket name (if uploaded)"
          },
          "publicUrl": {
            "type": "string",
            "optional": true,
            "description": "Public URL of the file (if uploaded)"
          }
        }
      },
      "metadata": {
        "type": "object",
        "description": "Additional processing information",
        "properties": {
          "strategy": {
            "type": "string",
            "description": "Processing strategy used"
          },
          "videoCodec": {
            "type": "string",
            "description": "Codec of the video stream"
          },
          "containerFormat": {
            "type": "string",
            "description": "Output container format"
          },
          "needsTranscode": {
            "type": "boolean",
            "description": "Whether transcoding was required"
          },
          "probeData": {
            "type": "object",
            "optional": true,
            "description": "FFprobe metadata about the video"
          }
        }
      },
      "trampData": {
        "type": "record",
        "description": "The same arbitrary data that was passed in, returned unchanged at the top level",
        "items": "any",
        "optional": true
      }
    }
  }
} as const;

export type TaskRegistry = typeof tasks;
export type TaskName = keyof TaskRegistry;
