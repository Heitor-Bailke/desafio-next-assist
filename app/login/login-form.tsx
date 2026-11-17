"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const demoUsers = ["ana.silva@nexo.com", "bruno.costa@nexo.com", "marina.alves@nexo.com"];

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState(demoUsers[0]);
  const [password, setPassword] = useState("nexo");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoading(true); setError(null);
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const data: { error?: string; user?: { role: string } } = await response.json();
    if (!response.ok) { setError(data.error ?? "Não foi possível entrar."); setLoading(false); return; }
    router.push(data.user?.role === "analyst" ? "/analyst" : "/chat");
  };

  return <main className="login-page"><section className="login-intro"><div className="brand"><span className="brand-mark">N</span> Nexo Assist</div><div><p className="eyebrow" style={{ color: "var(--mint)" }}>service desk · 24h críticos</p><h1>Seu trabalho não precisa parar aqui.</h1><p>Descreva o que aconteceu. Eu consulto seus chamados, encontro respostas e aciono uma pessoa quando for o melhor caminho.</p></div><p className="login-note">Atendimento interno para colaboradores Nexo</p></section><section className="login-panel"><div className="login-card"><span className="eyebrow">Acesso corporativo</span><h2>Bem-vindo de volta</h2><p className="muted">Entre com seu e-mail Nexo para continuar.</p><form onSubmit={submit}><div className="field"><label htmlFor="email">E-mail corporativo</label><input id="email" className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className="field"><label htmlFor="password">Senha</label><input id="password" className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>{error && <div className="error-box">{error}</div>}<button className="btn btn-primary" disabled={loading}>{loading ? "Entrando..." : "Entrar no Nexo Assist"}</button></form><div className="demo-users"><span className="muted">Usuários de demonstração</span>{demoUsers.map((demo) => <button key={demo} type="button" onClick={() => setEmail(demo)}>{demo}</button>)}</div></div></section></main>;
}
