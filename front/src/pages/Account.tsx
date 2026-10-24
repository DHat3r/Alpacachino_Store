import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { Aviso } from "../components/ui";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { fecha } from "../lib/format";

function detalle(err: unknown, porDefecto: string): string {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && typeof d[0]?.msg === "string") return d[0].msg;
  return porDefecto;
}

export default function Account() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState(user?.username ?? "");
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [mensaje, setMensaje] = useState("");

  const perfil = useMutation({
    mutationFn: async () => {
      const res = await api.patch("/auth/me", { username });
      return res.data;
    },
    onSuccess: (data) => {
      setUser(data);
      setMensaje("Nombre de usuario actualizado.");
    },
  });

  const clave = useMutation({
    mutationFn: async () => {
      await api.post("/auth/change-password", {
        current_password: actual,
        new_password: nueva,
      });
    },
    onSuccess: () => {
      setActual("");
      setNueva("");
      setMensaje("Contraseña actualizada.");
    },
  });

  const eliminar = useMutation({
    mutationFn: async () => {
      await api.delete("/auth/me");
    },
    onSuccess: () => {
      logout();
      navigate("/");
    },
  });

  return (
    <div className="contenedor max-w-3xl py-10">
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Mi cuenta</h1>
      <p className="mt-2 text-tinta-suave">
        {user?.email}
        {user?.created_at && <> · miembro desde {fecha(user.created_at)}</>}
      </p>

      {mensaje && (
        <div className="mt-6">
          <Aviso tono="ok">{mensaje}</Aviso>
        </div>
      )}

      <section className="panel mt-8 p-6">
        <h2 className="font-display text-xl font-extrabold">Nombre en el foro</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Es el nombre que ven las demás personas en tus publicaciones y reseñas.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setMensaje("");
            perfil.mutate();
          }}
        >
          <div className="min-w-56 flex-1">
            <label htmlFor="username" className="etiqueta-campo">
              Nombre de usuario
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={32}
              required
              className="campo"
            />
          </div>
          <button
            type="submit"
            disabled={perfil.isPending || username === user?.username}
            className="btn btn-primario"
          >
            {perfil.isPending ? "Guardando…" : "Guardar"}
          </button>
        </form>
        {perfil.isError && (
          <p className="mt-3 text-sm text-alerta">
            {detalle(perfil.error, "No pudimos actualizar tu nombre.")}
          </p>
        )}
      </section>

      <section className="panel mt-6 p-6">
        <h2 className="font-display text-xl font-extrabold">Contraseña</h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setMensaje("");
            clave.mutate();
          }}
        >
          <div>
            <label htmlFor="actual" className="etiqueta-campo">
              Contraseña actual
            </label>
            <input
              id="actual"
              type="password"
              autoComplete="current-password"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              required
              className="campo"
            />
          </div>
          <div>
            <label htmlFor="nueva" className="etiqueta-campo">
              Contraseña nueva
            </label>
            <input
              id="nueva"
              type="password"
              autoComplete="new-password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              minLength={8}
              required
              className="campo"
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={clave.isPending} className="btn btn-primario">
              {clave.isPending ? "Cambiando…" : "Cambiar contraseña"}
            </button>
          </div>
        </form>
        {clave.isError && (
          <p className="mt-3 text-sm text-alerta">
            {detalle(clave.error, "No pudimos cambiar la contraseña.")}
          </p>
        )}
      </section>

      <section className="panel mt-6 border-alerta/25 p-6">
        <h2 className="font-display text-xl font-extrabold">Eliminar cuenta</h2>
        <p className="mt-1 max-w-prose text-sm text-tinta-suave">
          Se borran tus datos personales y tus publicaciones quedan como anónimas. Los
          pedidos se conservan de forma anonimizada por obligaciones tributarias. Esta
          acción no se puede deshacer.
        </p>
        <button
          onClick={() => {
            if (confirm("¿Eliminar tu cuenta? Esta acción no se puede deshacer.")) {
              eliminar.mutate();
            }
          }}
          disabled={eliminar.isPending}
          className="btn btn-peligro mt-4"
        >
          {eliminar.isPending ? "Eliminando…" : "Eliminar mi cuenta"}
        </button>
        {eliminar.isError && (
          <p className="mt-3 text-sm text-alerta">
            {detalle(eliminar.error, "No pudimos eliminar la cuenta.")}
          </p>
        )}
      </section>
    </div>
  );
}
