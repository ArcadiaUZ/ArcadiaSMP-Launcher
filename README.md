# ArcadiaSMP Launcher

ArcadiaSMP serveri uchun **ochiq kodli** Minecraft launcher. Electron + Node.js,
`@xmcl/core` va `@xmcl/installer` yadrosi asosida qurilgan.

- Manba kodi: <https://github.com/ArcadiaUZ/ArcadiaSMP-Launcher>
- Releases: <https://github.com/ArcadiaUZ/ArcadiaSMP-Launcher/releases>
- Litsenziya: MIT

## Nega kod ochiq?

Launcher ichida yashirin buyruqlar, miner, token o‘g‘rilash yoki boshqa zararli
kod yo‘qligini tekshirish uchun **butun manba kodi ochiq**. Istalgan odam kodni
o‘qishi, o‘zi build qilishi va release’dagi installer bilan solishtirishi mumkin.

Build natijasi `electron-builder` bilan yig‘iladi; barcha qadamlar
`.github/workflows/build.yml` faylida ko‘rinadi.

## Yuklab olish

Eng so‘nggi installer:

<https://github.com/ArcadiaUZ/ArcadiaSMP-Launcher/releases/latest>

Fayl nomi: `ArcadiaSMP-Launcher-<versiya>-setup.exe`

### Auto-update

`0.2.7` dan boshlab launcher:

1. Yangilanish ma’lumotini `update/latest.yml` dan tez oladi (raw GitHub).
2. Installerni tez GitHub mirror’laridan yuklaydi; yakuniy fayl SHA-512 bilan
   tekshiriladi.
3. Eski installer keshlangan bo‘lsa, faqat o‘zgargan bloklarni yuklaydi
   (blockmap differential). Masalan, `0.2.6 → 0.2.7` farqi ~3.1 MB.
4. `Sozlamalar → Launcher haqida → Yangilash` bilan qayta ishga tushib
   yangilanadi.

> **Muhim:** `0.2.6` dagi eski updater hali GitHub release’lariga bog‘liq.
> Shu sababli `0.2.6` foydalanuvchilari `0.2.7` ni **bir marta qo‘lda**
> o‘rnatishi tavsiya etiladi. Keyingi versiyalar tez va differensial keladi.

### Skin, model va cape

Launcher va veb-panelda:

- 64×64 skinning overlay qatlamlari (shapka, kurtka, yeng, shim) ko‘rsatiladi;
- Klassik va Slim model tanlanadi;
- 64×32 cape yuklanadi va o‘yinda ko‘rinadi;
- bo‘sh overlay qatlamlarini asosiy qatlamdan to‘ldirish mumkin.

## Talablar

- Windows 10/11 (64-bit)
- Java 25
- Internet — Minecraft 26.3 klientini, modlarni va launcher yangilanishlarini
  yuklash uchun
- ArcadiaSMP veb-paneli — login, skin va server holati uchun

## Manbadan ishga tushirish

```bat
git clone https://github.com/ArcadiaUZ/ArcadiaSMP-Launcher.git
cd ArcadiaSMP-Launcher
npm ci
npm start
```

Installer yig‘ish:

```bat
npm run dist
```

Natija: `dist\ArcadiaSMP-Launcher-<versiya>-setup.exe` va `dist\latest.yml`.

## Yangi versiya chiqarish

1. `package.json` dagi `version` ni oshiring (masalan `0.2.4` → `0.2.5`).
2. Kodni commit qiling va `main` ga push qiling.
3. Tag yarating va push qiling:

   ```bat
   git tag v0.2.5
   git push origin v0.2.5
   ```

4. GitHub Actions `.github/workflows/build.yml` orqali installerni yig‘adi va
   `v0.2.5` release’iga `latest.yml`, `.exe` va `.blockmap` fayllarini yuklaydi.
5. O‘rnatilgan launcher keyingi ishga tushishida yangilanishni ko‘radi.

## Arxitektura

```text
electron/
  main.js          # oyna, IPC, CSP, protocol, screenshot rejimi
  preload.js       # contextBridge API
  config.js        # launcher.json, Java aniqlash
  arcadia.js       # auth/status/skin API klienti (cookie + CSRF)
  minecraft.js     # @xmcl installer/launch, instanslar, kontent, iconlar
  modrinth.js      # Modrinth search/versions/install
  default-pack.js  # Arcadia default Fabric to‘plamini yig‘ish
  default-pack.json
  default-options.txt
  updater.js       # electron-updater: GitHub release’lardan auto-update
renderer/
  index.html
  assets/css/app.css
  assets/js/app.js
  assets/js/icons.js
  assets/js/skinview.js
```

## Xavfsizlik

- `nodeIntegration: false`, `contextIsolation: true`
- Qat’iy CSP
- IPC kanallari whitelist qilingan
- Tashqi havolalar faqat `http(s)`
- Modrinth fayllari faqat `cdn.modrinth.com` / `cdn-raw.modrinth.com` dan
- Launcher parolni saqlamaydi; login ArcadiaCore `/api/auth/login` orqali
- Auto-update faqat shu public repo release’laridan oladi (GitHub provider)

## Versiyalar

### 0.2.5

- Modrinth o‘rnatish tugmasidagi ikonka tuzatildi: endi `!` o‘rniga yuklash
  strelkasi ko‘rinadi.
- 3D skin yon tomonlari o‘yindagi yo‘nalishga moslandi (web va launcher).

### 0.2.4

- Auto-update oqimi GitHub release orqali to‘liq tekshirildi.
- `0.2.3` dan `0.2.4` ga avtomatik yangilanish ishlaydi.
- `updater.js` da holat loglari qo‘shildi (diagnostika uchun).
- O‘yin ishlayotganda yangilash bloklanadi — avval o‘yinni yopish kerak.

### 0.2.3

- `electron-updater` qo‘shildi.
- `Sozlamalar → Launcher haqida` da yangilanish holati, progress va
  `Yangilash` tugmasi.
- GitHub Releases’dan avtomatik tekshirish va yuklash.
- Manba kodi ochiq: <https://github.com/ArcadiaUZ/ArcadiaSMP-Launcher>

### 0.2.2

- Fabric `lwjgl.dll` natives fix.
- Default 26.3 mod pack, Modrinth pagination.

### 0.2.1

- Skin va server holati tuzatishlari.

### 0.2.0

- Birinchi ommaviy build.
