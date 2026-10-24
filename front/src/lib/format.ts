/** Formatos chilenos reutilizables (precio, fechas, plurales). */

export function clp(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0);
  return `$${(Number.isFinite(n) ? n : 0).toLocaleString("es-CL")}`;
}

export function fecha(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/** Cuánto falta para una fecha, en palabras ("2 días", "5 horas"). */
export function faltan(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const horas = Math.floor(ms / 3_600_000);
  if (horas >= 24) return plural(Math.floor(horas / 24), "día", "días");
  if (horas >= 1) return plural(horas, "hora", "horas");
  return plural(Math.max(1, Math.floor(ms / 60_000)), "minuto", "minutos");
}

/** "24 horas", "90 minutos": el plazo de reserva tal como lo informa la API. */
export function duracionReserva(minutos: number | null | undefined): string {
  const m = Number(minutos ?? 0);
  if (!Number.isFinite(m) || m <= 0) return "unos minutos";
  if (m % 60 === 0) return plural(m / 60, "hora", "horas");
  if (m > 90) return plural(Math.round(m / 60), "hora", "horas");
  return plural(Math.round(m), "minuto", "minutos");
}
