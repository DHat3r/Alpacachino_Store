import { Link, useLocation } from "react-router-dom";

import { useConfig } from "../api/config";
import { duracionReserva } from "../lib/format";

/** Términos, privacidad y derecho a retracto (Ley 19.496 y Ley 21.719). */
export default function Legal() {
  const { data: config } = useConfig();
  const vendedor = config?.seller;
  const { pathname } = useLocation();
  const enPrivacidad = pathname.startsWith("/privacidad");

  return (
    <div className="contenedor max-w-3xl py-10">
      <div className="flex gap-2">
        <Link
          to="/terminos"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            enPrivacidad ? "bg-white text-tinta-suave" : "bg-morado text-white"
          }`}
        >
          Términos de compra
        </Link>
        <Link
          to="/privacidad"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            enPrivacidad ? "bg-morado text-white" : "bg-white text-tinta-suave"
          }`}
        >
          Privacidad
        </Link>
      </div>

      <h1 className="mt-6 font-display text-3xl font-extrabold sm:text-4xl">
        {enPrivacidad ? "Política de privacidad" : "Términos y condiciones"}
      </h1>
      <p className="mt-2 text-sm text-tinta-suave">
        Versión {config?.terms_version ?? "vigente"} · actualizada en octubre de 2026
      </p>

      <div className="texto-largo mt-8">
        {enPrivacidad ? (
          <>
            <h2>Qué datos guardamos</h2>
            <p>
              Guardamos tu correo, tu nombre de usuario y los datos de despacho (nombre,
              teléfono, dirección, comuna y región) que escribes al comprar. También
              quedan registradas tus publicaciones y comentarios del foro.
            </p>

            <h2>Para qué los usamos</h2>
            <p>
              Solo para gestionar tu cuenta, preparar y despachar tus pedidos, responder
              consultas y moderar el foro. No vendemos ni cedemos tus datos a terceros
              ajenos a la operación de la tienda.
            </p>

            <h2>Cuánto tiempo los conservamos</h2>
            <p>
              Mientras tengas cuenta activa. Si la eliminas desde{" "}
              <Link to="/cuenta">Mi cuenta</Link>, borramos tus datos personales y tus
              publicaciones quedan anónimas; los pedidos se conservan de forma anonimizada
              por obligaciones tributarias.
            </p>

            <h2>Tus derechos</h2>
            <p>
              Puedes pedir acceso, rectificación, eliminación u oposición al tratamiento de
              tus datos escribiendo a{" "}
              {vendedor?.email ? (
                <a href={`mailto:${vendedor.email}`}>{vendedor.email}</a>
              ) : (
                "nuestro correo de contacto"
              )}
              . Respondemos dentro de los plazos de la Ley 21.719.
            </p>

            <h2>Cookies y sesión</h2>
            <p>
              Usamos almacenamiento del navegador para mantener tu sesión y tu carrito. No
              usamos cookies de publicidad ni de seguimiento de terceros.
            </p>
          </>
        ) : (
          <>
            <h2>Quién vende</h2>
            <p>
              Este sitio es operado por {vendedor?.name ?? "AlpacachinoStore"}.
              {vendedor?.email && (
                <>
                  {" "}
                  Contacto: <a href={`mailto:${vendedor.email}`}>{vendedor.email}</a>.
                </>
              )}
              {vendedor?.phone && <> Teléfono: {vendedor.phone}.</>}
            </p>

            <h2>Precios y stock</h2>
            <p>
              Los precios están en pesos chilenos e incluyen impuestos. Las imágenes son
              referenciales. Al confirmar un pedido reservamos el stock por{" "}
              {duracionReserva(config?.reservation_minutes)}; si no recibimos el pago en
              ese plazo, la reserva se libera y el pedido queda vencido.
            </p>

            <h2>Pago por transferencia</h2>
            <p>
              Después de confirmar el pedido te mostramos los datos bancarios. Envíanos el
              comprobante indicando el número de pedido. Cuando lo verificamos, el pedido
              pasa a «Pagado» y lo preparamos para despacho.
            </p>

            <h2>Despacho</h2>
            <p>
              El costo de envío se informa antes de confirmar y se despacha dentro de los
              plazos publicados. Si un producto no está disponible después del pago, te
              ofrecemos una alternativa o la devolución íntegra del monto.
            </p>

            <h2>Derecho a retracto</h2>
            <p>
              Según la Ley 19.496 puedes retractarte dentro de 10 días corridos desde que
              recibes el producto, sin expresar causa, siempre que esté en las mismas
              condiciones en que se entregó. Escríbenos indicando el número de pedido.
            </p>

            <h2>Foro</h2>
            <p>
              Las opiniones son responsabilidad de quien las publica. La moderación puede
              ocultar contenido ofensivo o spam y cerrar hilos. Las reseñas con estrellas
              requieren una compra confirmada del título.
            </p>

            <h2>Reclamos</h2>
            <p>
              Para consultas o reclamos escríbenos al correo de contacto. También puedes
              presentar un reclamo ante el Servicio Nacional del Consumidor (SERNAC).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
