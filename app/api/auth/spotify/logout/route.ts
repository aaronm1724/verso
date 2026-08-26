import { NextResponse } from "next/server";
import { resolveRequestOrigin } from "@/lib/http";
import { clearSpotifySession } from "@/lib/spotify/session";

export async function POST(request: Request): Promise<NextResponse> {
  await clearSpotifySession();
  return NextResponse.redirect(new URL("/", resolveRequestOrigin(request)));
}
