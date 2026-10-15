# Laporan audit performa dan interaksi TokoKilat

Tim: HebatKenapa  Anggota: Ihsan Fauzi (241524048), Fariz Dhifa Fakhriza (241524040)  Tanggal: 15 Oktober 2026
Panjang maksimal setara 6 halaman (tidak termasuk lampiran gambar).

## 1. Ringkasan eksekutif (maks. 150 kata)
Laporan audit performa halaman flash sale TokoKilat setelah perbaikan S0, S1, S4, dan S6. Masalah freeze 1,8 detik saat klaim voucher (S4) diatasi dengan pemecahan loop menjadi chunk kecil (INP turun dari 1824 ms ke 104 ms). Halaman loncat saat dimuat (S0) diselesaikan dengan reservasi ruang banner sejak awal (CLS turun dari 0,473 ke 0,003). Masalah ketikan telat dan hang di pencarian (S1) diperbaiki lewat debounce 250 ms, memoize NumberFormat, dan DocumentFragment, memangkas INP dari 592 ms ke 64 ms (turun 89,2%) serta menghilangkan seluruh long task saat mengetik. Pemuatan 3000 gambar yang membanjiri antrean jaringan (S0) diselesaikan lewat loading lazy bawaan, memangkas permintaan awal dari 3000 menjadi 6–8 gambar saja (turun 99,8%). Frame lambat saat idle (S6) berkurang dari 271 ke 163 frame lewat CSS transform pada compositor.

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
| S0 | Jumlah permintaan gambar dalam 10 dtk pertama | 3000 | 6 | sebanding dengan yang terlihat | Ya |
| S1 | INP | 592 ms | 64 ms | <= 200 ms | Ya |
| S1 | Long task terlama | 471 ms | 349 ms | <= 100 ms | Belum |
| S2 | INP | | | <= 200 ms | |
| S3 | Jumlah pesanan dari 3 klik | | | 1 | |
| S4 | INP / progres tergambar bertahap? | 1824 ms / tidak | 104 ms / ya | <= 200 ms, bertahap | Ya |
| S5 | Frame > 50 ms per 10 dtk | | | <= 2 | |
| S6 | Frame > 50 ms per 10 dtk | 271 | 163 | <= 2 | Belum |

Pendukung S0: permintaan gambar dalam 10 detik pertama turun dari 3000 menjadi 6 (turun 99,8%), antrean jaringan bersih dan gambar di viewport tampil instan.
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

### T-04: Ketikan telat dan hang pada pencarian
- **Tiket terkait:** TK-1041
- **Gejala bagi pengguna:** Mengetik kata di kolom cari hurufnya lambat muncul dan layar seperti hang.
- **Bukti:** [gambar/S1-longtask-overview.png](gambar/S1-longtask-overview.png) menunjukkan 12 Long Task beruntun (long task terlama 471 ms, INP 593 ms). [gambar/S1-bottomup.png](gambar/S1-bottomup.png) menunjukkan Layout 40,4% (1.964 ms), renderProduk 39,1% (1.898 ms), formatRupiah 275 ms, dan lacak SDK terpanggil di tiap ketukan. Sesudah perbaikan: [gambar/After-S1-longtask-overview.png](gambar/After-S1-longtask-overview.png) menunjukkan track interactions bersih dan INP hijau 62 ms.
- **Akar masalah dan mekanismenya:** Di [public/js/pencarian.js](../public/js/pencarian.js), event input langsung memanggil terapkanSaringan tanpa debounce di tiap ketukan. Di setiap huruf, seluruh DOM 3000 kartu dihancurkan dan dibuat ulang (kisi.innerHTML = ''), formatRupiah menginstansiasi objek Intl.NumberFormat baru ribuan kali, dan SDK Lacak melakukan loop 2 juta iterasi.
- **Kualitas yang terdampak (ISO/IEC 25010):** Time behaviour (respons ketik 592 ms di atas ambang) dan Interaction capability (operability dan user engagement).
- **Perbaikan:** Commit a3a3008. Menambahkan debounce 250 ms pada input cari, memanfaatkan kembali satu objek Intl.NumberFormat di tingkat modul util.js, mencadangkan string normalisasi produk, dan merender kartu lewat DocumentFragment.
- **Trade-off:** Hasil filter muncul dengan jeda 250 ms setelah ketukan terakhir. Jeda ini alami bagi mata manusia dan menghilangkan freezing total.
- **Hasil:** INP turun dari 592 ms ke 64 ms (turun 89,2%), long task selama pengetikan hilang (0 kali), dan ketikan terasa instan.

