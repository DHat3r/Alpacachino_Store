import { useConfig } from "../api/config";

/** Términos, privacidad y derecho a retracto (Ley 19.496 y Ley 21.719). */
export default function Legal() {
  const { data: config } = useConfig();
  const vendedor = config?.seller;

  return (
    <div className="p-6 max-w-3xl mx-auto prose prose-sm sm:prose-base">
      <h1>Términos y condiciones</h1>
      <p className="text-sm text-gray-500">
        Versión {config?.terms_version ?? "vigente"} · Última actualización: octubre de 2026
      </p>

      <h2>1. Identificación del vendedor</h2>
      <p>
        Este sitio es operado por {vendedor?.name ?? "AlpacachinoStore"}.
        {vendedor?.email && (
          <>
            {" "}Contacto:{" "}
            <a href={`mailto:${vendedor.email}`}>{vendedor.email}</a>.
          </>
        )}
        {vendedor?.phone && <> Teléfono: {vendedor.phone}.</>}
      </p>

      <h2>2. Productos y precios</h2>
      <p>
        Los precios se expresan en pesos chilenos (CLP) e incluyen impuestos. Las imágenes son
        referenciales. El stock se reserva al confirmar el pedido y se libera automáticamente si
        el pago no se concreta dentro del plazo indicado en el checkout.
      </p>

      <h2>3. Despacho</h2>
      <p>
        El costo de envío se informa antes de pagar y el despacho se realiza dentro de los plazos
        publicados en el sitio. Si el producto no está disponible después del pago, se ofrece una
        alternativa o la devolución íntegra del monto pagado.
      </p>

      <h2>4. Derecho a retracto</h2>
      <p>
        De acuerdo con la Ley 19.496, tienes derecho a retractarte de la compra dentro de 10 días
        corridos desde la recepción del producto, sin expresión de causa, siempre que el bien se
        encuentre en las mismas condiciones en que fue entregado. Para ejercerlo, escríbenos al
        correo de contacto indicando el número de pedido.
      </p>

      <h2>5. Datos personales</h2>
      <p>
        Tratamos tus datos (correo, nombre de usuario, dirección y teléfono de despacho) con la
        única finalidad de gestionar tu cuenta, los pedidos y el foro comunitario. No vendemos ni
        cedemos datos a terceros ajenos a la operación del sitio. Puedes solicitar la eliminación
        de tu cuenta desde tu perfil; los pedidos se conservan de forma anonimizada por
        obligaciones tributarias.
      </p>

      <h2>6. Foro comunitario</h2>
      <p>
        Las opiniones publicadas son responsabilidad de quien las escribe. La moderación puede
        ocultar contenido ofensivo o spam y cerrar hilos. Las reseñas con estrellas requieren una
        compra confirmada del producto.
      </p>

      <h2>7. Contacto y reclamos</h2>
      <p>
        Para consultas o reclamos, usa el correo de contacto indicado arriba. También puedes
        presentar un reclamo ante el Servicio Nacional del Consumidor (SERNAC).
      </p>
    </div>
  );
}
