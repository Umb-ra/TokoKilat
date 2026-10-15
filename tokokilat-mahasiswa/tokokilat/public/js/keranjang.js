// Keranjang belanja, riwayat penelusuran, dan "Beli sekarang".
// Semua disimpan di localStorage supaya tetap ada walau halaman dimuat ulang.

import { $, el, formatRupiah, hargaSetelahDiskon, salinDalam, tampilkanToast } from './util.js';

const KUNCI_KERANJANG = 'tk_keranjang';
const KUNCI_RIWAYAT = 'tk_riwayat';

const KONFIG = { maksPerProduk: 99, mataUang: 'IDR', sumber: 'web-flashsale-1212' };

function bacaKeranjang() {
  return JSON.parse(localStorage.getItem(KUNCI_KERANJANG) || '[]');
}
function simpanKeranjang(isi) {
  localStorage.setItem(KUNCI_KERANJANG, JSON.stringify(isi));
}
function bacaRiwayat() {
  return JSON.parse(localStorage.getItem(KUNCI_RIWAYAT) || '[]');
}
function simpanRiwayat(riwayat) {
  localStorage.setItem(KUNCI_RIWAYAT, JSON.stringify(riwayat));
}

// Riwayat aktivitas dipakai tim rekomendasi ("Karena kamu melihat...").
// Untuk pengembangan, kita isi dengan data contoh pelanggan lama yang aktif
// sejak 2023 supaya kondisinya mirip pengguna sungguhan.
export function siapkanRiwayatContoh(semuaProduk) {
  if (localStorage.getItem(KUNCI_RIWAYAT)) return;
  const riwayat = [];
  const jenis = ['lihat', 'lihat', 'lihat', 'cari', 'keranjang', 'beli'];
  let waktu = Date.parse('2023-01-05T08:00:00+07:00');
  for (let i = 0; i < 9000; i++) {
    const p = semuaProduk[(i * 131) % semuaProduk.length];
    waktu += 1000 * 60 * (7 + (i % 190));
    riwayat.push({ t: waktu, jenis: jenis[i % jenis.length], id: p.id, nama: p.nama, kategori: p.kategori, harga: p.harga });
  }
  simpanRiwayat(riwayat);
}

export function perbaruiLencana() {
  const total = bacaKeranjang().reduce((n, item) => n + item.jumlah, 0);
  $('#lencana-keranjang').textContent = total;
}

function gambarPanel() {
  const daftar = $('#daftar-keranjang');
  const isi = bacaKeranjang();
  daftar.innerHTML = '';
  let total = 0;
  if (isi.length === 0) daftar.append(el('li', '', 'Keranjang masih kosong. Tambahkan produk dari daftar.'));
  for (const item of isi) {
    total += item.harga * item.jumlah;
    const baris = el('li');
    baris.append(el('span', '', item.nama), el('span', 'jumlah', item.jumlah + ' x ' + formatRupiah(item.harga)));
    const hapus = el('button', 'hapus', 'Hapus dari keranjang');
    hapus.type = 'button';
    hapus.addEventListener('click', () => {
      simpanKeranjang(bacaKeranjang().filter((x) => x.id !== item.id));
      perbaruiLencana();
      gambarPanel();
    });
    baris.append(hapus);
    daftar.append(baris);
  }
  $('#total-keranjang').textContent = formatRupiah(total);
}

// Beri browser kesempatan menggambar frame dulu. await biasa hanya microtask dan tidak
// memberi kesempatan render, jadi ditunggu sampai frame berikutnya lalu lanjut di task baru.
function tungguFrameTergambar() {
  return new Promise((selesai) => requestAnimationFrame(() => setTimeout(selesai, 0)));
}

// Lacak.kirim() menghitung hash atas seluruh payload 12 kali. Riwayat lengkap (~9000 entri,
// ~1,2 MB JSON) membuat satu klik memakan puluhan ms, jadi yang dikirim hanya ringkasannya.
// Riwayat lengkap tetap tersimpan di localStorage untuk tim rekomendasi.
function ringkasRiwayat(riwayat) {
  return { terakhir: riwayat.slice(-20), jumlah: riwayat.length };
}

// Riwayat dibaca, ditambah, dikirim ke SDK, dan disimpan dalam satu task tersendiri,
// setelah tampilan tombol sempat diperbarui.
function catatAktivitas(jenis, produk, dataEvent) {
  const konfig = salinDalam(KONFIG);
  const riwayat = bacaRiwayat();
  riwayat.push({ t: Date.now(), jenis, id: produk.id, nama: produk.nama, kategori: produk.kategori, harga: produk.harga });
  window.Lacak.kirim(jenis === 'beli' ? 'begin_checkout' : 'add_to_cart',
    { ...dataEvent, produk, riwayat: ringkasRiwayat(riwayat), sumber: konfig.sumber });
  simpanRiwayat(riwayat);
}

