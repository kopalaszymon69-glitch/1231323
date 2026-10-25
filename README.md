# PokéWędrówka

Gra Pokémon dla jednego gracza w przeglądarce, inspirowana PokeWars. Cały interfejs jest po polsku, a nazwy Pokémonów, ruchów i przedmiotów są angielskie, tak jak w grach. Dane pochodzą z oryginalnych gier.

## Jak zagrać

Otwórz `index.html` w przeglądarce. Nie trzeba niczego instalować. Gra działa też jako strona statyczna, np. na GitHub Pages lub przez `python3 -m http.server`.

Postęp zapisuje się automatycznie w przeglądarce (localStorage). Zapis można wyeksportować do pliku i wczytać z powrotem w **Opcjach**.

Grafiki Pokémonów, przedmiotów i trenerów są pobierane z PokeAPI Sprites i Pokémon Showdown, więc do ich wyświetlania potrzebny jest internet.

## Co jest w grze

- **9 regionów**: Kanto (FireRed/LeafGreen), Johto (HeartGold/SoulSilver), Hoenn (Emerald), Sinnoh (Platinum), Unova (Black 2/White 2), Kalos (X/Y), Alola (Ultra Sun/Ultra Moon), Galar (Sword/Shield z DLC) i Paldea (Scarlet/Violet).
- **Ponad 600 lokacji** ułożonych w kolejności fabularnej. Dzikie Pokémony i ich poziomy pochodzą z prawdziwych tabel spotkań:
  - pora dnia według prawdziwego zegara (rano, dzień, noc),
  - pory roku w Unovie (zmieniają się co miesiąc, jak w BW),
  - pogoda w Dzikiej Strefie Galaru,
  - wysypy Pokémonów, wędki, surfowanie, Rock Smash i Headbutt,
  - dni tygodnia (np. Lapras w Union Cave w piątki).
- **1025 gatunków** z formami regionalnymi i Mega. Statystyki, typy, zdolności, ruchy, ewolucje i wpisy Pokédexu pochodzą z PokeAPI.
- **Liderzy sal, Elitarna Czwórka i Mistrzowie** z drużynami z oryginalnych gier. W Alola zamiast sal są Próby i Kahuni, w Galarze liderzy zależą od wersji Sword lub Shield.
- **Silnik walki zgodny z 9. generacją**, w tym:
  - wzór na obrażenia, trafienia krytyczne, STAB i tabela typów,
  - statusy, pogoda, pola (terrain) i pułapki na polu walki,
  - około 200 zdolności i kilkadziesiąt przedmiotów trzymanych,
  - ponad 150 ruchów ze specjalnymi efektami,
  - Mega Ewolucja, Z-Moves, Dynamax i Terastalizacja,
  - wzór na łapanie z modyfikatorami wszystkich Poké Balli.
- **Zdarzenia podczas wypraw** (w stylu PokeWars):
  - dzicy Pokémoni, trenerzy, rywal i złoczyńcy (od Team Rocket do Team Star),
  - legendy i wędrujące legendy,
  - rajdy Max Raid i Tera Raid oraz Ultra Tunele,
  - wysypy Pokémonów, jaja, skamieliny, quizy, krzaki jagód i TM-y,
  - Bug-Catching Contest, monety Gimmighoula i wiele innych.
- **Hodowla, Pokédex i usługi**:
  - Hodowla Pokémonów z dziedziczeniem IV, natury, zdolności i ruchów z jaja,
  - PC na 16 pudeł,
  - Pokédex z informacją, gdzie występuje każdy gatunek,
  - sklepy, których asortyment rośnie z liczbą odznak,
  - Przypominacz Ruchów, wymiany z NPC i Game Corner.
- **Po grze**: skalowanie trenerów w kolejnych regionach, Battle Factory, zadania dnia, osiągnięcia, Hall of Fame i punkty akcji (można je wyłączyć).

## Struktura projektu

| Ścieżka | Zawartość |
| --- | --- |
| `index.html`, `css/` | strona i style |
| `js/data/` | dane wygenerowane z PokeAPI (nie edytować ręcznie) |
| `js/core/` | silnik: Pokémony, walka, AI, łapanie |
| `js/game/` | logika gry: stan, świat, zdarzenia, sale, Liga, hodowla, zadania |
| `js/ui/` | interfejs: ekrany, ekran walki, okna |
| `tools/` | skrypty budujące dane i definicja świata (`world_def.py`) |
| `tests/` | testy w Node: symulacja walk i przejście całego świata |

## Przebudowa danych

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/PokeAPI/pokeapi.git
(cd pokeapi && git sparse-checkout set data/v2/csv)
python3 tools/build_data.py pokeapi/data/v2/csv   # js/data/*.js + tools/encounters.json
python3 tools/build_world.py                      # js/data/world.js
```

Spotkania w Paldei (`tools/paldea_species.json`) pochodzą z map Pokéarth na Serebii, bo PokeAPI nie ma danych o spotkaniach ze Scarlet/Violet.

## Testy

```sh
node tests/sim.js 2000      # losowe walki AI kontra AI
node tests/world_test.js    # wszystkie lokacje, zdarzenia, sale i Ligi w 9 regionach
```

---

Fanowski projekt niekomercyjny. Pokémon oraz nazwy postaci są własnością Nintendo, Creatures Inc. i GAME FREAK inc.
