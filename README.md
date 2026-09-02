# Kulujenseuranta

Henkilökohtainen kulujenseuranta-verkkosovellus. Tarkoitus on yksi asia: kulun kirjaus
puhelimella heti transaktion jälkeen, kolmella kosketuksella.

- **Kirjaa** – summa, kategoria (pudotusvalikko), päivämäärä (esitäytetty), vapaaehtoinen kuvaus
- **Kulut** – kuukauden kirjaukset päivittäin, muokkaus ja poisto
- **Yhteenveto** – kulut kategorioittain, kokonaissumma, vertailu edelliseen kuukauteen
- **Budjetti** – kuukausibudjetti kategorioittain, seuranta ja ennuste
- **Asetukset** – kategorioiden hallinta, Excel-vienti, JSON-varmuuskopio

## Tekniikka

| Osa | Valinta |
|---|---|
| Käyttöliittymä | plain HTML + CSS + JavaScript (ES-moduulit), **ei build-vaihetta** |
| Tietokanta | Supabase (Postgres) + Row Level Security |
| Autentikointi | sähköposti + salasana, sessio säilyy selaimessa |
| Hosting | mikä tahansa staattinen hosting (GitHub Pages, Netlify, Cloudflare Pages) |
| Asennus puhelimeen | PWA – lisätään kotivalikkoon selaimesta |
| Ulkoiset kirjastot | `supabase-js` (CDN) ja `SheetJS` (CDN, ladataan vasta viennissä) |

Rahasummat tallennetaan **sentteinä kokonaislukuna**. Liukuluvut eivät sovi
rahalaskentaan, koska 0,1 + 0,2 ei ole tasan 0,3.

## Tiedostot

```
kulujenseuranta/
├── index.html                  koko käyttöliittymän rakenne
├── styles.css                  tumma teema, mobile first
├── manifest.webmanifest         PWA-määritys
├── sw.js                       service worker (sovelluksen kuoren cachetus)
├── supabase-schema.sql         tietokannan taulut, RLS-politiikat ja pikakomentofunktiot
├── PIKAKOMENTO.md              ohje iPhonen pikakomennon rakentamiseen
├── icons/                      ikonit (SVG + PNG 180/192/512)
└── js/
    ├── config.js               SUPABASE_URL + SUPABASE_ANON_KEY  <-- täytä tämä
    ├── app.js                  käynnistys, näkymien ohjaus
    ├── db.js                   kaikki Supabase-kutsut (datakerros)
    ├── state.js                tila muistissa + kuukausilaskennat
    ├── format.js               suomalainen raha- ja päivämäärämuotoilu
    ├── export.js               Excel-vienti + JSON-varmuuskopio
    ├── ui-common.js            toast, modaali, vahvistuskysely
    ├── ui-auth.js              kirjautuminen
    ├── ui-entry.js             kirjausnäkymä
    ├── ui-transactions.js      kirjauslista + muokkaus
    ├── ui-summary.js           kuukausiyhteenveto
    ├── ui-budget.js            budjetit ja seuranta
    ├── ui-tokens.js            laitetunnisteet pikakomennolle
    └── ui-categories.js        kategorioiden hallinta
```

## Tämän asennuksen tiedot (tehty valmiiksi)

| Kohde | Arvo |
|---|---|
| Supabase-projekti | `kulujenseuranta` (organisaatio kekkonenalex, region North EU / Tukholma) |
| Projektin osoite | `https://wqibkufakgdmzcovmdos.supabase.co` |
| Avain `js/config.js`:ssä | publishable key (turvallinen selaimessa, RLS suojaa datan) |
| Tietokanta | `supabase-schema.sql` ajettu: taulut, indeksit, triggerit ja RLS-politiikat luotu |
| Repositorio | `https://github.com/kekkonenalex/kulujenseuranta` (julkinen) |
| Hosting | GitHub Pages, `main`-haara juuresta |

Tarkistettu käyttöönoton yhteydessä: anonyymi luku palauttaa tyhjän listan ja anonyymi
kirjoitus torjutaan virheellä `401 / 42501 row-level security policy` — eli RLS on voimassa.

**Rekisteröinti on suljettu:** *Authentication → Sign In / Providers → User Signups →
Allow new users to sign up* on pois päältä, eli kukaan muu ei voi luoda tunnusta projektiin,
vaikka löytäisi julkisen URLin. Varmistettu: `/auth/v1/signup` vastaa
`422 signup_disabled`. Jos joskus tarvitset toisen tunnuksen (esim. kumppanille), kytke
asetus hetkeksi päälle tai luo käyttäjä hallintapaneelista *Authentication → Users → Add user*.

