// Perilaku saat halaman digulir: bayangan header, bar progres baca,
// tombol "Ke atas", efek kartu muncul, dan pencatatan impresi produk.

import { $ } from './util.js';

const sudahTercatat = new Set();
const antreanImpresi = [];
let pengaturWaktuImpresi;
let pengamatKartu;
let menungguFrame = false;

// Lacak.kirim() berat (sidik jari 2 juta putaran), jadi impresi dikumpulkan dulu
// dan baru dikirim sekali setelah guliran berhenti, saat browser senggang.
function kirimImpresi() {
  if (!antreanImpresi.length || !window.Lacak) return;
  window.Lacak.kirim('impression', { produk: antreanImpresi.splice(0) });
}

function catatImpresi(id) {
  if (sudahTercatat.has(id)) return;
  sudahTercatat.add(id);
  antreanImpresi.push(id);
  clearTimeout(pengaturWaktuImpresi);
  pengaturWaktuImpresi = setTimeout(() => {
    if ('requestIdleCallback' in window) requestIdleCallback(kirimImpresi, { timeout: 2000 });
    else kirimImpresi();
  }, 1000);
}

// Kartu yang masuk layar dimunculkan dengan animasi, dan dicatat sebagai impresi.
// Posisi kartu dihitung browser sendiri lewat IntersectionObserver, jadi tidak ada
// getBoundingClientRect di event scroll yang memaksa layout dihitung ulang.
// Kelas "di-layar" dipakai CSS supaya lencana kilat hanya berdenyut saat terlihat.
function saatKartuBerubah(daftarEntri) {
  for (const entri of daftarEntri) {
    const kartu = entri.target;
    kartu.classList.toggle('di-layar', entri.isIntersecting);
    if (!entri.isIntersecting) continue;
    kartu.classList.add('terlihat');
    catatImpresi(kartu.dataset.id);
  }
}

export function amatiKartu(akar) {
  if (pengamatKartu) pengamatKartu.disconnect();
  pengamatKartu = new IntersectionObserver(saatKartuBerubah, { rootMargin: '80px 0px' });
  akar.querySelectorAll('.kartu').forEach((kartu) => pengamatKartu.observe(kartu));
}

// Header, bar progres, dan tombol "Ke atas" cukup diperbarui sekali per frame.
// Semua pembacaan dilakukan dulu, baru penulisan, supaya layout tidak dipaksa berulang.
function perbaruiTampilanGulir() {
  menungguFrame = false;
  const y = window.scrollY;
  const tinggiDokumen = document.documentElement.scrollHeight - window.innerHeight;

  $('#kepala').classList.toggle('melayang', y > 8);
  $('#ke-atas').hidden = y < 900;
  $('#bar-gulir').style.transform = 'scaleX(' + (tinggiDokumen > 0 ? y / tinggiDokumen : 0) + ')';
}

export function periksaGulir() {
  if (menungguFrame) return;
  menungguFrame = true;
  requestAnimationFrame(perbaruiTampilanGulir);
}

export function pasangGulir() {
  // passive: true supaya compositor boleh langsung menggeser halaman tanpa menunggu main thread.
  // Pencegahan pull-to-refresh sekarang lewat CSS overscroll-behavior-y.
  window.addEventListener('scroll', periksaGulir, { passive: true });
  window.addEventListener('resize', periksaGulir);

  // Sisa impresi yang belum terkirim dikirim saat halaman ditinggalkan.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') kirimImpresi();
  });

  $('#ke-atas').addEventListener('click', () => window.scrollTo({ top: 0 }));
}
