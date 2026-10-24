import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  productId: string;
  sku: string;
  title: string;
  price: number;
  quantity: number;
  coverUrl?: string;
}

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity">) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
  total: () => number;
  itemCount: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((s) => {
          const found = s.items.find((i) => i.productId === item.productId);
          return found
            ? {
                items: s.items.map((i) =>
                  i.productId === item.productId
                    ? { ...i, quantity: i.quantity + 1 }
                    : i
                ),
              }
            : { items: [...s.items, { ...item, quantity: 1 }] };
        }),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.productId !== id) })),
      setQty: (id, qty) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.productId === id ? { ...i, quantity: Math.max(1, qty) } : i
          ),
        })),
      clear: () => set({ items: [] }),
      total: () => get().items.reduce((acc, i) => acc + i.price * i.quantity, 0),
      itemCount: () => get().items.reduce((acc, i) => acc + i.quantity, 0),
    }),
    { name: "alpacachino-cart" }
  )
);