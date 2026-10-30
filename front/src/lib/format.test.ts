import { describe, expect, it } from "vitest";
import { clp, plural } from "./format";

describe("clp", () => {
  it("formatea pesos chilenos con separador de miles", () => {
    expect(clp(12990)).toBe("$12.990");
  });

  it("acepta el precio como texto, tal como llega de la API", () => {
    expect(clp("5000")).toBe("$5.000");
  });

  it("devuelve $0 si no hay precio o no es un número", () => {
    expect(clp(null)).toBe("$0");
    expect(clp("abc")).toBe("$0");
  });
});

describe("plural", () => {
  it("usa el singular solo para 1", () => {
    expect(plural(1, "título", "títulos")).toBe("1 título");
    expect(plural(0, "título", "títulos")).toBe("0 títulos");
    expect(plural(192, "título", "títulos")).toBe("192 títulos");
  });
});
