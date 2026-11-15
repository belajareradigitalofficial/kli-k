import { Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";

export default function NotFoundPage() {
  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <p className="font-mono text-sm uppercase tracking-widest">404</p>
        <h1 className="mt-4 text-5xl sm:text-7xl">Halaman tidak ada</h1>
        <p className="mt-6 font-mono text-sm">
          Alamat yang kamu buka tidak tersedia atau sudah dipindahkan.
        </p>
        <Link to="/" className="brut-btn brut-btn-acid mt-8">
          Kembali ke beranda
        </Link>
      </div>
    </Layout>
  );
}
