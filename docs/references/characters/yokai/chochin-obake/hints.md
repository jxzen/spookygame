# Chochin-obake · build hints

- **One mesh, two textures.** A torn lantern texture and a face texture, swapped only on frames when the player's light is off or flickering. No rig is needed.
- **Hokusai's trick:** the face is drawn *on and through* the lantern ribs, so the ribs cut across the eye. Keep that: it is what stops the face reading as a sticker.
- **Link to the light system:** this glimpse needs the carried light's flicker to be a callable event (`OnLightFlicker`). It pays off the director's "lights should flicker" note with a reason to watch the flicker.
- **Placement:** one lantern in a row of ten identical ones. The player cannot tell which it was afterwards. Good.