export async function tambahKeKeranjang(produk, tombol) {
  // Keranjang kecil, jadi langsung disimpan. Tampilan diperbarui di task yang sama
  // supaya pengguna langsung melihat klik-nya diterima.
  const keranjang = bacaKeranjang();
  const ada = keranjang.find((item) => item.id === produk.id);
  if (ada) ada.jumlah = Math.min(ada.jumlah + 1, KONFIG.maksPerProduk);
  else keranjang.push({ id: produk.id, nama: produk.nama, harga: hargaSetelahDiskon(produk), jumlah: 1 });
  simpanKeranjang(keranjang);

  perbaruiLencana();
  tombol.textContent = 'Ditambahkan ✓';
  tombol.classList.add('sudah');
  clearTimeout(tombol.pengaturWaktu);
  tombol.pengaturWaktu = setTimeout(() => {
    tombol.textContent = '+ Keranjang';
    tombol.classList.remove('sudah');
  }, 1500);
  tampilkanToast('Ditambahkan ke keranjang: ' + produk.nama);

  // Kerja berat (riwayat + SDK) setelah frame dengan umpan balik tergambar.
  await tungguFrameTergambar();
  catatAktivitas('keranjang', produk, { keranjang });
}

const pesananDiproses = new Set();
const LAMA_TANDA_DIPESAN = 3000;

function aktifkanTombolBeli(produk, tombol) {
  pesananDiproses.delete(produk.id);
  tombol.textContent = 'Beli sekarang';
  tombol.disabled = false;
  tombol.removeAttribute('aria-busy');
}

export async function beliSekarang(produk, tombol) {
  // Penjaga pesanan ganda: klik berikutnya ditolak selama pesanan diproses DAN selama
  // tulisan "Dipesan ✓" masih tampil, karena pengguna sering memencet ulang di rentang itu.
  if (pesananDiproses.has(produk.id)) return;
  pesananDiproses.add(produk.id);
  tombol.disabled = true;
  tombol.setAttribute('aria-busy', 'true');
  tombol.textContent = 'Memproses…';

  try {
    await tungguFrameTergambar();
    catatAktivitas('beli', produk, {});

    const respons = await fetch('/api/pesanan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produkId: produk.id, nama: produk.nama }),
    });
    if (!respons.ok) throw new Error('Server menjawab ' + respons.status);
    const pesanan = await respons.json();

    // Tombol tetap nonaktif selama "Dipesan ✓" tampil, baru setelah itu bisa dipakai lagi.
    tombol.textContent = 'Dipesan ✓';
    setTimeout(() => aktifkanTombolBeli(produk, tombol), LAMA_TANDA_DIPESAN);
    tampilkanToast('Pesanan ' + pesanan.id + ' dibuat: ' + produk.nama);
    perbaruiLencanaPesanan();
  } catch (galat) {
    // Kalau gagal, tombol langsung aktif lagi supaya pengguna bisa mencoba ulang.
    aktifkanTombolBeli(produk, tombol);
    tampilkanToast('Pesanan gagal dibuat, silakan coba lagi.');
  }
}

export async function perbaruiLencanaPesanan() {
  const respons = await fetch('/api/pesanan');
  const pesanan = await respons.json();
  $('#lencana-pesanan').textContent = pesanan.length;
  return pesanan;
}

export function pasangKeranjang() {
  const panel = $('#panel-keranjang');
  const tombolBuka = $('#tombol-keranjang');
  const buka = (ya) => {
    panel.hidden = !ya;
    tombolBuka.setAttribute('aria-expanded', String(ya));
    if (ya) gambarPanel();
  };
  tombolBuka.addEventListener('click', () => buka(panel.hidden));
  $('#tutup-keranjang').addEventListener('click', () => buka(false));
  $('#kosongkan-keranjang').addEventListener('click', () => {
    simpanKeranjang([]);
    perbaruiLencana();
    gambarPanel();
  });

  $('#tombol-pesanan').addEventListener('click', async () => {
    const pesanan = await perbaruiLencanaPesanan();
    if (pesanan.length === 0) return tampilkanToast('Belum ada pesanan. Tekan "Beli sekarang" pada produk untuk memesan.');
    const terakhir = pesanan.slice(-3).map((p) => p.id + ' (produk #' + p.produkId + ')').join(', ');
    tampilkanToast(pesanan.length + ' pesanan. Terakhir: ' + terakhir);
  });

  perbaruiLencana();
  perbaruiLencanaPesanan();
}
