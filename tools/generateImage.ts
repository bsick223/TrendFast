import { dalleImageGeneration } from "@/actions/dalleImageGeneration";
import { FeatureFlag } from "@/features/flags";
import { getConvexClient } from "@/lib/convex";
import { client } from "@/lib/schematic";
import { tool } from "ai";
import { z } from "zod";

export const generateImage = (videoId: string, userId: string) =>
  tool({
    description: "Generate an image",
    parameters: z.object({
      prompt: z.string().describe("The prompt to generate an image for"),
      videoId: z.string().describe("The YouTube video ID"),
    }),
    execute: async ({ prompt }) => {
      const schematicCtx = {
        company: { id: userId },
        user: {
          id: userId,
        },
      };

      // example of gating (can use for limiting as well) for route.ts
      const isImageGenerationEnabled = await client.checkFlag(
        schematicCtx,
        FeatureFlag.IMAGE_GENERATION
      );

      if (!isImageGenerationEnabled) {
        return {
          error: "Image generation is not enabled, the user must upgrade",
        };
      }

      const image = await dalleImageGeneration(prompt, videoId);
      return { image };
    },
  });