### T-05: Pemuatan 3000 gambar sekaligus membanjiri antrean jaringan
- **Tiket terkait:** TK-1081
- **Gejala bagi pengguna:** Gambar produk lama muncul (kotak abu-abu) dan kuota internet cepat habis.
- **Bukti:** Baseline S0 menunjukkan 3000 permintaan gambar dikirim bersamaan saat halaman dimuat. Sesudah perbaikan: [gambar/After-S0-network-gambar.png](gambar/After-S0-network-gambar.png) membuktikan hanya 8 request gambar yang diminta saat halaman dibuka (sesuai viewport layar).
- **Akar masalah dan mekanismenya:** Di [public/js/katalog.js](../public/js/katalog.js), elemen img dibuat dengan langsung mengisi properti src tanpa loading="lazy". Browser membatasi ~6 koneksi paralel ke server, sehingga 3000 gambar menumpuk di antrean jaringan. Gambar di area viewport pengguna ikut tertahan di belakang ribuan antrean gambar lainnya.
- **Kualitas yang terdampak (ISO/IEC 25010):** Resource utilization (kuota boros) dan Time behaviour (gambar lama muncul).
- **Perbaikan:** Commit c5b6323. Menambahkan atribut loading="lazy" dan decoding="async" pada elemen gambar produk.
- **Trade-off:** Bila pengguna menggulir sangat cepat, kotak abu-abu mungkin tampak sekilas sebelum gambar selesai diunduh.
- **Hasil:** Permintaan gambar dalam 10 detik pertama turun dari 3.000 menjadi 6-8 gambar (turun >99,7%), antrean jaringan bersih, dan kuota pengguna hemat drastis.

## 5. Dugaan yang ternyata keliru
- Catatan Rudi no. 1, bahwa biang kerok utama adalah loop bersarang di kategori.js (O(n²)) dan querySelectorAll di dalam loop. Keliru: kategori unik pada data hanya berjumlah 8, sehingga loop bersarang hanya menghasilkan 56 iterasi (memakan waktu < 0,5 ms di runtime). Ini bukan bottleneck utama halaman sama sekali. Rudi mendiagnosis berdasarkan bentuk sintaks tanpa mengukur ukuran data nyata.
- Catatan Rudi no. 2, bahwa API produk dan server backend lemot. Keliru: waktu respons API produk hanya ~180 ms dan server merespons gambar dengan wajar (60-300 ms). Masalah sebenarnya adalah frontend yang secara serakah meminta 3.000 gambar sekaligus tanpa lazy loading.
- Catatan Rudi no. 3, bahwa urutkanGelembung (bubble sort) di util.js harus diganti quicksort. Keliru: data yang diurutkan oleh bubble sort di pasangKaki hanya 12 merek populer, yang hanya memakan waktu 0,3 ms. Pada dataset sekecil itu, perbedaan bubble sort dan quicksort tidak terukur di flame chart.
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
- Fariz Dhifa Fakhriza (241524040): TK-1041 (P-01), TK-1081 (P-06), pengecekan dugaan Rudi no. 1 dan 3 (P-08)
- Anggota 3: TK-1063 (P-03), TK-1044 dan TK-1052 (P-07)
