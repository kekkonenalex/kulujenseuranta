# Kulun kirjaus iPhonen pikakomennolla

Tällä ohjeella kirjaat kulun avaamatta kulujenseuranta-sovellusta: kotinäytön widgetistä,
Ohjauskeskuksesta, koputtamalla puhelimen takakantta tai Sirillä.

Pikakomento ei kirjaudu sovellukseen vaan käyttää **laitetunnistetta**, joka luodaan
sovelluksen asetuksista. Tunnisteella voi vain lisätä kuluja — ei lukea kuluja, ei muokata
eikä poistaa mitään.

> **Miksi ei oikeaa widgettiä?** iPhonen kotinäytön widget vaatii natiivin WidgetKit-laajennuksen,
> jota selainpohjainen sovellus ei voi tarjota. Pikakomennot-sovelluksen widget on lähin
> vastine: siinä oleva painike ajaa pikakomennon suoraan.

## Mitä tarvitset

| Tieto | Arvo |
|---|---|
| Palvelimen osoite | `https://wqibkufakgdmzcovmdos.supabase.co` |
| API-avain (`apikey`) | `sb_publishable_f1A4zFIkN6pwnm8MRyk_1g_Dbt194dP` |
| Laitetunniste | luodaan vaiheessa 1 |

API-avain on julkinen eikä ole salaisuus — se on sama joka on sovelluksen koodissa.
**Laitetunniste sen sijaan on salaisuus:** se pitää sinut kirjautuneena pikakomennossa.

## Vaihe 1: luo laitetunniste

1. Avaa sovellus: https://kekkonenalex.github.io/kulujenseuranta/
2. **Asetukset → Pikakomento (iPhone)**
3. Kirjoita laitteen nimi (esim. `iPhone 14`) ja paina **Luo**
4. Tunniste näytetään **vain kerran**. Paina *Kopioi leikepöydälle*.

Tee tämä vaihe suoraan puhelimella, niin tunniste on valmiiksi leikepöydällä kun rakennat
pikakomennon. Tietokantaan tallennetaan vain tunnisteen tiiviste, joten sitä ei voi katsoa
jälkikäteen — kadonneen tilalle luodaan uusi ja vanha poistetaan.

## Vaihe 2: rakenna pikakomento

Avaa **Pikakomennot**-sovellus → **+** → nimeä pikakomento `Kirjaa kulu`.

Lisää toiminnot tässä järjestyksessä. Suluissa on toiminnon englanninkielinen nimi, jolla sen
löytää hakukentästä myös silloin kun puhelimen kieli on eri.

**1. Teksti** (Text)
Liitä laitetunniste tekstikenttään.

**2. Aseta muuttuja** (Set Variable)
Nimi: `Tunniste`. Arvo: edellisen toiminnon *Teksti*.

**3. Kysy syötettä** (Ask for Input)
- Syötteen tyyppi: **Luku** (Number)
- Kysymys: `Summa €`

**4. Aseta muuttuja** (Set Variable)
Nimi: `Summa`. Arvo: *Annettu syöte*.

**5. Hae URL-osoitteen sisältö** (Get Contents of URL)
- URL: `https://wqibkufakgdmzcovmdos.supabase.co/rest/v1/rpc/list_expense_categories`
- Avaa *Näytä lisää* ja aseta:
  - Menetelmä: **POST**
  - Otsakkeet (Headers):
    - `apikey` = `sb_publishable_f1A4zFIkN6pwnm8MRyk_1g_Dbt194dP`
    - `Content-Type` = `application/json`
  - Pyynnön runko: **JSON**
    - avain `p_token` (teksti) = muuttuja `Tunniste`

**6. Hae sanakirjan arvo** (Get Dictionary Value)
Hae arvo avaimelle `categories` sanakirjasta *Hae URL-osoitteen sisältö*.

**7. Valitse listasta** (Choose from List)
Lista: edellinen toiminto. Otsikko: `Kategoria`.

**8. Aseta muuttuja** (Set Variable)
Nimi: `Kategoria`. Arvo: *Valittu kohde*.

**9. Hae URL-osoitteen sisältö** (Get Contents of URL)
- URL: `https://wqibkufakgdmzcovmdos.supabase.co/rest/v1/rpc/log_expense`
- Menetelmä: **POST**
- Otsakkeet: samat kuin kohdassa 5
- Pyynnön runko: **JSON**
  - `p_token` (teksti) = `Tunniste`
  - `p_amount` (luku) = `Summa`
  - `p_category` (teksti) = `Kategoria`

**10. Hae sanakirjan arvo** (Get Dictionary Value)
Avain `ok` edellisen toiminnon tuloksesta.

**11. Jos** (If) — *Ehto: on tosi*
- **Jos tosi:** *Näytä ilmoitus* (Show Notification), teksti esim.
  `Kirjattu ✓` ja mukaan muuttujat `Summa` ja `Kategoria`
