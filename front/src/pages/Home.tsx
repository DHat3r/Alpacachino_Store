import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <nav className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="text-2xl font-bold text-indigo-600">🦙 AlpacachinoStore</Link>
            </div>
            <div className="flex items-center gap-4">
              <Link to="/catalogo" className="text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium">
                Catálogo
              </Link>
              <Link to="/foro" className="text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium">
                Foro
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Tu tienda de <span className="text-indigo-600">manga y cómics</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Descubre los mejores títulos, únete a la comunidad y compra con confianza.
            Envíos a todo Chile.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              to="/catalogo"
              className="px-8 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors text-lg"
            >
              Ver catálogo
            </Link>
            <Link
              to="/foro"
              className="px-8 py-3 border-2 border-indigo-600 text-indigo-600 font-medium rounded-lg hover:bg-indigo-50 transition-colors text-lg"
            >
              Unirse al foro
            </Link>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6 bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="w-16 h-16 mx-auto mb-4 bg-indigo-100 rounded-full flex items-center justify-center text-3xl">📚</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Catálogo completo</h3>
              <p className="text-gray-600">Miles de títulos de manga y cómics con stock actualizado en tiempo real.</p>
            </div>
            <div className="text-center p-6 bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center text-3xl">💬</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Comunidad activa</h3>
              <p className="text-gray-600">Reseñas, discusiones y recomendaciones de otros lectores.</p>
            </div>
            <div className="text-center p-6 bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center text-3xl">🚚</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Envíos a todo Chile</h3>
              <p className="text-gray-600">Despacho por Starken y Chilexpress. Gratis sobre $30.000.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-400">© 2026 AlpacachinoStore. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}