### Sovelluksen päivitys jatkossa

```bash
git add . && git commit -m "kuvaus" && git push
```

GitHub Pages julkaisee muutokset noin minuutissa. Service worker cachettaa sovelluksen kuoren,
joten puhelimessa uusi versio tulee käyttöön viimeistään toisella avauksella. Jos haluat pakottaa
päivityksen heti, nosta `APP_VERSION` tiedostossa `js/config.js` ja `VERSION` tiedostossa `sw.js`.

## Käyttöönotto (alkuperäiset ohjeet)

### 1. Supabase-projekti

1. Kirjaudu [supabase.com](https://supabase.com) → **New project**
2. Region: **Frankfurt** tai **Stockholm** (lähin, pienin viive)
3. Tallenna tietokannan salasana talteen – sitä ei tarvita sovelluksessa, mutta
   Supabase ei näytä sitä uudelleen

### 2. Tietokannan luonti

Avaa projektissa **SQL Editor** → uusi kysely → liitä `supabase-schema.sql` kokonaisuudessaan → **Run**.

Skripti luo taulut `categories` ja `transactions`, indeksit, triggerit ja RLS-politiikat.
Skripti on idempotentti: sen voi ajaa uudelleen ilman virheitä.

### 3. Asetukset

Kopioi **Project Settings → API** -sivulta:

- `Project URL` → `SUPABASE_URL`
- `Project API keys → anon public` → `SUPABASE_ANON_KEY`

ja liitä ne tiedostoon `js/config.js`.

Anon-avain on tarkoitettu selaimeen ja on julkinen tieto. Dataa suojaavat RLS-politiikat:
jokainen rivi on sidottu käyttäjään, ja politiikka päästää läpi vain omat rivit.
**Älä koskaan laita `service_role`-avainta tähän tiedostoon** – se ohittaa RLS:n.

### 4. Sähköpostivahvistus

**Authentication → Providers → Email**: jos *Confirm email* on päällä, tunnuksen luonnin
jälkeen pitää avata vahvistuslinkki sähköpostista ennen kirjautumista. Omassa
käytössä sen voi ottaa pois päältä, jolloin tunnus toimii heti.

### 5. Paikallinen testaus

Sovellus käyttää ES-moduuleja, joten se **ei toimi** avaamalla `index.html` suoraan
tiedostona (`file://`). Käynnistä kevyt palvelin kansiossa:

```bash
python -m http.server 8000
```

ja avaa `http://localhost:8000`. VS Codessa myös *Live Server* -laajennus toimii.

### 6. Julkaisu (GitHub Pages)

```bash
git init
git add .
git commit -m "Kulujenseuranta v1"
git branch -M main
git remote add origin https://github.com/<käyttäjä>/<repo>.git
git push -u origin main
```

Repossa **Settings → Pages → Source: Deploy from a branch → main / (root)**.
Osoite on muutaman minuutin päästä `https://<käyttäjä>.github.io/<repo>/`.

HTTPS on välttämätön: ilman sitä service worker ja PWA-asennus eivät toimi.

### 7. Asennus puhelimeen

- **iPhone (Safari):** avaa osoite → jakokuvake → *Lisää Koti-valikkoon*
- **Android (Chrome):** avaa osoite → valikko → *Asenna sovellus*

Kirjaudu kerran, ja sessio säilyy – sovellus avautuu suoraan kirjausnäkymään.

## Budjetit

Budjetti-välilehdellä asetetaan kuukausibudjetti kategoriakohtaisesti. Kokonaisbudjetti on
kategoriabudjettien summa — sitä ei aseteta erikseen.

**Perusbudjetti ja ylikirjoitus.** Kun asetat summan valinnalla *joka kuukausi*, se pätee
kaikkiin kuukausiin. Valinta *vain tämä kuukausi* tallentaa erillisen rivin, joka ylikirjoittaa
perusbudjetin siltä kuukaudelta. Tietokannassa ero on `budgets.year_month`-kentässä: `null`
tarkoittaa perusbudjettia, `'2026-09'` yhtä kuukautta.

Tästä seuraa yksi asia joka on hyvä tietää: **menneen kuukauden budjetti muuttuu, jos muutat
perusbudjettia**, koska mennyt kuukausi lukee samaa perusbudjettia. Jos haluat jäädyttää
menneen kuukauden luvun, aseta sille kuulle oma summa *vain tämä kuukausi* -valinnalla.

**Värit.** Alle 80 % vihreä, 80–100 % keltainen, yli 100 % punainen. Sama sääntö sekä
kategoriariveillä että kokonaisbudjetissa.

**Ennuste.** Kuluvalle kuukaudelle näytetään arvio siitä mihin summaan kuukausi päättyy
nykyisellä tahdilla. Ennuste ei näy kuukauden viitenä ensimmäisenä päivänä: yhden ison kulun
(esimerkiksi vuokran) jakaminen kahdella päivällä ja kertominen kolmellakymmenellä antaisi
täysin harhaanjohtavan luvun. Tulevalle päivälle kirjatut kulut lisätään ennusteeseen
sellaisenaan eivätkä ne vaikuta tahtiin.

**Kategoriat ilman budjettia** näkyvät omana ryhmänään näkymän alaosassa. Niiden kulut eivät
sisälly kokonaisbudjetin vertailuun, vaan ne näytetään erillisellä rivillä, jotta vertailu
budjetti vs. toteuma pysyy rehellisenä.

## Excel-vienti

Asetukset → *Vie Excel-tiedostoksi* luo `.xlsx`-tiedoston kolmella välilehdellä:

| Välilehti | Sisältö |
|---|---|
| Transaktiot | kaikki kirjaukset (päivämäärä, kuukausi, kategoria, summa, kuvaus) |
| Kuukausiyhteenveto | kuukausi × kategoria -summat, budjetti, erotus, osuudet ja kirjausmäärät |
| Kuukausisummat | kuukausien kokonaissummat, kokonaisbudjetti ja erotus |

Summat ovat oikeita lukuja euromuotoilulla ja päivämäärät oikeita päivämääriä, joten
Excelin pivot-taulut ja kaaviot toimivat suoraan. Tiedosto on tarkoitettu analyysiin,
**ei varmuuskopioksi** – sitä ei voi tuoda takaisin sovellukseen.

## Kirjaus iPhonen pikakomennolla

Asetukset → *Pikakomento (iPhone)* luo **laitetunnisteen**, jolla iPhonen pikakomento voi
kirjata kuluja avaamatta sovellusta — kotinäytön widgetistä, Ohjauskeskuksesta, koputtamalla
takakantta tai Sirillä. Vaiheittainen ohje: [PIKAKOMENTO.md](PIKAKOMENTO.md).

Tekninen puoli: pikakomento kutsuu kahta `security definer` -funktiota anon-avaimella ja
laitetunnisteella.

| Funktio | Tekee |
|---|---|
| `log_expense(p_token, p_amount, p_category, p_description, p_occurred_on)` | Kirjaa kulun ja palauttaa kuukauden toteuman sekä budjetin jäljellä olevan osan |
| `list_expense_categories(p_token)` | Palauttaa kategoriat pikakomennon valikkoa varten |

Tietokantaan tallennetaan vain tunnisteen SHA-256-tiiviste (`device_tokens.token_hash`);
tunniste arvotaan selaimessa ja näytetään kerran. Tunnisteella voi vain lisätä kuluja — ei
lukea, muokata tai poistaa mitään. Poisto asetuksista katkaisee pääsyn välittömästi.

Pikakomennot eivät voi käyttää sovelluksen kirjautumista, koska Supabasen käyttöoikeustunnus
vanhenee tunnissa ja päivitystunnus kiertää jokaisella käytöllä.

## Varmuuskopio

Asetukset → *Vie varmuuskopio* tuottaa JSON-tiedoston, jonka *Tuo varmuuskopio* lukee
takaisin. Tuonti ei poista olemassa olevaa dataa: samannimiset kategoriat yhdistetään ja
kirjaukset lisätään. Saman tiedoston tuominen kahdesti tuo kirjaukset kahteen kertaan.

## Rajoitukset (v1)

- **Kirjaus vaatii verkkoyhteyden.** Ilman verkkoa sovellus kertoo virheestä eikä kirjaus
  tallennu. Sovelluksen kuori latautuu silti cachesta.
- Vain kulut, ei tuloja.
- Budjetin käyttämätön osa ei siirry seuraavalle kuukaudelle.
- Yksi valuutta (EUR).

## Jatkokehitys

Nämä on suunniteltu niin, ettei tietomallia tarvitse purkaa:

- **Offline-jono:** kirjaus IndexedDB:hen ja lähetys kun verkko palaa. Muutokset osuvat
  vain tiedostoon `js/db.js`, koska muu sovellus ei tunne Supabasea.
- **Budjetin siirto kuukaudelta toiselle** (rollover): käyttämätön osa lisättäisiin seuraavan
  kuun budjettiin. Muuttaa laskennan ketjuksi, jossa jokainen kuukausi riippuu edellisistä.
- **Toistuvat kulut**, **tulot**, **kategorioiden järjestys raahaamalla**.