- **Muuten:** *Näytä ilmoitus*, tekstinä *Hae sanakirjan arvo* avaimella `error`
  kohdan 9 tuloksesta

Tallenna.

### Halutessasi: jäljellä oleva budjetti ilmoitukseen

Vastaus sisältää myös kentän `remaining_cents` (budjettia jäljellä sentteinä, tyhjä jos
kategorialla ei ole budjettia) sekä `month_spent_cents` (kuukauden kulutus tässä kategoriassa).
Voit hakea sen *Hae sanakirjan arvo* -toiminnolla ja lisätä ilmoitukseen — jaa sadalla, niin
saat eurot.

## Vaihe 3: testaa

Aja pikakomento Pikakomennot-sovelluksesta. Kirjoita pieni summa, valitse kategoria ja katso
että ilmoitus sanoo kirjatun. Avaa sitten sovellus ja tarkista että kulu näkyy Kulut-välilehdellä
oikealla päivämäärällä. Voit poistaa testikirjauksen sovelluksesta normaalisti.

## Vaihe 4: nopeat laukaisimet

**Kotinäytön widget (suositus).** Paina kotinäyttöä pitkään → **+** → hae *Pikakomennot* →
valitse pieni widget (yksi pikakomento) tai keskikokoinen (neljä). Napauta widgetiä pitkään →
*Muokkaa widgetiä* → valitse `Kirjaa kulu`. Widgetin painikkeen napautus käynnistää
pikakomennon suoraan.

**Ohjauskeskus.** Asetukset → Ohjauskeskus → lisää **Pikakomento** ja valitse `Kirjaa kulu`.
Tämä on nopein tapa: pyyhkäisy oikeasta yläkulmasta ja yksi napautus.

**Koputa taakse.** Asetukset → Käyttöapu → Kosketus → Koputa taakse → Kaksoiskoputus →
valitse `Kirjaa kulu`. Kaksi koputusta puhelimen takakanteen käynnistää kirjauksen.

**Siri.** Sano `Hei Siri, Kirjaa kulu` — pikakomennon nimi toimii komentona sellaisenaan.

**Lukitusnäyttö.** Muokkaa lukitusnäyttöä → widgetit → Pikakomennot.

> iPhone 14:ssä ei ole toimintopainiketta (se tuli iPhone 15 Pro -malleihin), joten
> Ohjauskeskus ja koputa taakse ovat sinulle ne nopeimmat reitit.

Kun pikakomento kysyy summaa, Pikakomennot-sovellus voi vilahtaa ruudulla syöttökentän ajaksi.
Kulujenseuranta-sovellus ei avaudu missään vaiheessa.

## Vielä nopeampi: yksi pikakomento per kategoria

Kopioi `Kirjaa kulu` ja poista kopiosta kohdat 5–8 (kategorian haku ja valinta). Kirjoita
kohdan 9 `p_category`-kenttään kategorian nimi suoraan, esim. `Ruokakauppa`, ja nimeä
pikakomento `Ruokakauppa`. Toista muille usein käyttämillesi kategorioille.

Laita nämä keskikokoiseen tai isoon widgetiin: napautat kategoriaa, kirjoitat summan, valmis.
Kategorian nimen pitää täsmätä sovelluksen kategoriaan (isot ja pienet kirjaimet eivät haittaa).

## Virheilmoitukset

| Ilmoitus | Syy ja korjaus |
|---|---|
| `Tuntematon laitetunniste` | Tunniste on väärin kopioitu tai se on poistettu sovelluksesta. Luo uusi. |
| `Virheellinen laitetunniste` | Tunniste on tyhjä tai liian lyhyt — tarkista kohta 1. |
| `Kategoriaa "..." ei löydy` | Nimi ei täsmää mihinkään kategoriaan, tai kategoria on arkistoitu. |
| `Summan pitää olla suurempi kuin nolla` | Syöte oli tyhjä, nolla tai negatiivinen. |
| Ei mitään / verkkovirhe | Puhelimella ei ole verkkoa, tai Supabase-projekti on pysäytetty (ilmaisprojekti pysähtyy viikon käyttämättömyyden jälkeen). |

## Turvallisuus

Laitetunniste on puhelimessasi selkotekstinä pikakomennossa. Jos se joutuu vääriin käsiin,
sillä voi **vain lisätä kuluja sinun tilillesi** — ei nähdä kulujasi, ei muuttaa budjetteja,
ei poistaa mitään, eikä kirjautua sovellukseen.

Mitätöinti: sovelluksen **Asetukset → Pikakomento (iPhone)** → roskakorikuvake. Pikakomento
lakkaa toimimasta välittömästi. Tee tämä jos myyt tai hukkaat puhelimen.

Tietokannassa on vain tunnisteen SHA-256-tiiviste, joten tunnistetta ei voi lukea sieltä
edes tietokannan pääkäyttäjänä.
