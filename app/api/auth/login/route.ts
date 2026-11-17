import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, findUserByEmail, SESSION_COOKIE } from "../../../../lib/auth";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const input = loginSchema.parse(body);
    const user = findUserByEmail(input.email);
    if (!user) {
      return NextResponse.json({ error: "E-mail corporativo não encontrado." }, { status: 401 });
    }
    const response = NextResponse.json({ user: { name: user.name, email: user.email, role: user.role } });
    response.cookies.set(SESSION_COOKIE, createSession(user.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60,
      path: "/",
    });
    return response;
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "Preencha e-mail e senha." : "Não foi possível entrar." }, { status: 400 });
  }
}