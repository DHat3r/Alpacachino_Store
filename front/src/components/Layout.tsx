import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import Alpaca from "./Alpaca";
import { useAuth } from "../store/auth";
import { useCart } from "../store/cart";
import { useConfig } from "../api/config";

const NAVEGACION = [
  { a: "/catalogo", texto: "Catálogo" },
  { a: "/foro", texto: "Foro" },
];

function claseNav({ isActive }: { isActive: boolean }) {
  return `rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
    isActive ? "bg-morado text-white" : "text-tinta hover:bg-morado-tenue"
  }`;
}

export default function Layout() {
  const { user, logout, isAuthenticated } = useAuth();
  const cantidad = useCart((s) => s.itemCount());
  const { data: config } = useConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  const cuentaRef = useRef<HTMLDivElement>(null);

  // Cierra los menús al cambiar de página.
  useEffect(() => {
    setMenuAbierto(false);
    setCuentaAbierta(false);
  }, [location.pathname]);

  // Cierra el menú de cuenta al hacer clic fuera.
  useEffect(() => {
    if (!cuentaAbierta) return;
    const fuera = (e: MouseEvent) => {
      if (!cuentaRef.current?.contains(e.target as Node)) setCuentaAbierta(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [cuentaAbierta]);

  const salir = () => {
    logout();
    navigate("/");
  };

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
            <Alpaca className="h-9 w-9 text-morado" />
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
            {user?.role === "admin" && (
              <NavLink to="/admin" className={claseNav}>
                Administración
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              to="/carrito"
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-tinta transition-colors hover:bg-morado-tenue"
            >
              Carrito
              {cantidad > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-morado px-1 text-[11px] font-bold text-white">
                  {cantidad}
                </span>
              )}
            </Link>

            {isAuthenticated() ? (
              <div className="relative" ref={cuentaRef}>
                <button
                  onClick={() => setCuentaAbierta((v) => !v)}
                  aria-expanded={cuentaAbierta}
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold transition-colors hover:bg-morado-tenue"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-morado text-xs font-bold text-white">
                    {user?.username?.[0]?.toUpperCase() ?? "?"}
                  </span>
                  <span className="hidden sm:inline">{user?.username}</span>
                </button>
                {cuentaAbierta && (
                  <div className="panel absolute right-0 mt-2 w-52 overflow-hidden p-1.5">
                    <Link
                      to="/mis-pedidos"
                      className="block rounded-lg px-3 py-2 text-sm hover:bg-papel"
                    >
                      Mis pedidos
                    </Link>
                    <Link
                      to="/cuenta"
                      className="block rounded-lg px-3 py-2 text-sm hover:bg-papel"
                    >
                      Mi cuenta
                    </Link>
                    <button
                      onClick={salir}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm text-alerta hover:bg-alerta-tenue"
                    >
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/login" className="btn btn-primario hidden sm:inline-flex">
                Entrar
              </Link>
            )}

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
              {user?.role === "admin" && (
                <NavLink to="/admin" className={claseNav}>
                  Administración
                </NavLink>
              )}
              {!isAuthenticated() && (
                <Link to="/login" className="btn btn-primario mt-2">
                  Entrar
                </Link>
              )}
            </div>
          </nav>
        )}
      </header>

      <main id="contenido" className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-20 bg-tinta text-nube">
        <div className="contenedor grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Alpaca className="h-9 w-9 text-lila" />
              <span className="font-display text-lg font-extrabold">Alpacachino</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-nube/70">
              Manga, cómics y una comunidad que lee junta. Despachamos a todo Chile.
            </p>
          </div>

          <div>
            <h2 className="font-display text-base font-extrabold text-lila">
              Tienda
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-nube/80">
              <li>
                <Link to="/catalogo" className="hover:text-white">
                  Catálogo
                </Link>
              </li>
              <li>
                <Link to="/carrito" className="hover:text-white">
                  Carrito
                </Link>
              </li>
              <li>
                <Link to="/mis-pedidos" className="hover:text-white">
                  Mis pedidos
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-base font-extrabold text-lila">
              Comunidad
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-nube/80">
              <li>
                <Link to="/foro" className="hover:text-white">
                  Foro
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-white">
                  Crear cuenta
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-base font-extrabold text-lila">
              Ayuda
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-nube/80">
              <li>
                <Link to="/terminos" className="hover:text-white">
                  Términos y compras
                </Link>
              </li>
              <li>
                <Link to="/privacidad" className="hover:text-white">
                  Privacidad
                </Link>
              </li>
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
          <div className="contenedor flex flex-wrap items-center justify-between gap-2 py-5 text-xs text-nube/60">
            <p>© {new Date().getFullYear()} AlpacachinoStore</p>
            <p>Precios en pesos chilenos, impuestos incluidos.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
