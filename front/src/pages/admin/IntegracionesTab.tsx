import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import { Aviso, Cargando, ErrorCarga } from "../../components/ui";
import { mensajeError } from "./comun";

/* ── Tipos ─────────────────────────────────────────────────── */

export type PlatformId = "facebook" | "instagram" | "mercado_libre" | "metha";

export interface PlatformIntegration {
  platform: PlatformId;
  is_active: boolean;
  is_connected: boolean;
  credential_1_masked: string | null;
  credential_2_masked: string | null;
  credential_3_masked: string | null;
  credential_4_masked: string | null;
  connected_at: string | null;
}

export interface PlatformField {
  key: "credential_1" | "credential_2" | "credential_3" | "credential_4";
  label: string;
  isSecret?: boolean;
  placeholder?: string;
}

export interface PlatformConfig {
  id: PlatformId;
  name: string;
  description: string;
  colorBg: string;
  colorText: string;
  fields: PlatformField[];
}

/* ── Configuración de Plataformas ──────────────────────────── */

const PLATFORMS: PlatformConfig[] = [
  {
    id: "facebook",
    name: "Facebook",
    description: "Conecta tu página de Facebook para sincronizar productos y gestionar pedidos.",
    colorBg: "rgba(24, 119, 242, 0.12)",
    colorText: "#1877F2",
    fields: [
      { key: "credential_1", label: "App ID", isSecret: false, placeholder: "123456789012345" },
      { key: "credential_2", label: "App Secret", isSecret: true, placeholder: "••••••••••••••••" },
      { key: "credential_3", label: "Access Token", isSecret: true, placeholder: "EAA..." },
      { key: "credential_4", label: "Page ID", isSecret: false, placeholder: "109876543210987" },
    ],
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Publica productos en tu tienda de Instagram y recibe pedidos.",
    colorBg: "linear-gradient(135deg, rgba(225, 48, 108, 0.18) 0%, rgba(131, 58, 180, 0.18) 100%)",
    colorText: "#E1306C",
    fields: [
      { key: "credential_1", label: "Access Token", isSecret: true, placeholder: "IGQV..." },
      { key: "credential_2", label: "Account ID", isSecret: false, placeholder: "1784140..." },
    ],
  },
  {
    id: "mercado_libre",
    name: "Mercado Libre",
    description: "Sincroniza tu catálogo con Mercado Libre y gestiona ventas.",
    colorBg: "rgba(255, 230, 0, 0.25)",
    colorText: "#2D3277",
    fields: [
      { key: "credential_1", label: "Client ID", isSecret: false, placeholder: "123456789" },
      { key: "credential_2", label: "Client Secret", isSecret: true, placeholder: "••••••••••••••••" },
      { key: "credential_3", label: "Access Token", isSecret: true, placeholder: "APP_USR-..." },
    ],
  },
  {
    id: "metha",
    name: "Metha API",
    description: "Integra la API de Metha para gestión logística y despachos.",
    colorBg: "rgba(124, 58, 237, 0.15)",
    colorText: "#7C3AED",
    fields: [
      { key: "credential_1", label: "API Key", isSecret: true, placeholder: "mth_live_..." },
      { key: "credential_2", label: "Secret Key", isSecret: true, placeholder: "••••••••••••••••" },
    ],
  },
];

/* ── Iconos SVG de Plataformas ─────────────────────────────── */

function PlatformIcon({ platform, className = "h-6 w-6" }: { platform: PlatformId; className?: string }) {
  if (platform === "facebook") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    );
  }

  if (platform === "instagram") {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    );
  }

  if (platform === "mercado_libre") {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m11 17 2 2a1 1 0 0 0 1.4 0l4.6-4.6a2 2 0 0 0 0-2.8l-3.4-3.4a2 2 0 0 0-2.8 0L9.4 11.6" />
        <path d="m14 14-2-2a1 1 0 0 0-1.4 0L6 16.6a2 2 0 0 0 0 2.8l3.4 3.4a2 2 0 0 0 2.8 0l3.4-3.4" />
        <path d="m18 8 3 3" />
        <path d="m6 16-3-3" />
      </svg>
    );
  }

  // Metha (Rocket / Logistics)
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

