/**
 * Marca de la tienda: la cabeza de Alpachino.
 * Dibujo propio en SVG para que escale bien y herede el color (`currentColor`).
 * Si llega el logo definitivo del cliente, basta con reemplazar este componente.
 *
 * `sombrero` le pone el fedora de la familia; con `animarSombrero` el sombrero
 * entra por arriba, da una vuelta completa en el aire y cae en su cabeza.
 */
export default function Alpaca({
  className = "",
  sombrero = false,
  animarSombrero = false,
}: {
  className?: string;
  sombrero?: boolean;
  animarSombrero?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={`overflow-visible ${className}`}
      role="img"
      aria-label={
        sombrero
          ? "Alpachino, la alpaca de la tienda, con su sombrero"
          : "Alpachino, la alpaca de la tienda"
      }
      fill="none"
    >
      {/* cuello */}
      <path d="M19.2 30h9.6v9.5a4.8 4.8 0 0 1-9.6 0V30Z" fill="currentColor" opacity=".9" />

      {/* orejas */}
      <ellipse cx="16" cy="11" rx="2.7" ry="6.3" transform="rotate(-14 16 11)" fill="currentColor" />
      <ellipse cx="32" cy="11" rx="2.7" ry="6.3" transform="rotate(14 32 11)" fill="currentColor" />
      <ellipse
        cx="16.2"
        cy="11.6"
        rx="1.1"
        ry="3.5"
        transform="rotate(-14 16.2 11.6)"
        fill="#f7f0e6"
        opacity=".55"
      />
      <ellipse
        cx="31.8"
        cy="11.6"
        rx="1.1"
        ry="3.5"
        transform="rotate(14 31.8 11.6)"
        fill="#f7f0e6"
        opacity=".55"
      />

      {/* cabeza */}
      <ellipse cx="24" cy="23.4" rx="9.6" ry="10.6" fill="currentColor" />

      {/* chasquilla */}
      <path
        d="M14.8 19.4c1.4-4.2 4.9-6.6 9.2-6.6s7.8 2.4 9.2 6.6c-2.4-1.7-4.8-1.1-6.2.3-1-1.6-2-2.3-3-2.3s-2 .7-3 2.3c-1.4-1.4-3.8-2-6.2-.3Z"
        fill="#ffffff"
        opacity=".45"
      />

      {/* hocico */}
      <ellipse cx="24" cy="28.2" rx="5.5" ry="4.3" fill="#f7f0e6" />
      <path
        d="M24 25.9c1.1 0 2 .6 2 1.4 0 .7-.9 1.3-2 1.3s-2-.6-2-1.3c0-.8.9-1.4 2-1.4Z"
        fill="#1b1420"
        opacity=".85"
      />

      {/* ojos */}
      <circle cx="19.4" cy="22.6" r="1.6" fill="#1b1420" />
      <circle cx="28.6" cy="22.6" r="1.6" fill="#1b1420" />

      {/* sombrero */}
      {sombrero && (
        <g
          className={`alpaca-sombrero${animarSombrero ? " alpaca-sombrero--cae" : ""}`}
        >
          <g transform="rotate(-7 24 12)">
            {/* copa */}
            <path
              d="M17.7 15.1c-.7-4.8 0-8 1.9-9.4 1.3-1 2.8-1.5 4.4-1.5s3.1.5 4.4 1.5c1.9 1.4 2.6 4.6 1.9 9.4z"
              fill="#2b2333"
            />
            {/* hundido de la copa */}
            <path
              d="M21.7 6.1c.7 1 1.5 1.5 2.3 1.5s1.6-.5 2.3-1.5"
              stroke="#17121d"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
            {/* cinta */}
            <path
              d="M17.9 11.3c4.1 1.1 8.1 1.1 12.2 0l-.2 2.5c-3.9 1-7.9 1-11.8 0z"
              fill="#0f0b14"
            />
            {/* ala */}
            <ellipse cx="24" cy="15.6" rx="14.4" ry="3" fill="#2b2333" />
            <ellipse cx="24" cy="14.9" rx="14.4" ry="2.4" fill="#3b3247" />
          </g>
        </g>
      )}
    </svg>
  );
}
