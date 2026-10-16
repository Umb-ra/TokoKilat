# Audit usulan perbaikan dari AI

Peran Anda di sini adalah **reviewer**. Minta sebuah AI (asisten chat atau coding agent) memperbaiki
minimal dua tiket, sebaiknya di branch terpisah. Uji usulannya dengan protokol pengukuran yang sama.
Temukan minimal **dua** usulan bermasalah. Usulan AI yang bagus juga boleh dicatat, tetapi tidak
menggantikan dua temuan wajib.

Alat AI yang dipakai: Antigravity, Claude, ChatGPT.  Branch atau commit tempat usulan diterapkan: main  Peninjau: Fariz Dhifa Fakhriza (241524040) untuk A-01 dan A-02, Lukman Ahmad (241524050) untuk A-03 dan A-04, Ihsan Fauzi (241524048) untuk A-05 dan A-06

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

## A-03: AI memindahkan beban scroll ke tahap rendering (regresi Commit dan IntersectionObserver)

- **Tiket yang diminta diperbaiki:** TK-1063 (scroll patah-patah)
- **Prompt yang diberikan (ringkas):** Claude Code diminta memperbaiki scroll patah-patah berdasarkan trace baseline S5 dan prediksi P-03 yang sudah ditulis (listener non-passive, forced reflow di periksaGulir, SDK di event scroll, animasi margin-top/top).
- **Usulan AI (ringkas, sertakan potongan kode yang relevan):**
  AI mengganti loop getBoundingClientRect dengan IntersectionObserver yang mengamati semua 3000 kartu terus-menerus, dan mengganti efek muncul kartu dari margin-top menjadi transform yang dipasang di semua kartu sejak awal:
  ```css
  .kartu { opacity: 0; transform: translateY(16px); transition: opacity .35s ease, transform .35s ease; }
  .kartu.terlihat { opacity: 1; transform: none; }
  ```
  ```js
  pengamatKartu = new IntersectionObserver(saatKartuBerubah, { rootMargin: '80px 0px' });
  akar.querySelectorAll('.kartu').forEach((kartu) => pengamatKartu.observe(kartu)); // tidak pernah di-unobserve
  ```
- **Jenis masalah pada usulan:**
  - [ ] Salah diagnosis (memperbaiki hal yang bukan penyebab)
  - [x] Tidak lengkap (gejala berkurang tetapi akar masalah masih ada)
  - [x] Menimbulkan regresi (metrik lain, fitur, aksesibilitas, atau memori memburuk)
  - [ ] Melanggar aturan main (menghapus fitur, mengubah berkas terlarang, dan sebagainya)
  - [ ] Memperbaiki sesuatu yang tidak berpengaruh terukur
- **Bukti:**
  Trace [After-S5-Trace2](trace/After-S5-Trace2-20261015T233123.json.gz) dibandingkan dengan baseline [S5-Trace1](trace/S5-Trace1-20261015T224505.json.gz). Penanganan event scroll memang turun dari 4.238 ms ke 21 ms, tapi Commit naik dari 860 ms ke 3.700 ms dan IntersectionObserver naik dari 789 ms ke 3.655 ms ([After-S5-bottomup.png](gambar/After-S5-bottomup.png), Commit 45,5%). Forced reflow juga muncul lagi di fungsi baru perbaruiTampilanGulir ([After-S5-forced-reflow.png](gambar/After-S5-forced-reflow.png)). Long task terlama hanya turun dari 405 ms ke 116 ms, masih di atas 100 ms.
- **Mengapa AI bisa keliru di sini:**
  AI menerapkan aturan umum "pakai transform dan IntersectionObserver karena lebih murah" tanpa menghitung skalanya. Transform yang bukan none pada 3000 kartu membuat ribuan node transform ikut dikirim ke compositor di setiap commit, dan 3000 target observer dihitung ulang setiap frame. Teknik yang murah untuk satu elemen ternyata mahal untuk 3000 elemen. Uji fungsi AI di headless Chrome juga hanya memeriksa apakah fitur jalan, bukan biaya renderingnya.
- **Perbaikan yang benar menurut tim:**
  Kartu dilepas dari observer setelah muncul, animasi muncul hanya dipasang pada kartu yang sedang terlihat, dan penulisan DOM digabung sekali per frame (commit 3a74c09). Commit turun lagi ke 2.050 ms. Beban IntersectionObserver belum turun, kemungkinan karena content-visibility, sehingga masih tercatat di bagian rekomendasi LAPORAN.

---

## A-04: AI membuat penjaga pesanan ganda yang hanya teruji oleh klik otomatis

