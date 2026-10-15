# Laporan audit performa dan interaksi TokoKilat

Tim: HebatKenapa  Anggota: Ihsan Fauzi (241524048), ....  Tanggal: 13 Oktober 2026
Panjang maksimal setara 6 halaman (tidak termasuk lampiran gambar).

## 1. Ringkasan eksekutif (maks. 150 kata)
Draf sementara setelah pengujian S0, S4, dan S6. 
Masalah terbesar yang sudah ditangani adalah layar yang ngefreeze sekitar 1,8 detik saat pelanggan memakai voucher. Penyebabnya perhitungan 3000 produk yang ditulis seolah-olah asinkron, padahal tetap memblokir browser. Perhitungan dipecah menjadi potongan kecil sehingga progres terlihat bertahap, dan INP turun dari 1824 ms menjadi 104 ms. Halaman yang meloncat saat dimuat diperbaiki dengan menyiapkan ruang banner dari awal, sehingga CLS turun dari 0,473 menjadi 0,003. Beban CPU saat halaman dibiarkan diam berkurang (frame lambat 271 menjadi 163), tetapi belum mencapai target dua frame lambat per 10 detik dan masih perlu diselidiki.

## 2. Lingkungan pengukuran
- Laptop: Intel Core i5-13450HX, RAM 16 GB, Windows 11
- Browser: Google Chrome versi stabil, jendela Incognito, tanpa ekstensi
- Aplikasi: npm start, 3000 produk, http://localhost:3000/?ukur=1
- Viewport 412 x 915, tiap skenario diulang 3 kali, median dihitung per metrik
- Skenario S0, S4, dan S6 diukur tanpa CPU throttling. Percobaan dengan 4x slowdown sudah dilakukan, tetapi untuk memulai perekaman di panel Performance saja butuh sekitar 30 menit, sehingga dianggap tidak optimal pengerjaannya.

## 3. Hasil sebelum dan sesudah

| Skenario | Metrik | Sebelum (median) | Sesudah (median) | Target | Tercapai? |
|---|---|---|---|---|---|
| S0 | CLS | 0,473 | 0,003 | <= 0,1 | Ya |
| S0 | Jumlah permintaan gambar dalam 10 dtk pertama | 3000 | | sebanding dengan yang terlihat | |
| S1 | INP | 592 ms | 64 ms | <= 200 ms | Ya |
| S1 | Long task terlama | 471 ms | 349 ms | <= 100 ms | Belum |
| S2 | INP | | | <= 200 ms | |
| S3 | Jumlah pesanan dari 3 klik | | | 1 | |
| S4 | INP / progres tergambar bertahap? | 1824 ms / tidak | 104 ms / ya | <= 200 ms, bertahap | Ya |
| S5 | Frame > 50 ms per 10 dtk | | | <= 2 | |
| S6 | Frame > 50 ms per 10 dtk | 271 | 163 | <= 2 | Belum |

Pendukung S1: INP turun dari 592 ms menjadi 64 ms (turun 89,2%), pengetikan responsif instan. Long task terlama turun dari 471 ms ke 349 ms.
Pendukung S4: long task terlama 1808 ms menjadi 632 ms, total blokir 8678 ms menjadi 1098 ms, jumlah long task 125 menjadi 25.

## 4. Temuan

Diurutkan berdasarkan dampak bagi pengguna.

