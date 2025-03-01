"use server";
import { api } from "@/convex/_generated/api";
import { FeatureFlag, featureFlagEvents } from "@/features/flags";
import { client } from "@/lib/schematic";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { Innertube } from "youtubei.js";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export interface TranscriptEntry {
  text: string;
  timestamp: string;
}

const youtube = await Innertube.create({
  lang: "en",
  location: "US",
  retrieve_player: false,
});

function formatTimestamp(start_ms: number): string {
  const minutes = Math.floor(start_ms / 60000);
  const seconds = Math.floor((start_ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

async function fetchTranscript(videoId: string): Promise<TranscriptEntry[]> {
  try {
    const info = await youtube.getInfo(videoId);
    const transcriptData = await info.getTranscript();
    const transcript: TranscriptEntry[] =
      transcriptData.transcript.content?.body?.initial_segments.map(
        (segment) => ({
          text: segment.snippet.text ?? "N/A",
          timestamp: formatTimestamp(Number(segment.start_ms)),
        })
      ) ?? [];

    return transcript;
  } catch (error) {
    console.error("Error fetching transcript:", error);
    throw error;
  }
}

export async function getYoutubeTranscript(videoId: string) {
  console.log("🎬 Starting YouTube transcript fetch for video:", videoId);
  const user = await currentUser();

  if (!user?.id) {
    console.log("❌ Authentication error: No user found");
    throw new Error("User not found");
  }
  console.log("👤 User authenticated:", user.id);

  // Check if transcript is already in database
  console.log("🔍 Checking database for existing transcript...");
  const existingTranscript = await convex.query(
    api.transcript.getTranscriptByVideoId,
    { videoId, userId: user.id }
  );

  if (existingTranscript) {
    console.log("✅ Found existing transcript in database");
    return {
      cache:
        "This video has already been transcribed - Accessing cached transcript instead of using a token",
      transcript: existingTranscript.transcript,
    };
  }

  try {
    console.log("🔄 No existing transcript found, fetching from YouTube...");
    const transcript = await fetchTranscript(videoId);
    console.log("📝 Successfully fetched transcript from YouTube");

    console.log("💾 Storing transcript in database...");
    await convex.mutation(api.transcript.storeTranscript, {
      videoId,
      userId: user.id,
      transcript,
    });
    console.log("✅ Transcript stored in database");

    console.log("📊 Tracking transcription event...");
    await client.track({
      event: featureFlagEvents[FeatureFlag.TRANSCRIPTION].event,
      company: {
        id: user.id,
      },
      user: {
        id: user.id,
      },
    });

    return {
      transcript,
      cache:
        "This video was transcribed using a token, the transcript is now saved in the database",
    };
  } catch (error) {
    console.error("❌ Error in transcript process:", error);
    return {
      transcript: [],
      cache: "Error fetching transcript, please try again later",
    };
  }
}
