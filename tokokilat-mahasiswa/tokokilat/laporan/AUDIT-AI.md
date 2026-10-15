# Audit usulan perbaikan dari AI

Peran Anda di sini adalah **reviewer**. Minta sebuah AI (asisten chat atau coding agent) memperbaiki
minimal dua tiket, sebaiknya di branch terpisah. Uji usulannya dengan protokol pengukuran yang sama.
Temukan minimal **dua** usulan bermasalah. Usulan AI yang bagus juga boleh dicatat, tetapi tidak
menggantikan dua temuan wajib.

Alat AI yang dipakai: Antigravity, Claude, ChatGPT.  Branch atau commit tempat usulan diterapkan: main  Peninjau: Fariz Dhifa Fakhriza (241524040)

---

## A-01: AI mengusulkan optimasi loop kategori dan bubble sort (mengikuti dugaan Rudi)

- **Tiket yang diminta diperbaiki:** TK-1041 dan catatan Rudi #1 serta #3
- **Prompt yang diberikan (ringkas):** "Aplikasi TokoKilat terasa lambat saat dibuka. Tolong bantu periksa kode dan perbaiki bottleneck utama sesuai catatan serah terima Rudi, terutama loop O(n^2) di kategori.js dan bubble sort di util.js."
- **Usulan AI (ringkas, sertakan potongan kode yang relevan):**
  AI langsung mengamini catatan Rudi dan mengusulkan untuk mengganti algoritma bubble sort dengan quicksort di `util.js`:
  ```js
  // Usulan AI: quicksort untuk menggantikan urutkanGelembung
  export function quicksort(arr, banding) {
    if (arr.length <= 1) return arr;
    const pivot = arr[arr.length - 1];
    const left = [], right = [];
    for (let i = 0; i < arr.length - 1; i++) {
      if (banding(arr[i], pivot) < 0) left.push(arr[i]);
      else right.push(arr[i]);
    }
    return [...quicksort(left, banding), pivot, ...quicksort(right, banding)];
  }
  ```
  AI juga mengusulkan membuat Map untuk mengelompokkan kategori agar loop di `kategori.js` tidak bersarang.
- **Jenis masalah pada usulan:**
  - [x] Salah diagnosis (memperbaiki hal yang bukan penyebab)
  - [ ] Tidak lengkap (gejala berkurang tetapi akar masalah masih ada)
  - [ ] Menimbulkan regresi (metrik lain, fitur, aksesibilitas, atau memori memburuk)
  - [ ] Melanggar aturan main (menghapus fitur, mengubah berkas terlarang, dan sebagainya)
  - [x] Memperbaiki sesuatu yang tidak berpengaruh terukur
- **Bukti:**
  Dari hasil pengukuran runtime dan flame chart trace S0:
  - Jumlah kategori unik pada 3000 produk ternyata **hanya 8 kategori**. Loop bersarang `kategori.js` hanya berjalan 56 kali dan memakan waktu **0,46 ms**.
  - Jumlah merek yang diurutkan bubble sort **hanya 12 merek** (maksimal 66 perbandingan), dengan durasi eksekusi hanya **0,33 ms**.
  - Pengurutan 3000 produk utama di katalog sebenarnya sudah memakai `Array.prototype.sort` bawaan browser di `pencarian.js`, bukan fungsi bubble sort ini.
  Total durasi kedua bagian ini kurang dari 1 milidetik, sementara waktu render halaman mencapai lebih dari 2.000 ms. Mengganti bubble sort menjadi quicksort tidak menghasilkan penurunan waktu yang terukur sama sekali di flame chart (0,33 ms vs 0,25 ms tidak berdampak pada frame rate maupun INP).
- **Mengapa AI bisa keliru di sini:**
  AI hanya membaca struktur kode teks (*pattern matching*) dan langsung terpancing oleh istilah teoritis "O(n²)", "bubble sort", dan komentar "TODO(rudi)". AI tidak memiliki akses ke runtime trace dan tidak memeriksa ukuran data riil di memori (N=8 dan N=12). Bagi AI, bubble sort selalu dianggap sebagai kelemahan performa, padahal untuk N yang sangat kecil overhead-nya hampir nol.
- **Perbaikan yang benar menurut tim:**
  Kode di `kategori.js` dan `util.js` dibiarkan apa adanya karena bukan sumber kemacetan. Tim memfokuskan perbaikan ke area yang benar-benar mendominasi flame chart (rendering kartu, normalisasi teks, dan penundaan pemuatan gambar).

---

## A-02: AI mengusulkan pembatasan data (pagination/virtual list) dan menghapus SDK lacak

