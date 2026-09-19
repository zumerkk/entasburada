# EnexAI mascot assets

Created on 2026-09-19 from the Entaş hammer mascot reference supplied by the user. The retained brand features are the orange hammer body and left-facing claw, turquoise striking face, turquoise gloves and boots, large expressive eyes, friendly smile, and hanging hole in the handle.

## Delivered files

| File | Format / dimensions | Purpose |
| --- | --- | --- |
| `apps/web/public/images/enexai/enexai-mascot-3d.png` | RGBA PNG, **940 × 1672 native pixels** | Polished generated 3D illustration. Genuine transparent alpha, verified range 0–255. |
| `apps/web/public/images/enexai/enexai-mascot.svg` | Editable vector, viewBox `0 0 260 360` | Static export of the original code-native animation artwork; scales without pixelation. |
| `apps/web/public/images/enexai/enexai-mascot-vector-4k.png` | RGBA PNG, **2160 × 3840 pixels** | Real 4K canvas rendered directly from the vector artwork, with transparent margins. This is not an upscale of the generated 3D PNG. |
| `apps/web/components/enexai/EnexMascot.tsx` | React / SVG | Live animated mascot with unique gradient IDs for multiple instances. |
| `apps/web/components/enexai/EnexMascot.module.css` | CSS animations | Blinking, waving, breathing, speaking, listening, thinking, and celebration. |

The built-in image-generation tool did not honor the requested 2160 × 3840 native size: the chosen transparent illustration is 940 × 1672. A second requested high-resolution pass returned 941 × 1672 without alpha and was rejected. The 3D illustration must not be advertised as a native 4K render. The separate 4K vector render has been verified as 2160 × 3840 with alpha range 0–255.

## Component contract

```tsx
import { EnexMascot } from "@/components/enexai/EnexMascot";

<EnexMascot state="speaking" size={150} audioLevel={0.6} />
```

- `state`: `idle` (default), `thinking`, `speaking`, `listening`, or `celebrating`.
- `size`: height in CSS pixels; default 140. Width is 72% of height.
- `audioLevel`: optional normalized amplitude, clamped to 0–1. In the speaking state, the actual level sets the mouth opening. Omit it when amplitude is unavailable to use a simple speech motion fallback. Audio is supplied by the parent; the illustration never activates the microphone or plays audio.
- `className`: optional host styling.
- Decorative SVG is hidden from screen readers. The surrounding assistant button/panel must carry its own accessible label.
- The reduced-motion preference disables animation and transitions. Speaking retains a still mouth pose so the state remains recognizable.
- The React source is the animation master; the SVG and 4K PNG are static deliverables and should be regenerated if the character paths are changed.

## Generation provenance and final prompt

Provider: **built-in `image_gen` tool**, not the CLI or an external media provider. The reference was inspected before generation. No image-editor postprocessing or background removal was applied to the accepted raster output; its original alpha was preserved when copied into the repository.

Reference: user attachment `Ekran Resmi 2026-09-19 18.46.05.png` (430 × 528). Accepted generated source: `exec-56bb0fdb-da27-4b69-90c5-c8ce2419946d.png` from the current session's built-in image output directory.

Final prompt used for the accepted image:

> Use case: identity-preserve. Asset type: ENEX AI shopping assistant brand mascot master PNG. Edit target: attached Entas brand mascot photograph. Recreate the SAME recognizable anthropomorphic hammer character as a beautifully refined premium dimensional cartoon in native 2160 x 3840 portrait 4K. Preserve the hammer silhouette: glossy warm golden orange hammer head with curved claw pointing left, turquoise striking face at right, long orange handle forming the body and round hanging hole near bottom; huge friendly expressive oval black eyes with white highlights on the head, warm small smile, slender orange arms and legs, turquoise work gloves and turquoise boots. Cheerful confident welcoming character facing viewer; left hand raised in a small welcoming wave and right hand resting by waist. Premium 3D illustration, handcrafted polished soft vinyl appearance, clean orange-to-amber shading, turquoise and teal details, gentle white highlights, subtle dark outline retaining original brand identity, balanced friendly proportions. Full body completely inside frame with small margin. Transparent background with true alpha everywhere outside mascot; isolate the character, no floor, no shadow cast on an opaque background. Remove every background letter/logo. No text, no letters, no wordmark, no watermark, no frame, no other objects. Requested output dimensions exactly 2160x3840; deliver a genuine transparent PNG.

The vector animation is complementary code-native artwork based on the same user-provided mascot. Its independent arm, eye, mouth, body, and state-indicator groups allow animation without the network, downloaded video loops, or extra rendering dependencies.