- **Tiket yang diminta diperbaiki:** TK-1052 (satu pembelian jadi tiga pesanan)
- **Prompt yang diberikan (ringkas):** Claude Code diminta mencegah pesanan ganda pada "Beli sekarang" sesuai prediksi P-07.
- **Usulan AI (ringkas, sertakan potongan kode yang relevan):**
  AI menonaktifkan tombol saat diklik dan mengaktifkannya lagi segera setelah server menjawab:
  ```js
  tombol.disabled = true;
  try { /* fetch POST /api/pesanan */ tombol.textContent = 'Dipesan ✓'; }
  finally { pesananDiproses.delete(produk.id); tombol.disabled = false; }
  ```
  AI mengujinya di headless Chrome dengan tiga panggilan .click() berturut-turut dalam hitungan milidetik, hasilnya satu pesanan, lalu menyatakan perbaikan selesai.
- **Jenis masalah pada usulan:**
  - [ ] Salah diagnosis (memperbaiki hal yang bukan penyebab)
  - [x] Tidak lengkap (gejala berkurang tetapi akar masalah masih ada)
  - [ ] Menimbulkan regresi (metrik lain, fitur, aksesibilitas, atau memori memburuk)
  - [ ] Melanggar aturan main (menghapus fitur, mengubah berkas terlarang, dan sebagainya)
  - [ ] Memperbaiki sesuatu yang tidak berpengaruh terukur
- **Bukti:**
  Rekaman S3 sesudah perbaikan ([After-S3-Trace1](trace/After-S3-Trace1-20261016T002230.json.gz)) tetap mencatat tiga POST /api/pesanan dan tiga pesanan di log server ([After-S3-terminal-pesanan.png](gambar/After-S3-terminal-pesanan.png)). Waktu klik di trace adalah 0, 1.102, dan 2.099 ms, sedangkan POST selesai dalam sekitar 360 ms. Tombol sudah aktif lagi sebelum klik kedua datang, jadi penjaga tidak berpengaruh untuk pola klik manusia. Baseline punya pola yang sama (0, 933, 2.030 ms).
- **Mengapa AI bisa keliru di sini:**
  AI menguji dengan pola klik yang tidak realistis. Tiga .click() dalam satu skrip terjadi dalam hitungan milidetik, jauh lebih cepat dari jari manusia di HP yang diperlambat 4x. Akibatnya jendela penjagaan 360 ms terlihat cukup, padahal klik manusia berjarak sekitar 1 detik. AI juga tidak memperhitungkan bahwa tulisan "Dipesan ✓" masih tampil saat tombol sudah aktif, yang justru mengundang pengguna memencet lagi.
- **Perbaikan yang benar menurut tim:**
  Tombol tetap nonaktif selama tulisan "Dipesan ✓" tampil (commit 737216e). AI awalnya mengusulkan 1,5 detik, tetapi setelah diuji dengan pola klik dari trace (0, 1, 2 detik) masih lolos satu pesanan, sehingga dinaikkan ke 3 detik. Solusi paling kuat tetap idempotency key di server, yang direkomendasikan ke tim backend. Penjaga di klien hanya mengurangi peluang pesanan ganda. Selama server menerima pesanan duplikat tanpa kunci unik, akar masalahnya belum hilang sepenuhnya.

---

## A-05: AI menyarankan Promise dan async/await palsu untuk perhitungan voucher

- **Tiket yang diminta diperbaiki:** TK-1057 (layar freeze saat tombol pakai voucher ditekan)
- **Prompt yang diberikan (ringkas):** AI diminta memperbaiki hitungHargaPromo di harga-promo.js agar proses hitung voucher pada 3000 produk tidak membekukan antarmuka.
- **Usulan AI (ringkas, sertakan potongan kode yang relevan):**
  AI mengusulkan membungkus perhitungan di dalam new Promise dan menandai fungsinya dengan kata kunci async, persis seperti komentar peninggalan Rudi di kode:
  ```js
  export async function hitungHargaPromo(produk, voucher) {
    return new Promise((resolve) => {
      const hasil = prosesDiskon(produk, voucher);
      resolve(hasil);
    });
  }
  for (const p of produk) {
    await hitungHargaPromo(p, voucher);
    perbaruiProgressBar();
  }
  ```
- **Jenis masalah pada usulan:**
  - [x] Salah diagnosis (memperbaiki hal yang bukan penyebab)
  - [x] Tidak lengkap (gejala berkurang tetapi akar masalah masih ada)
  - [ ] Menimbulkan regresi (metrik lain, fitur, aksesibilitas, atau memori memburuk)
  - [ ] Melanggar aturan main (menghapus fitur, mengubah berkas terlarang, dan sebagainya)
  - [x] Memperbaiki sesuatu yang tidak berpengaruh terukur
- **Bukti:**
  Trace S4 baseline ([S4-Trace1](trace/S4-Trace1-20261013T163927.json.gz)) membuktikan pola ini tidak mengubah apa-apa. Task tetap berjalan satu blok penuh selama 1,81 detik ([gambar/S4-longtask-overview.png](gambar/S4-longtask-overview.png)) dan INP tetap 1824 ms. Di JavaScript, Promise yang langsung selesai hanya masuk ke antrean microtask. Microtask selalu dihabiskan sampai bersih sebelum browser diizinkan merender tampilan. Karena tidak ada jeda task, progress bar tetap macet di 0% lalu mendadak 100%, dan klik pengguna tetap tidak direspons.