function EyeIcon({ show, className = "h-4 w-4" }: { show: boolean; className?: string }) {
  if (show) {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
        />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
      />
    </svg>
  );
}

function CloseIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

/* ── Componente Principal ──────────────────────────────────── */

export default function IntegracionesTab() {
  const queryClient = useQueryClient();
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);

  // Estado del Modal de Configuración
  const [plataformaModal, setPlataformaModal] = useState<PlatformConfig | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({
    credential_1: "",
    credential_2: "",
    credential_3: "",
    credential_4: "",
  });
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [errorModal, setErrorModal] = useState<string | null>(null);

  // Estado de confirmación de desconexión
  const [plataformaADesconectar, setPlataformaADesconectar] = useState<PlatformConfig | null>(null);

  // Consulta de integraciones activas
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-integrations"],
    queryFn: async () => {
      const res = await api.get("/admin/integrations");
      return res.data as PlatformIntegration[];
    },
  });

  // Mapa de respuestas por plataforma
  const integracionesMap = new Map<string, PlatformIntegration>();
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && item.platform) {
        integracionesMap.set(item.platform, item);
      }
    }
  }

  // Mutación para guardar credenciales (PUT)
  const guardarMutation = useMutation({
    mutationFn: async ({
      platform,
      payload,
    }: {
      platform: PlatformId;
      payload: {
        credential_1: string | null;
        credential_2: string | null;
        credential_3: string | null;
        credential_4: string | null;
      };
    }) => {
      const res = await api.put(`/admin/integrations/${platform}`, payload);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-integrations"] });
      const platConfig = PLATFORMS.find((p) => p.id === variables.platform);
      setAviso({
        tono: "ok",
        texto: `Integración con ${platConfig?.name ?? variables.platform} guardada con éxito.`,
      });
      cerrarModal();
    },
    onError: (err) => {
      setErrorModal(mensajeError(err, "No se pudo guardar la configuración de la integración."));
    },
  });

  // Mutación para desconectar plataforma (DELETE)
  const desconectarMutation = useMutation({
    mutationFn: async (platform: PlatformId) => {
      const res = await api.delete(`/admin/integrations/${platform}`);
      return res.data;
    },
    onSuccess: (_, platform) => {
      queryClient.invalidateQueries({ queryKey: ["admin-integrations"] });
      const platConfig = PLATFORMS.find((p) => p.id === platform);
      setAviso({
        tono: "ok",
        texto: `Integración con ${platConfig?.name ?? platform} desconectada.`,
      });
      setPlataformaADesconectar(null);
    },
    onError: (err) => {
      setAviso({
        tono: "error",
        texto: mensajeError(err, "No se pudo desconectar la plataforma."),
      });
      setPlataformaADesconectar(null);
    },
  });

  const abrirModal = (platform: PlatformConfig) => {
    setPlataformaModal(platform);
    setFormValues({
      credential_1: "",
      credential_2: "",
      credential_3: "",
      credential_4: "",
    });
    setShowSecrets({});
    setErrorModal(null);
  };

  const cerrarModal = () => {
    setPlataformaModal(null);
    setErrorModal(null);
  };

  const toggleShowSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleGuardar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!plataformaModal) return;

    setErrorModal(null);

    const integration = integracionesMap.get(plataformaModal.id);
    const isConnected = integration?.is_connected ?? false;

    // Validación si se conecta por primera vez
    if (!isConnected) {
       const camposFaltantes = plataformaModal.fields.filter(
        (f) => !formValues[f.key] || formValues[f.key].trim() === ""
      );
      if (camposFaltantes.length > 0) {
        setErrorModal(
          `Debes completar todos los campos requeridos (${camposFaltantes.map((f) => f.label).join(", ")}).`
        );
        return;
      }
    }

    // Armar payload: solo campos con valor para permitir actualización parcial en el backend
    const payload: Record<string, string> = {};
    for (const f of plataformaModal.fields) {
      const val = formValues[f.key]?.trim();
      if (val) {
        payload[f.key] = val;
      }
    }

    if (isConnected && Object.keys(payload).length === 0) {
      setErrorModal("Ingresa al menos una credencial nueva para actualizar o haz clic en Cancelar.");
      return;
    }

    guardarMutation.mutate({ platform: plataformaModal.id, payload });
  };

  return (
    <div className="space-y-6">
      {/* Encabezado descriptivo */}
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-extrabold sm:text-2xl text-tinta">
          Integraciones de plataformas
        </h2>
        <p className="text-sm text-tinta-suave max-w-2xl">
          Conecta tus canales de venta y logística para sincronizar catálogo, recibir pedidos y despachar de
          forma automática.
        </p>
      </div>

      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}

      {isLoading && <Cargando texto="Cargando integraciones disponibles" />}
      {error && <ErrorCarga texto="No pudimos cargar las integraciones del servidor." />}

      {/* Cuadrícula de tarjetas de plataformas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {PLATFORMS.map((platform) => {
          const integration = integracionesMap.get(platform.id);
          const isConnected = integration?.is_connected ?? false;
          const connectedDate = integration?.connected_at
            ? new Date(integration.connected_at).toLocaleDateString("es-CL")
            : null;

          return (
            <div
              key={platform.id}
              className="panel p-6 flex flex-col justify-between transition-all duration-200 hover:shadow-levanta relative overflow-hidden group"
            >
              <div>
                {/* Cabecera de la tarjeta: Icono + Nombre + Estado */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-xs"
                      style={{
                        background: platform.colorBg,
                        color: platform.colorText,
                      }}
                    >
                      <PlatformIcon platform={platform.id} className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-bold text-tinta">{platform.name}</h3>
                      {isConnected && connectedDate && (
                        <p className="text-xs text-tinta-suave">Conectado el {connectedDate}</p>
                      )}
                    </div>
                  </div>

                  {/* Insignia de estado */}
                  <span
                    className={`insignia ${
                      isConnected ? "bg-exito-tenue text-exito" : "bg-nube-hondo text-tinta-suave"
                    }`}
                  >
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        isConnected ? "bg-exito" : "bg-tinta-suave/60"
                      }`}
                    />
                    {isConnected ? "Conectado" : "Desconectado"}
                  </span>
                </div>

                {/* Descripción */}
                <p className="mt-3 text-sm text-tinta-suave leading-relaxed">{platform.description}</p>

                {/* Credenciales enmascaradas cuando está conectado */}
                {isConnected && (
                  <div className="mt-4 rounded-xl border border-humo/60 bg-nube/50 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-tinta-suave uppercase tracking-wider text-[11px]">
                        Credenciales vinculadas
                      </span>
                      <span className="text-[11px] text-exito font-medium flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-exito" />
                        Activa
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {platform.fields.map((f) => {
                        const maskedKey = `${f.key}_masked` as keyof PlatformIntegration;
                        const maskedVal = integration ? integration[maskedKey] : null;

                        return (
                          <div
                            key={f.key}
                            className="rounded-lg border border-humo/50 bg-superficie p-2 flex flex-col justify-center"
                          >
                            <span className="text-[11px] text-tinta-suave">{f.label}</span>
                            <span
                              className="font-mono text-xs font-semibold text-tinta truncate mt-0.5"
                              title={typeof maskedVal === "string" ? maskedVal : undefined}
                            >
                              {maskedVal ? String(maskedVal) : "••••••••"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Botones de acción */}
              <div className="mt-5 pt-4 border-t border-humo/60 flex items-center justify-end gap-3">
                {isConnected ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-secundario !py-2 !px-4 text-xs font-semibold"
                      onClick={() => abrirModal(platform)}
                    >
                      Configurar
                    </button>
                    <button
                      type="button"
                      className="btn btn-peligro !py-2 !px-4 text-xs font-semibold"
                      onClick={() => setPlataformaADesconectar(platform)}
                      disabled={desconectarMutation.isPending}
                    >
                      Desconectar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primario !py-2 !px-5 text-xs font-semibold"
                    onClick={() => abrirModal(platform)}
                  >
                    Conectar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Modal de Configuración ──────────────────────────────── */}
      {plataformaModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-titulo"
        >
          <div className="panel w-full max-w-lg p-6 sm:p-7 space-y-5 shadow-2xl relative">
            {/* Cabecera del modal */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background: plataformaModal.colorBg,
                    color: plataformaModal.colorText,
                  }}
                >
                  <PlatformIcon platform={plataformaModal.id} className="h-6 w-6" />
                </div>
                <div>
                  <h3 id="modal-titulo" className="font-display text-xl font-bold text-tinta">
                    {integracionesMap.get(plataformaModal.id)?.is_connected
                      ? `Configurar ${plataformaModal.name}`
                      : `Conectar con ${plataformaModal.name}`}
                  </h3>
                  <p className="text-xs text-tinta-suave">Ingresa las credenciales API provistas por la plataforma</p>
                </div>
              </div>

              <button
                type="button"
                onClick={cerrarModal}
                className="text-tinta-suave hover:text-tinta p-1 rounded-lg transition-colors"
                aria-label="Cerrar modal"
              >
                <CloseIcon />
              </button>
            </div>

            {errorModal && <Aviso tono="error">{errorModal}</Aviso>}

            {/* Formulario */}
            <form onSubmit={handleGuardar} className="space-y-4">
              {plataformaModal.fields.map((f) => {
                const currentIntegration = integracionesMap.get(plataformaModal.id);
                const maskedKey = `${f.key}_masked` as keyof PlatformIntegration;
                const masked = currentIntegration ? currentIntegration[maskedKey] : null;
                const isSecret = Boolean(f.isSecret);
                const isVisible = Boolean(showSecrets[f.key]);

                return (
                  <div key={f.key}>
                    <label className="etiqueta-campo" htmlFor={`campo-${f.key}`}>
                      {f.label}
                    </label>
                    <div className="relative">
                      <input
                        id={`campo-${f.key}`}
                        type={isSecret && !isVisible ? "password" : "text"}
                        className={`campo ${isSecret ? "pr-10" : ""}`}
                        value={formValues[f.key] ?? ""}
                        onChange={(e) =>
                          setFormValues((prev) => ({
                            ...prev,
                            [f.key]: e.target.value,
                          }))
                        }
                        placeholder={
                          masked
                            ? `Actual: ${masked} (deja vacío para mantener)`
                            : f.placeholder ?? `Ingresa ${f.label}`
                        }
                        autoComplete="off"
                      />
                      {isSecret && (
                        <button
                          type="button"
                          onClick={() => toggleShowSecret(f.key)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-tinta-suave hover:text-tinta transition-colors"
                          title={isVisible ? "Ocultar valor" : "Mostrar valor"}
                          aria-label={isVisible ? `Ocultar ${f.label}` : `Mostrar ${f.label}`}
                        >
                          <EyeIcon show={isVisible} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="btn btn-secundario"
                  onClick={cerrarModal}
                  disabled={guardarMutation.isPending}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primario"
                  disabled={guardarMutation.isPending}
                >
                  {guardarMutation.isPending ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal de Confirmación de Desconexión ─────────────────── */}
      {plataformaADesconectar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-titulo"
          aria-describedby="confirm-desc"
        >
          <div className="panel w-full max-w-md p-6 space-y-4 shadow-2xl relative">
            <h3 id="confirm-titulo" className="font-display text-lg font-bold text-tinta">
              ¿Desconectar {plataformaADesconectar.name}?
            </h3>
            <p id="confirm-desc" className="text-sm text-tinta-suave leading-relaxed">
              Al desconectar, se eliminarán las credenciales activas del servidor y se pausará la sincronización con esta
              plataforma. Podrás volver a conectarla en cualquier momento.
            </p>

            <div className="pt-3 flex items-center justify-end gap-3">
              <button
                type="button"
                className="btn btn-secundario text-xs !py-2 !px-4"
                onClick={() => setPlataformaADesconectar(null)}
                disabled={desconectarMutation.isPending}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-peligro text-xs !py-2 !px-4"
                onClick={() => desconectarMutation.mutate(plataformaADesconectar.id)}
                disabled={desconectarMutation.isPending}
              >
                {desconectarMutation.isPending ? "Desconectando…" : "Confirmar desconexión"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
