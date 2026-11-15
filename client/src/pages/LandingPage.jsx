import { Link } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { useAuth } from "../context/auth.js";

const STEPS = [
  {
    number: "01",
    title: "Tempel tautan panjang",
    body: "URL panjang dengan parameter kampanye dipersingkat jadi satu baris rapi.",
  },
  {
    number: "02",
    title: "Atur alias sendiri",
    body: "Pilih akhiran yang mudah diingat, atau biarkan sistem membuatnya acak.",
  },
  {
    number: "03",
    title: "Pantau kliknya",
    body: "Lihat jumlah kunjungan, tautan asal, dan kapan terakhir dipakai.",
  },
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <Layout>
      <section className="border-b-4 border-ink">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <div className="brut-badge mb-6 bg-acid">Pemendek tautan</div>

          <h1 className="max-w-4xl text-5xl leading-none sm:text-7xl lg:text-8xl">
            Tautan panjang
            <br />
            <span className="bg-ink px-2 text-paper">dipendekkan.</span>
          </h1>

          <p className="mt-8 max-w-xl font-mono text-base leading-relaxed sm:text-lg">
            Simpan semua tautan kampanye, dokumen, dan katalog dalam satu tempat.
            Pendek, bisa diatur, dan bisa dipantau.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link to={user ? "/dashboard" : "/register"} className="brut-btn brut-btn-acid">
              {user ? "Buka dasbor" : "Mulai sekarang"}
            </Link>
            {!user && (
              <Link to="/login" className="brut-btn brut-btn-ghost">
                Sudah punya akun
              </Link>
            )}
          </div>

          <div className="mt-12 brut-box-sm inline-block px-4 py-3">
            <p className="font-mono text-xs uppercase tracking-widest">Contoh</p>
            <p className="mt-1 font-mono text-sm break-all">
              https://contoh.com/katalog/produk-baru?utm_source=instagram&amp;utm_campaign=…
            </p>
            <p className="mt-2 font-mono text-lg font-bold">→ kli-k.id/promo-baru</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl sm:text-4xl">Tiga langkah</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {STEPS.map((step) => (
            <article key={step.number} className="brut-box p-6">
              <span className="font-mono text-4xl font-black">{step.number}</span>
              <h3 className="mt-4 text-xl">{step.title}</h3>
              <p className="mt-2 font-mono text-sm leading-relaxed">{step.body}</p>
            </article>
          ))}
        </div>
      </section>
    </Layout>
  );
}
