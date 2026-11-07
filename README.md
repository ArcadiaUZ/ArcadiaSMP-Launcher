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

`0.2.3` dan boshlab launcher:

1. Ishga tushganda va har 6 soatda GitHub release’larini tekshiradi.
2. Yangi versiya bo‘lsa, installerni fonda yuklaydi.
3. `Sozlamalar → Launcher haqida → Yangilash` tugmasi bilan qayta ishga tushib
   yangilanadi.

> **Muhim:** hozir o‘rnatilgan `0.2.2` da auto-update kodi yo‘q. Shuning uchun
> `0.2.3` ni **bir marta qo‘lda** o‘rnatish kerak. Keyingi versiyalar avtomatik
> keladi.

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

## Versiya 0.2.3

- `electron-updater` qo‘shildi.
- `Sozlamalar → Launcher haqida` da yangilanish holati, progress va
  `Yangilash` tugmasi.
- GitHub Releases’dan avtomatik tekshirish va yuklash.
- Manba kodi ochiq: <https://github.com/ArcadiaUZ/ArcadiaSMP-Launcher>

## Oldingi versiyalar

- `0.2.2` — Fabric `lwjgl.dll` natives fix, default 26.3 mod pack, Modrinth
  pagination.
- `0.2.1` — skin va server holati tuzatishlari.
- `0.2.0` — birinchi ommaviy build.
