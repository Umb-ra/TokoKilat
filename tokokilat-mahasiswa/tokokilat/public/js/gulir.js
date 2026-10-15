// Perilaku saat halaman digulir: bayangan header, bar progres baca,
// tombol "Ke atas", efek kartu muncul, dan pencatatan impresi produk.

import { $ } from './util.js';

const sudahTercatat = new Set();
const antreanImpresi = [];
let pengaturWaktuImpresi;

let pengamatMuncul;  // semua kartu, dilepas setelah kartu muncul pertama kali
let pengamatLencana; // hanya kartu flash sale, untuk menyalakan denyut saat terlihat
const kartuMuncul = [];
const perubahanLencana = new Map();

let posisiY = 0;
let perluBacaPosisi = true;
let tinggiHalaman = 0;
let tinggiLayar = window.innerHeight;
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

// Semua penulisan ke DOM dikumpulkan di sini, sekali per frame. Posisi gulir dan tinggi
// halaman sudah dibaca sebelumnya (di event scroll dan ResizeObserver), jadi di sini
// tidak ada pembacaan yang memaksa layout dihitung saat itu juga.
function perbaruiFrame() {
  menungguFrame = false;
  if (perluBacaPosisi) {
    posisiY = window.scrollY;
    perluBacaPosisi = false;
  }

  const jarakGulir = tinggiHalaman - tinggiLayar;
  $('#kepala').classList.toggle('melayang', posisiY > 8);
  $('#ke-atas').hidden = posisiY < 900;
  $('#bar-gulir').style.transform = 'scaleX(' + (jarakGulir > 0 ? Math.min(posisiY / jarakGulir, 1) : 0) + ')';

  for (const kartu of kartuMuncul) kartu.classList.add('terlihat');
  kartuMuncul.length = 0;
  for (const [kartu, terlihat] of perubahanLencana) kartu.classList.toggle('di-layar', terlihat);
  perubahanLencana.clear();
}

function jadwalkanFrame() {
  if (menungguFrame) return;
  menungguFrame = true;
  requestAnimationFrame(perbaruiFrame);
}

// Kartu yang masuk layar dimunculkan dengan animasi dan dicatat sebagai impresi.
// Setelah itu kartu tidak diamati lagi, supaya jumlah target IntersectionObserver
// terus berkurang selama menggulir.
function saatKartuMuncul(daftarEntri) {
  for (const entri of daftarEntri) {
    if (!entri.isIntersecting) continue;
    pengamatMuncul.unobserve(entri.target);
    kartuMuncul.push(entri.target);
    catatImpresi(entri.target.dataset.id);
  }
  if (kartuMuncul.length) jadwalkanFrame();
}

function saatLencanaBerubah(daftarEntri) {
  for (const entri of daftarEntri) perubahanLencana.set(entri.target, entri.isIntersecting);
  jadwalkanFrame();
}

export function amatiKartu(akar) {
  if (pengamatMuncul) pengamatMuncul.disconnect();
  if (pengamatLencana) pengamatLencana.disconnect();
  kartuMuncul.length = 0;
  perubahanLencana.clear();

  pengamatMuncul = new IntersectionObserver(saatKartuMuncul, { rootMargin: '80px 0px' });
  pengamatLencana = new IntersectionObserver(saatLencanaBerubah);
  akar.querySelectorAll('.kartu').forEach((kartu) => pengamatMuncul.observe(kartu));
  akar.querySelectorAll('.lencana-kilat').forEach((lencana) => pengamatLencana.observe(lencana.parentElement));
}

// Dipanggil setelah daftar produk digambar ulang: posisi gulir dibaca lagi di frame berikutnya.
export function periksaGulir() {
  perluBacaPosisi = true;
  jadwalkanFrame();
}

export function pasangGulir() {
  // passive: true supaya compositor boleh langsung menggeser halaman tanpa menunggu main thread.
  // Pencegahan pull-to-refresh sekarang lewat CSS overscroll-behavior-y.
  // Event scroll dijalankan browser tepat sebelum callback requestAnimationFrame,
  // saat layout masih bersih, jadi membaca scrollY di sini tidak memaksa layout.
  window.addEventListener('scroll', () => {
    posisiY = window.scrollY;
    jadwalkanFrame();
  }, { passive: true });
  window.addEventListener('resize', () => {
    tinggiLayar = window.innerHeight;
    periksaGulir();
  });

  // Tinggi halaman disimpan, bukan dibaca (scrollHeight) setiap frame.
  // Callback ResizeObserver berjalan setelah layout selesai, jadi tidak memaksa layout.
  new ResizeObserver((daftarEntri) => {
    tinggiHalaman = daftarEntri[0].borderBoxSize[0].blockSize;
    jadwalkanFrame();
  }).observe(document.documentElement);

  // Sisa impresi yang belum terkirim dikirim saat halaman ditinggalkan.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') kirimImpresi();
  });

  $('#ke-atas').addEventListener('click', () => window.scrollTo({ top: 0 }));
}
