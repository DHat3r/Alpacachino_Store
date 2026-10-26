import { useCallback, useEffect, useState } from "react";

export type Tema = "claro" | "oscuro";

const CLAVE = "alpacachino-tema";

/** Lo que el usuario eligió a mano, si es que eligió algo. */
export function temaGuardado(): Tema | null {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === "claro" || v === "oscuro" ? v : null;
  } catch {
    return null;
  }
}

function temaDelSistema(): Tema {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "oscuro"
    : "claro";
}

/**
 * Tema actual y cómo cambiarlo. Sin elección guardada seguimos al sistema;
 * al elegir, queda fijo en este navegador (atributo `data-tema` en <html>).
 */
export function useTema() {
  const [tema, setEstado] = useState<Tema>(() => temaGuardado() ?? temaDelSistema());

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const alCambiar = () => {
      if (!temaGuardado()) setEstado(mq.matches ? "oscuro" : "claro");
    };
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  const cambiarTema = useCallback((siguiente: Tema) => {
    document.documentElement.dataset.tema = siguiente;
    try {
      localStorage.setItem(CLAVE, siguiente);
    } catch {
      // Navegación privada o almacenamiento bloqueado: el tema dura la sesión.
    }
    setEstado(siguiente);
  }, []);

  return { tema, cambiarTema };
}
