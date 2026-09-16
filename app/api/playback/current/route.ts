import { getCurrentPlayback } from "@/lib/spotify/playback";

export async function GET(): Promise<Response> {
  const result = await getCurrentPlayback();
  return Response.json(result);
}
