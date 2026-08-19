# Evde Devam Etme Rehberi

Bu dosya, ev bilgisayarınızda yeni bir Claude Code oturumuyla bu projeye kaldığınız yerden devam edebilmeniz için gereken adımları içerir.

## 1) Projeyi indir

```powershell
git clone https://github.com/Fatal-IV/AdapterManager.git
cd AdapterManager
npm install
```

> Not: İlk `npm install` büyük bir indirme yapar (Electron ~100 MB). Eğer `ERR_SSL_CIPHER_OPERATION_FAILED` gibi bir hata alırsanız, önbellek bozulmuş olabilir — şu komutla çözülür:
> ```powershell
> npm cache clean --force
> npm install
> ```

## 2) Gerekli araçlar

- **Node.js** (bu bilgisayarda v24.18.0 kullanıldı, güncel bir LTS sürüm de çalışır)
- **Inno Setup 7** — installer derlemek için (`scripts\build.ps1` varsayılan olarak `C:\Program Files\Inno Setup 7\ISCC.exe` yolunu bekler)
- **GitHub CLI (`gh`)** — release/PR işlemleri için, `gh auth login` ile giriş yapılmalı

## 3) Claude Code eklentileri (plugin) ve skill'leri

Bu oturumda aşağıdaki plugin'ler etkindi. Ev bilgisayarınızdaki Claude Code'da aynılarını kurmak için `~/.claude/settings.json` dosyasına şu blokları ekleyin (veya Claude Code içinde `/plugin marketplace add <repo>` ve `/plugin install <isim>@<marketplace>` komutlarını kullanın):

```json
{
  "enabledPlugins": {
    "superpowers@claude-plugins-official": true,
    "claude-code-setup@claude-plugins-official": true,
    "frontend-design@claude-plugins-official": true,
    "code-review@claude-plugins-official": true,
    "ponytail@ponytail": true,
    "claude-mem@thedotmack": true,
    "ui-theme-designer@claude-plugins-official": true,
    "andrej-karpathy-skills@karpathy-skills": true
  },
  "extraKnownMarketplaces": {
    "thedotmack": { "source": { "source": "github", "repo": "thedotmack/claude-mem" } },
    "ponytail": { "source": { "source": "github", "repo": "DietrichGebert/ponytail" } },
    "karpathy-skills": { "source": { "source": "github", "repo": "forrestchang/andrej-karpathy-skills" } }
  }
}
```

`claude-plugins-official` ile başlayanlar Claude Code'un dahili/resmi marketplace'inden geliyor, ayrıca bir marketplace eklemeye gerek yok — sadece `enabledPlugins` listesine eklemeniz yeterli. Diğer üçü (`thedotmack`, `ponytail`, `karpathy-skills`) için yukarıdaki `extraKnownMarketplaces` girdileri gerekli.

En kolay yol: Claude Code'u kapatıp bu JSON alanlarını mevcut `~/.claude/settings.json` dosyanıza (varsa mevcut içerikle birleştirerek) elle ekleyip yeniden başlatmak.

### Elle kurulmuş skill'ler

Bu üç skill bir plugin marketplace'inden değil, doğrudan `~/.claude/skills/` klasörüne kurulmuş durumda ve yukarıdaki JSON'a dahil değil:

- `apple-design` — Apple tarzı arayüz/animasyon tasarım rehberi
- `find-skills` — yeni skill keşfetme/kurma yardımcısı
- `graphify` — herhangi bir klasörü bilgi grafiğine çeviren araç

Bunları evde de kullanmak isterseniz en pratik yol, `~/.claude/skills/apple-design`, `~/.claude/skills/find-skills`, `~/.claude/skills/graphify` klasörlerini (bu bilgisayardan) bir USB/OneDrive ile ev bilgisayarınızdaki aynı yola kopyalamak. Alternatif olarak evdeki Claude Code oturumunda `find-skills` skill'i kurulu değilse önce onu (varsa resmi bir kaynaktan) kurup, üzerinden `apple-design`/`graphify` için tekrar arama yapabilirsiniz.

Global talimatlarınız (`~/.claude/CLAUDE.md`) da graphify'ı `/graphify` komutunda otomatik devreye sokan şu notu içeriyor, isterseniz onu da kopyalayın:

```markdown
# graphify
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.
```

## 4) Projenin şu anki durumu

- Spec: `docs/superpowers/specs/2026-08-19-adaptermanager-design.md`
- Plan: `docs/superpowers/plans/2026-08-19-adaptermanager-implementation.md` (13 görevin tamamı tamamlandı)
- Tüm testler: `npm test` → 31/31 geçiyor
- Uygulamayı çalıştırmak için: `npm start` (adaptör aç/kapat gibi işlemler için terminali **yönetici olarak** açın)
- Installer üretmek için: `powershell -File scripts\build.ps1` (çıktısı `installer\Output\AdapterManagerSetup.exe`)
- İlk yayın: [v0.1.0](https://github.com/Fatal-IV/AdapterManager/releases/tag/v0.1.0)

Son oturumda yapılan tasarım değişiklikleri (menü çubuğu kaldırma, arka plan gradyanı, kalıcı sidebar, tam sayfa adaptör detay ekranı + tanılama, ayrı düzenleme penceresi) commit edilip GitHub'a push edildi — `git pull` sonrası hepsi hazır olacak.

## 5) Kaldığımız yer / sonraki adımlar

- Yeni installer'ı kurup UAC ile açılışı ve "Düzenle" butonunun ayrı pencere açtığını gerçek makinede test etmek
- Wi-Fi'ye gerçekten bağlanmayı ve adaptör aç/kapatı elevated modda denemek
- Offline güncelleme yolunu (`\\ab30200-0111\BİLGİ İŞLEM\Umut\AdapterManager\Güncellemeler`) ofis ağındayken doldurmak
