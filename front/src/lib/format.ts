/** Formatos chilenos reutilizables (precio y plurales). */

export function clp(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0);
  return `$${(Number.isFinite(n) ? n : 0).toLocaleString("es-CL")}`;
}

export function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}
