# Furry Image Studio Project Library

This is generated from the canonical character and style profiles. Upload it to the matching ChatGPT Project after each profile update.

## Character profile: testy-taupin

Aliases: Testy, Taupin

---
id: testy-taupin
display_name: Testy Taupin
species: anthropomorphic taupe
body_type: compact, friendly anthro character
default_style: toon-in-real-world
paw_style: hybrid-hands
finger_count: auto
required_traits:
  - warm taupe-brown fur with a cream muzzle and throat
  - small rounded ears and a soft, readable silhouette
  - kind expression and simple, unbranded clothing when clothing is requested
avoid:
  - distinctive real-person likenesses
  - named-character accessories or markings
  - extra tails, ears, fingers, or limbs
reference_images: []
---

# Testy Taupin

Testy Taupin is the generic, reference-free example profile. Use it for
documentation and smoke checks only; it must not encode a real person's
appearance, private reference image, or user preference.

## Style profile: anime

---
id: anime
display_name: Anime
default_scope: full-image
allowed_scopes:
  - subject-only
  - full-image
background_policy: stylize-allowed
rendering:
  - clean expressive linework
  - simplified cel or soft gradient shading
  - large readable eyes
  - crisp silhouette and controlled saturation
preserve:
  - character markings
  - accessories
  - species-specific anatomy
avoid:
  - muddy semi-realism
  - photoreal skin texture
  - tiny unreadable costume detail
---

# Anime

Use for expressive portraits, emotional scenes, sticker-like character acting, or stylized full-scene generation.

## Style profile: cartoon-world

---
id: cartoon-world
display_name: Cartoon World
default_scope: full-image
allowed_scopes:
  - subject-only
  - full-image
background_policy: stylize-allowed
rendering:
  - cohesive animated-feature look
  - simplified but expressive shapes
  - strong readable silhouettes
  - clean color blocking with soft shading
preserve:
  - character identity
  - pose and scene intent
  - important props and readable signs if editing a source image
avoid:
  - gritty realism
  - excessive fur strand detail
  - cluttered linework
---

# Cartoon World

Use for images where the whole scene may become stylized, bright, readable, and animated.

## Style profile: photorealism

---
id: photorealism
display_name: Photorealism
default_scope: full-image
allowed_scopes:
  - subject-only
  - full-image
background_policy: match-mode
rendering:
  - realistic camera optics, lighting, shadows, and material response
  - believable fur texture without plastic shine
  - natural anatomy that remains appealing and non-horror
  - no cartoon outlines
preserve:
  - character markings
  - recognizable accessories
  - intended mood and lighting
avoid:
  - rubber mask face
  - uncanny teeth or muzzle
  - over-detailed wet fur unless requested
---

# Photorealism

Use when the final image should read like a plausible photographed anthro character or a fully realistic generated scene.

## Style profile: sticker

---
id: sticker
display_name: Sticker
default_scope: full-image
allowed_scopes:
  - full-image
background_policy: transparent-or-simple
rendering:
  - bold readable pose
  - clear silhouette
  - simplified shading
  - expressive face and paws
  - optional white sticker border
preserve:
  - character markings
  - key accessories
  - emotion or gesture
avoid:
  - complex background
  - small text
  - dense detail
---

# Sticker

Use for stickers, emotes, badges, and simple character reactions.

## Style profile: storybook

---
id: storybook
display_name: Storybook
default_scope: full-image
allowed_scopes:
  - subject-only
  - full-image
background_policy: stylize-allowed
rendering:
  - warm illustrated storybook texture
  - gentle painterly edges
  - soft readable shapes
  - cozy light and color
preserve:
  - character markings and accessories
  - emotional tone
  - clear focal point
avoid:
  - harsh hyperrealism
  - busy backgrounds that hide the character
  - illegible fine detail
---

# Storybook

Use for gentle narrative images, cozy scenes, and character moments with a literary illustration feel.

## Style profile: toon-in-real-world

---
id: toon-in-real-world
display_name: Toon in Real World
default_scope: subject-only
allowed_scopes:
  - subject-only
background_policy: preserve-exactly
rendering:
  - stylized cartoon or anime-adjacent anthro character in an unchanged real photograph
  - readable fur markings, anatomy, accessories, and silhouette
  - subtle painterly edge softening around the transformed subject
  - mild lens halation, warm rim light, and film grain only for integration
  - respect the source photo's lighting direction and camera perspective
preserve:
  - original real-world background
  - crop, aspect ratio, camera angle, perspective, and depth of field
  - furniture, props, text, clutter, reflections, shadows, and other people
avoid:
  - cartoonifying the whole scene
  - cleaning, beautifying, replacing, relighting, blurring, cropping, or restaging the environment
  - fully photoreal fursona treatment
  - mask-like face replacement
---

# Toon in Real World

Use when the desired effect is an impossible stylized character placed inside an ordinary, unchanged real photo. The visible contrast between real background and cartoon subject is the point.
