// Elemen kampanye: hitung mundur, teks berjalan, dan banner promo.

import { $, el, tampilkanToast } from './util.js';

// Flash sale berakhir tengah malam nanti (waktu perangkat).
function akhirFlashSale() {
  const t = new Date();
  t.setHours(24, 0, 0, 0);
  return t.getTime();
}

const duaDigit = (n) => String(n).padStart(2, '0');

function pasangHitungMundur() {
  const akhir = akhirFlashSale();
  const awal = Date.now();
  const totalDurasi = akhir - awal;
  const garis = $('#hm-garis');
  const jam = $('#hm-jam'), menit = $('#hm-menit'), detik = $('#hm-detik'), senti = $('#hm-senti');

  let jamLama = '', menitLama = '', detikLama = '';

  function perbarui() {
    const sisa = Math.max(akhir - Date.now(), 0);

    const jBaru = duaDigit(Math.floor(sisa / 3600000));
    const mBaru = duaDigit(Math.floor((sisa % 3600000) / 60000));
    const dBaru = duaDigit(Math.floor((sisa % 60000) / 1000));
    const sBaru = duaDigit(Math.floor((sisa % 1000) / 10));

    // Tulis DOM hanya kalau nilai berubah, supaya tidak memicu style recalc sia-sia
    if (jBaru !== jamLama)   { jam.textContent   = jBaru; jamLama   = jBaru; }
    if (mBaru !== menitLama) { menit.textContent = mBaru; menitLama = mBaru; }
    if (dBaru !== detikLama) { detik.textContent = dBaru; detikLama = dBaru; }
    senti.textContent = sBaru;

    // Pakai persentase agar tidak perlu baca offsetWidth (forced reflow) tiap frame
    garis.style.width = ((sisa / totalDurasi) * 100) + '%';

    if (sisa > 0) requestAnimationFrame(perbarui);
  }

  requestAnimationFrame(perbarui);
}

function pasangTeksBerjalan() {
  // Animasi sekarang sepenuhnya ditangani CSS (transform: translateX di compositor thread).
  // Main thread tidak perlu menjalankan apa pun untuk teks berjalan.
}

async function pasangBannerPromo() {
  const banner = el('section', 'promo-banner');
  $('#utama').prepend(banner);

  const respons = await fetch('/api/promo');
  const promo = await respons.json();

  const teks = el('div');
  teks.append(el('h2', '', promo.judul), el('p', '', promo.isi));
  const tombol = el('button', '', promo.tombol);
  tombol.type = 'button';
  tombol.addEventListener('click', () => {
    tampilkanToast('Syarat promo: berlaku 12 Desember, satu voucher per akun, tidak bisa digabung.');
    if (window.Lacak) window.Lacak.kirim('promo_click', { judul: promo.judul });
  });
  banner.replaceChildren(teks, tombol);
}

export function pasangPromo() {
  pasangHitungMundur();
  pasangTeksBerjalan();
  pasangBannerPromo();
}
