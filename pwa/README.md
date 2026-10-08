# Jízdy a směny – bezplatná iPhone PWA

Připravená statická webová aplikace pro publikaci na HTTPS (Vercel, Netlify nebo GitHub Pages). **Nejde o zástupce Expo Go**, po instalaci běží samostatně.

## Funkce
- Continental Barum Otrokovice: směnové skupiny A, B, C, D v 28denním cyklu (podklad září a říjen 2026). Osobní přesčasy skupiny C se automaticky nepromítají.
- Týdenní plán řidičů Já / Tade / Fany, potvrzení skutečného řidiče, 7denní střídání.
- Zápisy Hanes a Vorel za 90 či 45 Kč s 12hodinovým zámkem, jednorázový host.
- Zpětný zápis včetně 0 Kč, úprava částky, potvrzené storno, zrušení řidiče.
- Denní i měsíční historie, finance, férovost, archiv.
- Rozkliknutí Hanese, Vorla i hostů ve Financích: seznam jednotlivých jízd podle data, výběr zaškrtávacími políčky a hromadné označení **zaplaceno / nezaplaceno**. Odděleně se ukazuje předepsáno, zaplaceno a zbývá doplatit.
- Informace o úhradě se zapisuje po jednotlivých jízdách a ukládá se v JSON záloze. Stornované a bezplatné jízdy nelze omylem označit jako dluh.
- IndexedDB s lokální záložní cestou do localStorage, export/import JSON.
- Service Worker pro offline provoz po prvním načtení, vlastní SUV ikona na ploše iPhonu (standardní a maskovatelná), responzivní rozhraní.

## Instalace na iPhone
1. Nasadit **obsah této složky** na hosting s HTTPS (např. Vercel).
2. Otevřít výslednou HTTPS adresu v **Safari**.
3. Klepnout na **Sdílet → Přidat na plochu → Přidat**.
4. Otevřít vzniklou aplikaci z plochy iPhonu.

## Pozor na data
- Tato PWA používá **vlastní lokální úložiště** iPhonu; starší SQLite data z Expo Go se sama nepřenesou.
- Zálohy aplikace ukládá výhradně uživatel do JSON. Import umí pouze JSON exportovaný touto webovou verzí.
- Nemá přihlášení, serverovou databázi ani synchronizaci mezi zařízeními. Není vhodná pro současné zapisování z několika různých telefonů.
- Pokud vymažete data Safari/aplikace, můžete přijít o záznamy; používejte **Nastavení → Stáhnout zálohu**.
- 28denní cyklus je odhad z referenčních snímků. Firemní změny a přesčasy se nepromítají automaticky.

## Nasazení přes stávající GitHub Codespace
V kořeni repozitáře rozbalit PWA do samostatné složky `pwa/`. Potom uložit a odeslat `pwa/` do GitHub repozitáře. Na Vercelu vytvořit projekt z repo `kubiino-afk/Jizdy-a-smeny-` a nastavit **Root Directory `pwa`**, Framework: Other; build příkaz není potřeba. Vercel nasadí statické soubory.

## Technické
Vše je čisté HTML/CSS/JS, bez npm, API klíčů a placených služeb. Testy: `node --test tests/core.test.cjs`. V reálném nasazení servisní worker vyžaduje HTTPS nebo localhost.

## Ikona aplikace V4
- `assets/icon-180.png` pro **Přidat na plochu** v Safari na iPhonu.
- `assets/icon-192.png` a `assets/icon-512.png` pro PWA manifest (`purpose: any`).
- `assets/icon-maskable-192.png` a `assets/icon-maskable-512.png` s bezpečným okrajem pro maskovací ořezy (`purpose: maskable`).
- `assets/icon-1024.png` a `assets/icon-master-1254.png` jako obrazové zdroje ve vysokém rozlišení.
- `assets/favicon-32.png` jako ikona webové záložky.
- Při aktualizaci starší instalace iOS může být potřeba odstranit původní ikonu z plochy a přidat PWA znovu, aby se načetl nový obrázek. Předtím **zálohuj data**.
