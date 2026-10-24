import { useEffect, useState } from "react";

type Health = { status: string; env: string };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Health>;
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main className="wrap">
      <h1>🦙 AlpacachinoStore</h1>
      <p className="sub">Base del frontend en React + Vite sobre Docker.</p>

      <section className="card">
        <h2>Estado del entorno</h2>
        {health && (
          <p className="ok">
            API conectada ✅ — <code>{health.status}</code> ({health.env})
          </p>
        )}
        {error && <p className="error">Sin conexión con la API: {error}</p>}
        {!health && !error && <p className="pending">Consultando la API…</p>}
        <ul>
          <li>Frontend: http://localhost:5173</li>
          <li>API + Swagger: http://localhost:8001/docs</li>
          <li>Adminer (BD): http://localhost:8081</li>
          <li>MailHog: http://localhost:8025</li>
        </ul>
      </section>
    </main>
  );
}
