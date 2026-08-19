# NetworkAdapterManager — Tasarım Belgesi

Tarih: 2026-08-19

## Amaç

Windows ağ adaptörlerini (Ethernet, Wi-Fi) tek bir masaüstü uygulamasından yönetmek: aç/kapat, DNS/IP/proxy düzenleme, Wi-Fi tarama/bağlanma, Ethernet↔Wi-Fi arasında otomatik geçiş ("Otomatik Mod"). Uygulama admin yetkisiyle çalışır, çevrimdışı çalışabilir, hem çevrimiçi (GitHub Releases) hem çevrimdışı (ağ paylaşımı) güncelleme kanalını destekler.

Not: Projenin başında `C:\Users\ab325336\Desktop\IK Browser\İnternet` dizininde aynı işlevi gören olgun bir WPF/.NET 8 uygulaması (v3.10.1) bulunduğu tespit edildi. Kullanıcı, mevcut uygulamayı temel almak yerine **sıfırdan Electron ile başlamayı** tercih etti — bu belge o kararı yansıtır.

## Genel Mimari

- **Electron main process** (Node.js, admin yetkili): PowerShell cmdlet'lerini `child_process` ile çalıştırır (`Get-NetAdapter`, `Enable-NetAdapter`/`Disable-NetAdapter`, `Set-DnsClientServerAddress`, `netsh interface ip`, `netsh wlan`), çıktıyı JSON'a çevirir. Tray icon + Otomatik Mod arka plan mantığı, güncelleyici modülü, tek instance kilidi (`app.requestSingleInstanceLock`) burada yaşar.
- **Renderer process**: saf HTML/CSS/JS (framework yok). `preload.js` + `contextBridge` üzerinden tanımlı IPC fonksiyonlarını çağırır.
- **Güvenlik:** `nodeIntegration: false`, `contextIsolation: true`. Renderer'ın doğrudan `child_process`/dosya sistemi erişimi yoktur.

## Ekranlar ve Bileşenler

- **Ana ekran:** Otomatik Mod hero kartı (üstte) + adaptör kartları listesi (ad, tür ikonu, durum noktası, MAC, bağlı ağ, aç/kapat switch, chevron).
- **Sol sidebar (hamburger ile açılır, soldan slide-in):** arama kutusu + Tümü/Aktif/Pasif filtre segmented control + tüm adaptörlerin kompakt listesi. Bir adaptöre tıklamak sidebar'ı kapatıp detay panelini açar.
- **Detay paneli (sağdan slide-in sheet):** IP/DNS sekmesi (Otomatik/DHCP veya Manuel — IP/Subnet/Gateway/DNS alanları), Proxy sekmesi (Kapalı/Otomatik Algıla/Manuel), Wi-Fi adaptörlerinde ek "Ağlar" sekmesi (tarama + SSID listesi + şifre girip bağlanma).
- **Ayarlar ekranı:** tema (Açık/Koyu/Sistem), Windows başlangıcında otomatik başlatma, güncelleme kanalı bilgisi + manuel "Güncellemeleri Denetle" butonu. (Dil seçimi yok — sistem diline göre otomatik TR/EN.)
- **Tepsi (tray) menüsü:** adaptör durum özeti, Otomatik Mod aç/kapat, "Pencereyi Göster", "Güncellemeleri Denetle", Çıkış.

## Dil (i18n)

Arayüz dili `app.getLocale()` (sistem dili) baz alınarak otomatik TR/EN arasında seçilir. Kullanıcıya manuel dil seçimi sunulmaz. Desteklenmeyen sistem dillerinde İngilizce'ye düşülür (fallback).

## Otomatik Mod ve Tray

Uygulama sistem tepsisinde her zaman aktif kalır (pencere kapatılsa da arka planda çalışmaya devam eder), Windows başlangıcında otomatik başlar (`app.setLoginItemSettings`). Otomatik Mod açıkken, adaptör durumu polling (ör. 3 saniyede bir `Get-NetAdapter`) ile izlenir: Ethernet bağlanınca Wi-Fi adaptörleri devre dışı bırakılır, Ethernet bağlantısı kesilince Wi-Fi tekrar etkinleştirilir (ve tam tersi).

## IPC Sözleşmesi (özet)

`preload.js` üzerinden yalnızca şu fonksiyonlar açığa çıkar: `adapters.list()`, `adapters.toggle(id)`, `adapters.setIp(id, config)`, `adapters.setProxy(id, config)`, `wifi.scan(id)`, `wifi.connect(id, ssid, password)`, `autoMode.get()/set(bool)`, `settings.get()/set(partial)`, `updater.check()/apply()`. Her biri main process'te bir IPC handler'a karşılık gelir ve PowerShell komutuna çevrilir.

## Güncelleme Mekanizması (özel/custom)

- **Çevrimiçi:** `GET https://api.github.com/repos/Fatal-IV/AdapterManager/releases/latest` ile en son tag çekilir, `app.getVersion()` ile karşılaştırılır.
- **Çevrimdışı:** `\\ab30200-0111\BİLGİ İŞLEM\Umut\AdapterManager\Güncellemeler` yolunda bir `latest.json` (`{ "version": "...", "file": "AdapterManagerSetup.exe" }`) + installer `.exe` aranır. Yol erişilemezse sessizce atlanır.
- Açılışta otomatik kontrol: önce çevrimiçi, başarısız/erişilemezse çevrimdışı. Ayrıca Ayarlar'dan manuel kontrol.
- Yeni sürüm bulununca kullanıcı onayı istenir → installer indirilir → `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART` ile sessiz kurulum → uygulama kapanıp yeniden açılır.

## GitHub

Repo: `Fatal-IV/AdapterManager`, **public**. Her sürüm bir GitHub Release + installer `.exe` asset'i olarak yayınlanır (release oluşturma bu oturumda `gh` CLI ile yapılacak).

## Paketleme

Electron uygulaması `electron-builder --dir` (yalnızca dizin paketleme, NSIS hedefi kullanılmaz) ile paketlenir; Inno Setup 7 script'i (`installer.iss`, `PrivilegesRequired=admin`) bu dizini alıp installer üretir.

## Hata Yönetimi

- PowerShell komutu admin yetkisi olmadan/başarısız çalışırsa: kullanıcıya anlaşılır Türkçe/İngilizce hata mesajı gösterilir (ham stderr değil).
- Wi-Fi bağlantı hatası (yanlış şifre, zaman aşımı): net "bağlanılamadı" mesajı.
- Güncelleme kaynaklarına (GitHub API, ağ yolu) erişilemezse süreç sessizce ertelenir, kullanıcı rahatsız edilmez.

## Test Yaklaşımı

Framework yok (ponytail ilkesi): PowerShell çıktısı JSON parse edicileri için küçük Node `assert` tabanlı script testleri. Gerçek adaptör aç/kapat ve Wi-Fi bağlantısı gerçek makinede manuel test edilir.

## Tasarım Dili

macOS (translucent sheet, slide-in panel, sistem açık/koyu tema) ile Samsung One UI (yuvarlak kartlar, segmented control, sıcak/net accent) karışımı. Accent renk mavi (`#1266F1` açık / `#4D94FF` koyu tema). Onaylanan mockup: `docs/superpowers/specs/2026-08-19-adaptermanager-mockup.html`.

## Kapsam Dışı (bu sürüm için)

- Native Node addon (PowerShell yeterli görüldü)
- electron-updater/NSIS (Inno Setup ile uyumsuz, custom updater tercih edildi)
- Çoklu dil seçici arayüzü (yalnızca otomatik sistem dili)
