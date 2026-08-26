import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/spotify/oauth";
import { generateState, STATE_COOKIE_NAME } from "@/lib/spotify/state";

export async function GET() {
  const state = generateState();

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
    path: "/",
  });

  return NextResponse.redirect(buildAuthorizeUrl(state));
}
