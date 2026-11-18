# Score Ring Generator (Figma plugin)

Maakt in één klik een volledige set score-cirkels: één hoofdcomponent plus een grid met een variant per waarde, per taal, klaar om te exporteren. Kleurgroepen, teksten en fonts kan je achteraf nog aanpassen.

## Installeren (eenmalig)

1. Download deze repository (groene knop **Code** > **Download ZIP**) en pak hem uit.
2. Zet de uitgepakte map op een vaste plek, bv. `Documenten/Figma plugins/`. Niet meer verplaatsen achteraf.
3. Open de Figma desktop-app (eigen plugins werken niet in de browser).
4. Ga naar **Plugins > Development > Import plugin from manifest...** en kies `manifest.json` in die map.

## Een nieuwe set maken

1. Open een Figma-bestand en ga naar de pagina waar de set moet komen.
2. Start **Plugins > Development > Score Ring Generator**.
3. Vul in:
   - **Set**: naam, van welke tot welke waarde, en de schaal (bij 0 tot 100 is 35 een cirkel voor 35% gevuld).
   - **Languages and texts**: per taal een code (bv. `nl`, `en`), titel en optionele subtitel.
   - **Color groups**: per groep een naam, "tot en met"-waarde, kleur en dotkleur (licht, donker of geen dot). De laatste groep loopt automatisch tot de hoogste waarde.
   - **Style**: diameter, dikte, kleuren, afgeronde uiteinden.
   - **Fonts**: kies uit de fonts op jouw computer.
   - **Export**: PNG, SVG of JPG en de schaal.
4. Klik op **Generate new set**.

Je krijgt een sectie met het hoofdcomponent, een legende en per taal een grid. Elke variant heet bv. `quality-score-nl-035` en heeft al een exportinstelling: selecteer een grid en klik op **Export**.

## Een bestaande set aanpassen

1. Selecteer de sectie van de set (of iets erin).
2. Start de plugin: hij laadt de instellingen van die set.
3. Pas kleurgroepen, kleuren, teksten, fonts of export aan en klik op **Update selected set**.

Bereik, schaal, grootte, dikte, naam en talen kan je niet bijwerken. Maak daarvoor een nieuwe set.

## Goed om te weten

- Kleuren staan in de variabelen `<naam> colors`, teksten in `<naam> texts` (met een mode per taal).
- Laat je Figma-abonnement te weinig variabele-modes toe, dan zet de plugin de teksten rechtstreeks op de varianten. Aanpassen kan dan nog altijd via **Update selected set**.
- Hernoem de varianten en het hoofdcomponent niet; de plugin zoekt ze op naam.
- Ongedaan maken kan met Cmd/Ctrl + Z.
