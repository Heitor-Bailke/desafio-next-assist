import { NextResponse } from "next/server";
import { getUserFromRequest } from "../../../../lib/auth";

export function GET(request: Request): NextResponse {
  const user = getUserFromRequest(request);
  return user ? NextResponse.json({ user }) : NextResponse.json({ error: "Não autenticado." }, { status: 401 });
}