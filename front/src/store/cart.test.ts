import { beforeEach, describe, expect, it } from "vitest";
import { useCart } from "./cart";
import { api } from "../api/client";

const item = {
  productId: "p-1",
  sku: "MANGA-001",
  title: "One Piece Vol. 1",
  price: 8990,
};

describe("carrito (Zustand)", () => {
  beforeEach(() => {
    useCart.setState({ items: [] });
    localStorage.clear();
  });

  it("agrega un producto con cantidad 1", () => {
    useCart.getState().add(item);
    expect(useCart.getState().items).toHaveLength(1);
    expect(useCart.getState().items[0].quantity).toBe(1);
  });

  it("incrementa la cantidad si el producto ya existe", () => {
    useCart.getState().add(item);
    useCart.getState().add(item);
    expect(useCart.getState().items).toHaveLength(1);
    expect(useCart.getState().items[0].quantity).toBe(2);
  });

  it("calcula total e ítems", () => {
    useCart.getState().add(item);
    useCart.getState().add(item);
    expect(useCart.getState().itemCount()).toBe(2);
    expect(useCart.getState().total()).toBe(17980);
  });

  it("nunca baja de 1 al fijar cantidad", () => {
    useCart.getState().add(item);
    useCart.getState().setQty(item.productId, 0);
    expect(useCart.getState().items[0].quantity).toBe(1);
  });

  it("elimina un producto", () => {
    useCart.getState().add(item);
    useCart.getState().remove(item.productId);
    expect(useCart.getState().items).toHaveLength(0);
    expect(useCart.getState().total()).toBe(0);
  });

  it("vacía el carrito", () => {
    useCart.getState().add(item);
    useCart.getState().add({ ...item, productId: "p-2", sku: "MANGA-002" });
    useCart.getState().clear();
    expect(useCart.getState().items).toEqual([]);
  });
});

describe("cliente HTTP", () => {
  it("usa el prefijo /api", () => {
    expect(api.defaults.baseURL).toBe("/api");
  });
});
