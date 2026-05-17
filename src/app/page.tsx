import PhotoStudio from "@/components/PhotoStudio";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-sky-50/40">
      <PhotoStudio />
      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        <p>
          Automated checks assist compliance with ICAO guidelines; final acceptance is at the
          issuing authority&apos;s discretion.
        </p>
      </footer>
    </main>
  );
}
