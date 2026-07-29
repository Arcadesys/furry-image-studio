---
id: character-id
display_name: Character Name
species: species or hybrid species
body_type: anthropomorphic character
default_style: toon-in-real-world
paw_style: hybrid-hands
finger_count: auto
required_traits:
  - primary fur, feather, scale, skin, or body colors
  - face shape, muzzle, beak, horns, ears, hair, or mane
  - required markings, outfit, accessories, or silhouette
avoid:
  - generic species design
  - missing required markings or accessories
  - extra limbs, tails, wings, horns, or ears
reference_images: []
---

# Character Name

Replace this template with one reusable character identity. Add reference images to `references/`, then list them in `reference_images`.

Keep this profile about identity only. Rendering choices belong in `assets/styles/`.

`paw_style` options:

- `human-like-hands`: human hand shape, fur or markings allowed, nails may remain nail-like.
- `hybrid-hands`: expressive anthro hands with subtle paw traits, short claws or claw-like nails, optional small pads only when palms are visible.
- `full-paws`: clearly paw-like hands with pawpads, claws, thicker digits, and less human nail structure.

`finger_count` options:

- `auto`: choose what fits the character, style, and source pose.
- `five`: five digits per hand, including thumb.
- `toon-four`: four digits per hand, thumb plus three fingers, common for cartoon/toon styles.
