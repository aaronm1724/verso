import { ImageResponse } from "next/og";

const ALLOWED_SIZES = new Set([192, 512]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
): Promise<Response> {
  const { size: rawSize } = await params;
  const size = Number(rawSize);
  if (!ALLOWED_SIZES.has(size)) {
    return new Response(null, { status: 404 });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          color: "#fafafa",
          fontSize: size * 0.62,
          fontWeight: 700,
        }}
      >
        V
      </div>
    ),
    { width: size, height: size },
  );
}
