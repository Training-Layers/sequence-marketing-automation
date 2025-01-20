import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_uknxuhiqcndxndulzpbz",
  build: {
    extensions: [
      {
        name: "ffmpeg",
        onBuildComplete: async (context) => {
          if (context.target === "dev") {
            return;
          }

          context.logger.debug("Adding latest FFmpeg git build");

          const instructions = [
            // Install dependencies
            "RUN apt-get update && apt-get install -y wget xz-utils",
            // Download and extract latest FFmpeg git build
            "RUN wget https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-amd64-static.tar.xz -O ffmpeg.tar.xz",
            "RUN tar xf ffmpeg.tar.xz",
            "RUN mv ffmpeg-git-*/ffmpeg /usr/local/bin/",
            "RUN mv ffmpeg-git-*/ffprobe /usr/local/bin/",
            "RUN chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe",
            // Cleanup
            "RUN rm -rf ffmpeg.tar.xz ffmpeg-git-*",
            "RUN apt-get clean && rm -rf /var/lib/apt/lists/*",
          ];

          context.addLayer({
            id: "ffmpeg",
            image: {
              instructions,
            },
            deploy: {
              env: {
                FFMPEG_PATH: "/usr/local/bin/ffmpeg",
                FFPROBE_PATH: "/usr/local/bin/ffprobe",
              },
              override: true,
            },
          });
        },
      },
    ],
  },
});