- **Mengapa AI bisa keliru di sini:**
  AI mengira kata async dan Promise otomatis membuat kode berjalan di background tanpa mengunci UI. AI tidak membaca perilaku event loop browser, di mana microtask tetap memblokir main thread jika isinya murni komputasi CPU tanpa operasi asinkron sungguhan. AI juga langsung percaya pada komentar Rudi di kode tanpa membuktikannya lewat trace.
- **Perbaikan yang benar menurut tim:**
  async palsu dibuang dari hitungHargaPromo, lalu loop 3000 produk dipecah menjadi batch per 100 produk memakai setTimeout(0) (commit 68d63e5). Karena setTimeout adalah macrotask, browser punya kesempatan menggambar progress bar dan memproses klik di jeda antar-batch. INP turun ke 104 ms dan progress bar bergerak bertahap sampai selesai.

---

## A-06: AI mengganti timer dengan requestAnimationFrame tetapi tetap mengubah properti layout di JS

- **Tiket yang diminta diperbaiki:** TK-1070 (banner promo kedap-kedip dan CPU panas saat diam)
- **Prompt yang diberikan (ringkas):** AI diminta mengoptimasi teks berjalan dan timer promo.js agar tidak membebani CPU saat halaman sedang menganggur.
- **Usulan AI (ringkas, sertakan potongan kode yang relevan):**
  AI mengganti setInterval dengan requestAnimationFrame rekursif, tetapi posisi teks tetap digeser lewat style.left setiap frame:
  ```js
  let posisiX = 0;
  function geserTeksPromo() {
    posisiX -= 1;
    teksPromo.style.left = posisiX + 'px';
    requestAnimationFrame(geserTeksPromo);
  }
  requestAnimationFrame(geserTeksPromo);
  ```
- **Jenis masalah pada usulan:**
  - [ ] Salah diagnosis (memperbaiki hal yang bukan penyebab)
  - [x] Tidak lengkap (gejala berkurang tetapi akar masalah masih ada)
  - [x] Menimbulkan regresi (metrik lain, fitur, aksesibilitas, atau memori memburuk)
  - [ ] Melanggar aturan main (menghapus fitur, mengubah berkas terlarang, dan sebagainya)
  - [ ] Memperbaiki sesuatu yang tidak berpengaruh terukur
- **Bukti:**
  Trace S6 menunjukkan bahwa mengubah style.left setiap frame tetap memaksa main thread menjalankan Style Recalculation, Layout, dan Paint 60 kali per detik. Saat pengguna diam sekalipun, CPU tidak pernah bisa istirahat, laptop tetap panas, dan frame lambat saat idle masih di atas seratus per 10 detik.
- **Mengapa AI bisa keliru di sini:**
  AI terpaku pada saran umum bahwa animasi JavaScript harus memakai requestAnimationFrame, tanpa mengecek properti CSS mana yang digerakkan. Mengubah geometri kotak (seperti left, top, atau margin) tetap membebani main thread, mau dipanggil lewat setInterval ataupun requestAnimationFrame.
- **Perbaikan yang benar menurut tim:**
  Animasi teks berjalan dipindahkan ke CSS murni dengan keyframes dan transform: translateX (commit 369d6d7). Karena transform dikerjakan langsung oleh compositor thread di GPU, main thread tidak perlu menghitung layout atau repaint setiap frame saat halaman diam. Timer fired saat idle turun drastis dari 265 menjadi 11 kali.

---

## Refleksi (maks. 200 kata)

Penggunaan AI sangat membantu dalam mempercepat pekerjaan teknis: memproses pembacaan data trace mentah berukuran ratusan megabyte, membantu mengekstrak angka metrik penting (seperti INP, long task, dan shift score), serta menyusun draf kode perbaikan awal seperti logika debounce dan pemanfaatan `DocumentFragment`.

Namun, kami harus sangat waspada pada dua aspek: diagnosis masalah dan kepatuhan aturan. AI tidak bisa melihat flame chart atau alur kerja event loop secara langsung; ia hanya menebak berdasarkan bentuk kode teks. Akibatnya, AI sering tertipu oleh dugaan palsu (seperti loop kategori kecil yang disangka biang kerok) dan menawarkan solusi pintas yang melanggar batasan sistem (seperti membatasi jumlah produk atau membuang SDK analitik vendor). Pengukuran empiris lewat panel Performance DevTools dan pemahaman alur rendering pipeline tetap menjadi tanggung jawab utama engineer yang tidak bisa diserahkan begitu saja kepada AI.
