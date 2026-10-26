import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Alpaca from "../components/Alpaca";
import { Aviso } from "../components/ui";
import { api } from "../api/client";
import { useAuth } from "../store/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setTokens, setUser } = useAuth();
  const navigate = useNavigate();

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post(
        "/auth/login",
        new URLSearchParams({ username: email, password }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );
      const { access_token, refresh_token } = res.data;
      setTokens(access_token, refresh_token);
      const me = await api.get("/auth/me");
      setUser(me.data);
      navigate("/");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data
        ?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "No pudimos iniciar sesión. Revisa tu correo y contraseña.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="contenedor max-w-md py-16">
      <div className="text-center">
        <Alpaca className="mx-auto h-14 w-14 text-morado-texto" />
        <h1 className="mt-4 font-display text-3xl font-extrabold">Entrar</h1>
        <p className="mt-2 text-tinta-suave">
          Para comprar, seguir tus pedidos y participar en el foro.
        </p>
      </div>

      <form className="panel mt-8 space-y-4 p-6" onSubmit={enviar}>
        {error && <Aviso tono="error">{error}</Aviso>}

        <div>
          <label htmlFor="email" className="etiqueta-campo">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="campo"
            placeholder="tu@correo.cl"
          />
        </div>

        <div>
          <label htmlFor="password" className="etiqueta-campo">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="campo"
          />
        </div>

        <button type="submit" disabled={loading} className="btn btn-primario w-full">
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-tinta-suave">
        ¿Primera vez acá?{" "}
        <Link to="/register" className="enlace">
          Crea tu cuenta
        </Link>
      </p>
    </div>
  );
}
