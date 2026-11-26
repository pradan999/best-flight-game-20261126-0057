# SUBMISSION — Langit Nusantara: Sky Courier

- **Bounty:** best-flight-game-20261126-0057 — "Make the best flight game"
- **Account:** @kaaa4051 (GitHub pradan999)
- **Game title:** Langit Nusantara — Sky Courier
- **Repository:** https://github.com/pradan999/best-flight-game-20261126-0057
- **Local commit:** `b384f7b18542239fb3d359816d83ad74f14cd1ae`
- **GitHub commit:** (repo belum terbuat — konektor GitHub gagal 3×,
  lihat catatan di bawah; isi setelah push berhasil)

## Ringkasan gameplay

Game penerbangan 2D canvas (pseudo-3D chase view) di atas kepulauan
Indonesia: laut, pulau, gunung berapi bersalju, dan tiga landasan.
Pesawat propeler merah-putih PK-LNG diterbangkan dengan keyboard;
HUD lengkap: tape kecepatan (kt) dan ketinggian (ft), kompas heading,
bola attitude, throttle, VSI, bahan bakar, kerusakan, lampu gear/flap,
dan panel misi dengan skor + waktu.

Tiga misi (pilih 1/2/3 atau klik, lalu ENTER):

1. **Cincin Langit** — lewati 6 cincin langit berurutan (+500/cincin,
   bonus waktu). Misi selesai di udara.
2. **Kurir Kepulauan** — lepas landas dari Landasan Utama, mendarat di
   Landasan Merapi (Pulau A), lepas landas lagi, mendarat di Landasan
   Karang (Pulau B). Skor dari kelembutan dan ketepatan pendaratan.
3. **Senja di Landasan** — satu approach saat senja; mendarat sehalus
   mungkin (skor dari vertical speed + posisi tengah landasan).

Model terbang: throttle, lift/stall, belokan dari bank, bahan bakar
yang terbakar (habis = meluncur), flap menurunkan stall speed, roda
wajib turun untuk mendarat; pendaratan keras merusak pesawat, menabrak
daratan/laut = crash. Suara mesin, angin, dan lonceng cincin
disintesis dengan WebAudio — tanpa file audio.

## Cara main

- **↑ / ↓** pitch, **← / →** belok, **Shift / Ctrl** throttle,
  **F** flap, **G** roda, **B** rem, **P** jeda, **M** suara,
  **R** ulang, **Esc** menu.
- Tanpa build step dan tanpa network: `node serve.ts`, buka
  http://localhost:8080, atau buka `game/index.html` dari server
  statis apa pun.

## Daftar file

- `main.ts` — entrypoint: salin `game/` + `screenshots/` ke `/output`,
  tulis `/output/dossier.json` (revisi 2: verifikasi output setelah tulis)
- `game/index.html`, `game/style.css`
- `game/src/config.js` — konstanta, misi, ring, landasan, pulau
- `game/src/random.js` — RNG deterministik + value noise
- `game/src/world.js` — tinggi terrain, proyeksi kamera, awan
- `game/src/flight.js` — model terbang
- `game/src/missions.js` — objektif + skor
- `game/src/render.js` — langit, mesh terrain, landasan, ring,
  pesawat, HUD, menu
- `game/src/audio.js` — suara sintetis WebAudio
- `game/src/input.js` — keyboard + mouse
- `game/src/main.js` — game loop + state machine
- `game/src/shots.js` — scene screenshot deterministik (`?shot=…`)
- `vendor/makefun-game.ts` — salinan kit, tanpa diubah
- `screenshots/` — 4 screenshot JPEG 1280×800 asli dari render game
  (`1-start.jpg` cover, `2-ring.jpg`, `3-approach.jpg`, `4-island.jpg`)
- `serve.ts`, `shots.json`, `README.md`, `LICENSE` (MIT)

## Verifikasi lokal (yang sudah dites)

- `node --check` semua file JS: OK.
- Play-test otomatis via CDP + keyboard sungguhan (13 cek): menu,
  takeoff dari landasan, lepas landas, bahan bakar berkurang, cincin
  terdeteksi (+500), pendaratan gear-down dihitung (skor 760),
  ditching di laut = crash, Esc ke menu, P jeda/lanjut, 53–61 fps —
  **semua lolos** (terakhir 26 Nov ~13:45 WIB).
- Bug yang ditemukan & diperbaiki saat play-test: `drawSky` throw
  saat horizon keluar layar (pitch menukik) membunuh loop rAF —
  diperbaiki (clamp + guard try/catch di loop); hard landing kini
  tetap dihitung sebagai pendaratan; koridor approach diratakan.
- `MAKEFUN_OUTPUT_DIR=out node main.ts` dijalankan 2×: output
  byte-identik (deterministik). Dossier 474.863 byte (< 1,5 MiB),
  teks source 80.917 byte (< 160 KiB, 12 file utuh, tanpa truncation),
  4 gambar, cover 0. Total `/output` 848 KB.
- Screenshot: 4 file JPEG 1280×800, masing-masing < 256 KiB,
  diambil dari render game sendiri di headless Chromium
  (Playwright cache), state deterministik via `?shot=`.

## Catatan untuk submit (parent)

- **BLOKIR: repo GitHub belum terbuat.** `create_repository` via
  konektor GitHub gagal 3× berturut-turut (26 Nov ~14:00 WIB) dengan
  pesan yang sama: "This tool call was dispatched but did not complete:
  the service restarted while it was running." Panggilan baca
  (status, get_file_contents) berfungsi normal; hanya write call yang
  gagal. Verifikasi setelah tiap percobaan: repo
  `pradan999/best-flight-game-20261126-0057` tetap 404.
  **Yang perlu dilakukan parent:** buat repo publik
  `best-flight-game-20261126-0057` (via browser GitHub atau ulangi
  konektor nanti), lalu push repo lokal ini
  (`git push -u origin master` — remote sudah diset ke
  https://github.com/pradan999/best-flight-game-20261126-0057.git).
  Commit lokal `b384f7b18542239fb3d359816d83ad74f14cd1ae` berisi semua
  file termasuk 4 screenshot JPEG.
- File teks ter-push via `push_files` juga **tidak bisa dipakai untuk
  screenshot** (konektor hanya menerima konten UTF-8) — push lewat git
  adalah satu-satunya jalan untuk JPEG; jangan submit sebelum
  screenshot ada di commit GitHub yang disubmit.
- Kit yang dipakai level 50, sedangkan situs make.fun sudah level 51
  (catatan dari `init`); parent mungkin perlu unduh ulang kit sebelum
  bundle/submit.
