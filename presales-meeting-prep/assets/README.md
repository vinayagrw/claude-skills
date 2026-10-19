# Solid tile icons

A sprite of 50 original line glyphs (`solid-tile-icons.svg`). Each is a 24x24 `<symbol id="i-NAME">` holding only the white glyph. The colour comes from the tile behind it.

## Style rules

- Tile corner radius is 25% of the tile size.
- Glyph is white, 2px stroke on the 24 grid, round caps and joins, no fill except small dot accents.
- Sizes: 64px is the default, 72px for hero use, 40px for chips only.
- Labels are 3 words max. Put detail in tooltips or notes.
- Keep roughly 22% padding inside the tile so the glyph sits centred.

## Colour meanings

| Token | Hex | Meaning |
|---|---|---|
| teal | #0F8A6B | Accelerate or already shipped |
| amber | #B8740F | Build |
| coral | #D2552D | AI and models |
| violet | #4B44A8 | Data and platform |
| slate | #5B6472 | People, partners, external systems |
| red | #C8102E | Pain points today |

## Usage

Inline the sprite once in the page, then reference symbols.

```html
<svg class="tile" style="--tile:#0F8A6B"><use href="#i-rule-brick"/></svg>
```

```css
.tile{width:64px;height:64px;border-radius:25%;background:var(--tile);
  color:#fff;padding:14px;box-sizing:border-box}
.tile.hero{width:72px;height:72px;padding:16px}
.tile.chip{width:40px;height:40px;padding:9px}
```

## Embedding in draw.io

draw.io cannot use `<use>` references. Build a standalone SVG per icon: a 24x24 viewBox with a `<rect width="24" height="24" rx="6" fill="#HEX"/>`, then the glyph wrapped in `<g transform="translate(4.8 4.8) scale(0.6)" stroke="#fff">` with the symbol attributes. Base64 encode it and set the cell style to `shape=image;image=data:image/svg+xml,BASE64;` at 80x80 or larger. Keep the caption under the image at 14 to 16px bold.

## Adding a glyph

1. Draw on a 24 unit grid, keeping content inside 3 to 21.
2. Use only strokes with the shared attributes. A dot accent is a circle of radius 0.6 to 1 with `fill="currentColor"`.
3. Add one small distinctive detail such as a notch or dot so it matches the set.
4. Add the `<symbol>` to the sprite, render the contact sheet at 40px and 72px, and check it reads at both sizes.
