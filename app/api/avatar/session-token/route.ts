import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SpatialReal console hosts per region.
const HOSTS: Record<string, string> = {
  "us-west": "https://console.us-west.spatialwalk.cloud",
  "ap-northeast": "https://console.ap-northeast.spatialwalk.cloud",
};

export async function POST(_req: NextRequest) {
  const apiKey = process.env.SPATIALREAL_API_KEY;
  const region = process.env.SPATIALREAL_REGION || "us-west";
  const host = HOSTS[region] ?? HOSTS["us-west"];
  if (!apiKey) {
    return NextResponse.json(
      { error: "SPATIALREAL_API_KEY not configured" },
      { status: 500 }
    );
  }
  // 30-min session token — well below the 24h hard cap, fresh per click.
  const expireAt = Math.floor(Date.now() / 1000) + 30 * 60;
  try {
    const r = await fetch(`${host}/v1/console/session-tokens`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expireAt, modelVersion: "" }),
    });
    const text = await r.text();
    if (!r.ok) {
      return NextResponse.json(
        { error: `SpatialReal ${r.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: `non-JSON from SpatialReal: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }
    const sessionToken = data?.sessionToken ?? data?.session_token ?? data?.token;
    if (!sessionToken) {
      return NextResponse.json(
        { error: "no sessionToken in SpatialReal response" },
        { status: 502 }
      );
    }
    return NextResponse.json({
      sessionToken,
      expireAt,
      region,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "failed to mint session token" },
      { status: 502 }
    );
  }
}
