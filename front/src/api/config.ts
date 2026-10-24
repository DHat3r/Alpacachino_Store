import { useQuery } from "@tanstack/react-query";

import { api } from "./client";

export interface PaymentInstructions {
  provider: string;
  bank: string;
  account_type: string;
  account_number: string;
  holder: string;
  rut: string;
  email: string;
  deadline_hours: number;
  note: string;
}

export interface PublicConfig {
  currency: string;
  shipping_cost: number;
  free_shipping_from: number;
  reservation_minutes: number;
  payment_provider: string;
  terms_version: string;
  seller: { name: string; email: string; phone: string };
  payment_instructions: PaymentInstructions | null;
}

/** Configuración del negocio servida por el backend (evita valores fijos). */
export function useConfig() {
  return useQuery({
    queryKey: ["public-config"],
    queryFn: async () => {
      const res = await api.get("/config");
      return res.data as PublicConfig;
    },
    staleTime: 1000 * 60 * 60,
  });
}