### T-01: Layar freeze saat memakai voucher
- **Tiket terkait:** TK-1057
- **Gejala bagi pengguna:** Setelah menekan Pakai voucher, layar freeze sekitar 1,8 detik. Progres tampil 0% lalu langsung selesai, dan kolom cari tidak bisa diketik.
- **Bukti:** [gambar/S4-longtask-overview.png](gambar/S4-longtask-overview.png) menunjukkan satu Task 1,81 detik berisi Event click, Run microtasks, lalu terapkanVoucher. [gambar/S4-bottomup.png](gambar/S4-bottomup.png) menunjukkan Layout 33,3%, simulasiCicilan 22,5%, dan formatRupiah 12%. Sesudah perbaikan: [gambar/After-S4-longtask-overview.png](gambar/After-S4-longtask-overview.png), [gambar/After-S4-bottomup.png](gambar/After-S4-bottomup.png), dan [gambar/After-S4-Progressbar-hitunghargapromo.png](gambar/After-S4-Progressbar-hitunghargapromo.png).
- **Akar masalah dan mekanismenya:** Di [public/js/harga-promo.js](../public/js/harga-promo.js), fungsi hitungHargaPromo ditandai async dan dipanggil dengan await di dalam loop 3000 produk. Fungsi itu hanya melakukan komputasi sinkron, jadi promise-nya langsung selesai dan kelanjutannya masuk antrean microtask. Event loop menghabiskan seluruh microtask sebelum kembali ke rendering atau input berikutnya, sehingga 3000 iterasi berjalan sebagai satu task panjang tanpa Style, Layout, dan Paint di tengahnya. Beban tiap iterasi juga besar karena simulasiCicilan dipanggil 41 kali dengan loop bersarang.
- **Kualitas yang terdampak (ISO/IEC 25010):** Time behaviour: respons 1,8 detik jauh di atas ambang. Interaction capability: operability (kolom cari tidak bisa dipakai) dan self-descriptiveness (progres tidak tergambar, pengguna mengira aplikasi crash).
- **Perbaikan:** Commit 68d63e5. Kata async dihapus dari hitungHargaPromo, dan loop dipecah menjadi potongan 100 produk dengan jeda setTimeout(0) di antaranya. setTimeout menjadwalkan task baru, bukan microtask, sehingga browser sempat menggambar dan memproses input di sela potongan.
- **Trade-off:** Web Worker memindahkan beban ke thread lain, tetapi menambah kompleksitas dan biaya penyalinan data. Mengurangi 41 panggilan simulasiCicilan berisiko mengubah aturan bisnis. requestIdleCallback waktunya sulit diprediksi. Harga dari pilihan ini adalah total durasi sedikit lebih panjang karena overhead timer, dan masih ada long task terbesar 632 ms yang belum diselidiki.
- **Hasil:** INP 1824 ms menjadi 104 ms (turun 94,3%). Total blokir 8678 ms menjadi 1098 ms (turun 87,3%). Long task terlama 1808 ms menjadi 632 ms (turun 65,0%). Progres kini tergambar bertahap.

### T-02: Halaman loncat saat dimuat
- **Tiket terkait:** TK-1078
- **Gejala bagi pengguna:** Saat hendak menekan produk, halaman bergeser turun dan yang tertekan justru iklan promo.
- **Bukti:** [gambar/S0-layoutshift-overview.png](gambar/S0-layoutshift-overview.png) (shift 0,1369 pada alat, kisi, dan ringkasan), [gambar/S0-pasangbannerpromo.png](gambar/S0-pasangbannerpromo.png), dan [gambar/S0-samakantinggijudul.png](gambar/S0-samakantinggijudul.png). Sesudah perbaikan: [gambar/After-S0-layoutshift-overview.png](gambar/After-S0-layoutshift-overview.png) dan [gambar/After-S0-samakantinggijudul.png](gambar/After-S0-samakantinggijudul.png).
- **Akar masalah dan mekanismenya:** Pertama, pasangBannerPromo di [public/js/promo.js](../public/js/promo.js) menyisipkan banner dengan prepend setelah /api/promo selesai (tertunda sekitar 1800 ms), sehingga semua konten di bawahnya terdorong turun. Kedua, samakanTinggiJudul di [public/js/katalog.js](../public/js/katalog.js) membaca offsetHeight lalu menulis style.height di dalam loop, yang memicu forced reflow berulang dan mengubah ukuran elemen yang sudah tergambar.
- **Kualitas yang terdampak (ISO/IEC 25010):** Interaction capability: user error protection (salah klik iklan) dan operability. Performance efficiency: time behaviour, karena layout thrashing ikut menambah total blokir.
- **Perbaikan:** Commit 8104a24. Ruang banner disiapkan sejak awal lewat min-height pada wadahnya, dan isi banner dimasukkan ke wadah itu tanpa prepend. Penyamaan tinggi judul diserahkan ke CSS min-height tanpa JavaScript.
- **Trade-off:** Banner tampil sebagai kotak kosong sekitar 1,8 detik sebelum isinya datang. Judul satu baris punya sedikit ruang kosong tambahan. Skeleton screen dipertimbangkan, tetapi min-height sudah cukup.
- **Hasil:** CLS 0,473 menjadi 0,003 (turun 99,4%). Total blokir 4726 ms menjadi 1044 ms. Jumlah long task 160 menjadi 26.

