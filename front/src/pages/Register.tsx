import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Alpaca from "../components/Alpaca";
import { Aviso } from "../components/ui";
import { api } from "../api/client";
import { useAuth } from "../store/auth";

export default function Register() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [terminos, setTerminos] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setTokens, setUser } = useAuth();
  const navigate = useNavigate();

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmacion) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/register", {
        email,
        username,
        password,
        accept_terms: terminos,
      });
      const loginRes = await api.post(
        "/auth/login",
        new URLSearchParams({ username: email, password }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );
      const { access_token, refresh_token } = loginRes.data;
      setTokens(access_token, refresh_token);
      const me = await api.get("/auth/me");
      setUser(me.data);
      navigate("/");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data
        ?.detail;
      setError(
        typeof detail === "string" ? detail : "No pudimos crear la cuenta. Revisa los datos.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="contenedor max-w-md py-16">
      <div className="text-center">
        <Alpaca className="mx-auto h-14 w-14 text-morado-texto" />
        <h1 className="mt-4 font-display text-3xl font-extrabold">Crear cuenta</h1>
        <p className="mt-2 text-tinta-suave">
          Con una cuenta compras, sigues tus pedidos y publicas en el foro.
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
          <label htmlFor="username" className="etiqueta-campo">
            Nombre en el foro
          </label>
          <input
            id="username"
            required
            minLength={3}
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="campo"
            placeholder="alpaquita_lectora"
          />
        </div>

        <div>
          <label htmlFor="password" className="etiqueta-campo">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="campo"
          />
          <p className="mt-1 text-xs text-tinta-suave">Al menos 8 caracteres.</p>
        </div>

        <div>
          <label htmlFor="confirmacion" className="etiqueta-campo">
            Repite la contraseña
          </label>
          <input
            id="confirmacion"
            type="password"
            autoComplete="new-password"
            required
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            className="campo"
          />
        </div>

        <label className="flex items-start gap-2.5 text-sm text-tinta-suave">
          <input
            type="checkbox"
            checked={terminos}
            onChange={(e) => setTerminos(e.target.checked)}
            required
            className="mt-0.5 h-4 w-4 rounded border-humo accent-morado"
          />
          <span>
            Acepto los{" "}
            <Link to="/terminos" className="enlace">
              términos de compra
            </Link>{" "}
            y la{" "}
            <Link to="/privacidad" className="enlace">
              política de privacidad
            </Link>
            .
          </span>
        </label>

        <button type="submit" disabled={loading} className="btn btn-primario w-full">
          {loading ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-tinta-suave">
        ¿Ya tienes cuenta?{" "}
        <Link to="/login" className="enlace">
          Entra acá
        </Link>
      </p>
    </div>
  );
}
