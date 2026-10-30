import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import Alpaca from "./Alpaca";
import { useConfig } from "../api/config";
import { useTema } from "../lib/tema";

const NAVEGACION = [
  { a: "/catalogo", texto: "Catálogo" },
];

function claseNav({ isActive }: { isActive: boolean }) {
  return `rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
    isActive ? "bg-morado text-white" : "text-tinta hover:bg-morado-tenue"
  }`;
}

export default function Layout() {
  const { data: config } = useConfig();
  const { tema, cambiarTema } = useTema();
  const location = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Cierra el menú al cambiar de página.
  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-morado focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-40 border-b-[3px] border-morado bg-papel/95 backdrop-blur">
        <div className="contenedor flex h-16 items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <Alpaca sombrero className="h-9 w-9 text-morado-texto" />
            <span className="font-display text-xl font-extrabold leading-none">
              Alpacachino
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAVEGACION.map((i) => (
              <NavLink key={i.a} to={i.a} className={claseNav}>
                {i.texto}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => cambiarTema(tema === "oscuro" ? "claro" : "oscuro")}
              className="rounded-full p-2 text-tinta-suave transition-colors hover:bg-morado-tenue hover:text-morado-texto"
              aria-label={tema === "oscuro" ? "Usar tema claro" : "Usar tema oscuro"}
              title={tema === "oscuro" ? "Tema claro" : "Tema oscuro"}
            >
              {tema === "oscuro" ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                  <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
                </svg>
              )}
            </button>

            <button
              onClick={() => setMenuAbierto((v) => !v)}
              aria-expanded={menuAbierto}
              aria-label="Abrir menú"
              className="rounded-full p-2 hover:bg-morado-tenue md:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {menuAbierto && (
          <nav className="border-t border-papel-hondo bg-papel px-4 py-3 md:hidden">
            <div className="contenedor flex flex-col gap-1">
              {NAVEGACION.map((i) => (
                <NavLink key={i.a} to={i.a} className={claseNav}>
                  {i.texto}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main id="contenido" className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-20 border-t border-humo bg-nocturno text-nocturno-texto">
        <div className="contenedor grid gap-10 py-14 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <Alpaca sombrero className="h-9 w-9 text-lila" />
              <span className="font-display text-lg font-extrabold">Alpacachino</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-nocturno-texto/70">
              Manga, cómics y novelas gráficas con stock real.
            </p>
          </div>

          <div>
            <h2 className="font-display text-base font-extrabold text-lila">
              Tienda
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-nocturno-texto/80">
              <li>
                <Link to="/catalogo" className="hover:text-white">
                  Catálogo
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-base font-extrabold text-lila">
              Ayuda
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-nocturno-texto/80">
              {config?.seller?.email && (
                <li>
                  <a href={`mailto:${config.seller.email}`} className="hover:text-white">
                    {config.seller.email}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="contenedor flex flex-wrap items-center justify-between gap-2 py-5 text-xs text-nocturno-texto/60">
            <p>© {new Date().getFullYear()} AlpacachinoStore</p>
            <p>Precios en pesos chilenos, impuestos incluidos.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
