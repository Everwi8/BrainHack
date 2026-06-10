// Shared Brainy avatar component. `mood` selects one of the static PNGs from
// /public and keeps character rendering consistent across pages.
const BRAINY_IMAGES = {
  normal:    "/brainy_normal.png",
  happy:     "/brainy_happy.png",
  angry:     "/brainy_angry.png",
  surprised: "/brainy_surprised.png",
};

export default function BrainyMascot({ mood = "normal", width = 180, style = {} }) {
  return (
    <img
      src={BRAINY_IMAGES[mood]}
      alt={`Brainy ${mood}`}
      style={{ width, height: "auto", objectFit: "contain", ...style }}
    />
  );
}
