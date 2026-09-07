import { Dashboard } from "./ui/Dashboard";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main>
      <h1>Meitainc Transaction Mock</h1>
      <p>
        Semua endpoint dilayani dari <code>/api/mock/*</code> dan dipilih berdasarkan rule paling spesifik
        (path, query, header, body). Edit rule dan response message langsung di bawah — perubahan disimpan ke
        folder <code>mocks/</code> dan langsung aktif tanpa restart.
      </p>
      <p className="muted">
        Contoh: <code>GET /api/mock/products?product=PLP</code> memakai rule <code>products-plp</code>, sedangkan{" "}
        <code>GET /api/mock/products</code> jatuh ke <code>products-all</code>.
      </p>
      <h2>Rule</h2>
      <Dashboard />
    </main>
  );
}