### T-03: Main thread tidak pernah idle
- **Tiket terkait:** TK-1070
- **Gejala bagi pengguna:** HP panas dan baterai cepat turun padahal halaman hanya dibuka.
- **Bukti:** [gambar/S6-idle-overview.png](gambar/S6-idle-overview.png), [gambar/S6-timerfired.png](gambar/S6-timerfired.png), dan [gambar/S6-bottomup.png](gambar/S6-bottomup.png) (265 Timer fired). Sesudah perbaikan: [gambar/After-S6-idle-overview.png](gambar/After-S6-idle-overview.png) dan [gambar/After-S6-timerfired.png](gambar/After-S6-timerfired.png) (11 Timer fired).
- **Akar masalah dan mekanismenya:** [public/js/promo.js](../public/js/promo.js) memakai dua setInterval 10 ms, sekitar 200 callback per detik. Hitung mundur membaca offsetWidth lalu menulis style.width, sehingga layout dihitung ulang di tiap callback. Teks berjalan menulis style.left, yang memicu Style, Layout, dan Paint di main thread 100 kali per detik. Akibatnya CPU tidak pernah sempat idle.
- **Kualitas yang terdampak (ISO/IEC 25010):** Resource utilization (CPU dan baterai) serta time behaviour karena frame lambat.
- **Perbaikan:** Commit 369d6d7. Hitung mundur memakai requestAnimationFrame dengan lebar garis berbasis persentase CSS. Teks berjalan memakai CSS animation dengan transform translateX yang bisa dijalankan di compositor.
- **Trade-off:** Centidetik diperbarui sekitar 60 kali per detik, bukan 100, dan perbedaannya tidak terlihat. Kecepatan teks berjalan sedikit berbeda dan disesuaikan lewat durasi animasi.
- **Hasil:** Frame lambat 271 menjadi 163 (turun 40%), frame terburuk 1260 ms menjadi 206 ms, Timer fired 265 menjadi 11. Target maksimal 2 frame lambat belum tercapai.

## 5. Dugaan yang ternyata keliru
- Catatan Rudi no. 4, bahwa perhitungan voucher sudah async sehingga aman. Keliru: async tanpa operasi asinkron sungguhan hanya membungkus hasil dalam promise yang langsung selesai, dan await menjadwalkannya sebagai microtask yang tetap memblokir rendering. Buktinya INP 1824 ms dan satu task 1,81 detik. Setelah async dihapus dan loop dipecah lewat task, INP menjadi 104 ms.
- Komentar di harga-promo.js ("Dibuat async supaya perhitungan tidak memblokir halaman") keliru karena alasan yang sama.
- Dugaan bahwa promo.js satu-satunya penyebab frame lambat saat idle hanya sebagian benar. Setelah diperbaiki, frame lambat masih 163 per 10 detik, jadi masih ada pekerjaan lain di main thread, misalnya pantauFrame milik alat ukur dan fungsi gambar.

## 6. Yang belum beres dan rekomendasi
- S6 masih 163 frame lambat per 10 detik (target maksimal 2). Sisa aktivitas main thread saat idle perlu diselidiki, termasuk kontribusi alat ukur itu sendiri.
- Long task terbesar pada S4 masih sekitar 632 ms. Perlu dicek apakah berasal dari render ulang 3000 kartu di luar loop yang sudah dipecah.

## 7. Pembagian kerja dan pernyataan penggunaan AI

### Pernyataan penggunaan AI
Alat yang digunakan: Antigravity, claude.
AI digunakan sebagai asisten coding untuk membantu pembacaan data trace DevTools, penulisan sintaks kode fixing, brainstorming dengan anggota tim, serta penyusunan draf narasi teknis di PREDIKSI.md dan LAPORAN.md. Seluruh perumusan hipotesis awal, perekaman trace di DevTools, dan pengujian dikerjakan secara mandiri oleh tiap anggota tim sesuai pembagian kerja.

### Pembagian kerja
- Ihsan: TK-1057 (P-02), TK-1070 (P-04), TK-1078 (P-05) dengan tes S0, S4, dan S6
- Anggota 2: TK-1041 (P-01), TK-1081 (P-06), pengecekan dugaan Rudi no. 1 dan 3 (P-08)
- Anggota 3: TK-1063 (P-03), TK-1044 dan TK-1052 (P-07)