- **Tiket yang diminta diperbaiki:** TK-1041 (Bu Wulan, ketikan di kolom cari lambat dan hang)
- **Prompt yang diberikan (ringkas):** "Pengguna mengeluh saat mengetik sepatu di kolom cari hurufnya lambat muncul dan HP seperti hang. Tolong perbaiki kode pencarian.js dan katalog.js agar responsif."
- **Usulan AI (ringkas, sertakan potongan kode yang relevan):**
  AI mengusulkan memotong hasil render produk menjadi hanya 20 kartu pertama (pagination sederhana) dan menghapus baris pelacakan analitik:
  ```js
  // Usulan AI: potong produk jadi 20 dan hapus window.Lacak
  export function terapkanSaringan() {
    const kunci = normalkan(saringan.kata);
    let hasil = keadaan.semuaProduk.filter(...);
    // AI membatasi hanya 20 produk agar render cepat:
    renderProduk(hasil.slice(0, 20));
    // AI menyarankan: "Hapus baris Lacak.kirim karena fungsi SDK ini lambat"
    // window.Lacak.kirim('search', ...); -> DIHAPUS OLEH AI
  }
  ```
- **Jenis masalah pada usulan:**
  - [ ] Salah diagnosis (memperbaiki hal yang bukan penyebab)
  - [x] Tidak lengkap (gejala berkurang tetapi akar masalah masih ada)
  - [x] Menimbulkan regresi (metrik lain, fitur, aksesibilitas, atau memori memburuk)
  - [x] Melanggar aturan main (menghapus fitur, mengubah berkas terlarang, dan sebagainya)
  - [ ] Memperbaiki sesuatu yang tidak berpengaruh terukur
- **Bukti:**
  1. Usulan AI secara langsung **melanggar Aturan Main no. 3**: *"Semua produk tetap ada. Seluruh 3000 produk harus tetap bisa ditemukan lewat pencarian dan dijangkau dengan menggulir, dan jumlah hasil yang ditampilkan harus benar."* Memotong array dengan `slice(0, 20)` membuat 2.980 produk lain tidak bisa dilihat atau dibeli oleh pengguna.
  2. Usulan menghapus `Lacak.kirim` **melanggar Aturan Main no. 1**: setiap event analitik (`search`, `impression`, dll.) wajib tetap terkirim.
  3. Berdasarkan data trace perbaikan tim kami, tanpa perlu memangkas jumlah produk atau menghapus analitik, nilai INP berhasil diturunkan dari **592 ms menjadi 64 ms** (turun 89,2%) dan long task saat mengetik turun menjadi **0 kali** hanya dengan menerapkan debounce 250 ms, memoize `Intl.NumberFormat`, dan `DocumentFragment`.
- **Mengapa AI bisa keliru di sini:**
  AI mengambil solusi umum yang sering beredar di internet (*lazy pagination*) tanpa membaca batasan dan aturan bisnis yang berlaku pada tugas ini. AI juga cenderung "mengambil jalan pintas" dengan menghapus kode yang berat (seperti SDK Lacak) daripada memperbaiki waktu dan cara pemanggilannya.
- **Perbaikan yang benar menurut tim:**
  Pertahankan seluruh 3000 produk dan tetap kirim event SDK. Cukup pasang debounce 250 ms pada input kolom cari, gunakan kembali satu instans `Intl.NumberFormat` di level modul, dan kirim event `Lacak.kirim` satu kali saja setelah pengguna selesai mengetik kata kunci.

---

## Refleksi (maks. 200 kata)

Penggunaan AI sangat membantu dalam mempercepat pekerjaan teknis: memproses pembacaan data trace mentah berukuran ratusan megabyte, membantu mengekstrak angka metrik penting (seperti INP, long task, dan shift score), serta menyusun draf kode perbaikan awal seperti logika debounce dan pemanfaatan `DocumentFragment`.

Namun, kami harus sangat waspada pada dua aspek: diagnosis masalah dan kepatuhan aturan. AI tidak bisa melihat flame chart atau alur kerja event loop secara langsung; ia hanya menebak berdasarkan bentuk kode teks. Akibatnya, AI sering tertipu oleh dugaan palsu (seperti loop kategori kecil yang disangka biang kerok) dan menawarkan solusi pintas yang melanggar batasan sistem (seperti membatasi jumlah produk atau membuang SDK analitik vendor). Pengukuran empiris lewat panel Performance DevTools dan pemahaman alur rendering pipeline tetap menjadi tanggung jawab utama engineer yang tidak bisa diserahkan begitu saja kepada AI.
