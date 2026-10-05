// A ready-made episode so the studio has something to show on first run.
// The script is also parseable by the offline rule-based breakdown.

export const SAMPLE_SCRIPT = `Title: The Heir in the Rain

EXT. GRAND ARLINGTON HOTEL - NIGHT
Heavy rain. ETHAN, soaked in a yellow delivery jacket, stands at the bottom of the marble steps holding a food bag.
The hotel doors open. VIVIAN steps out in a red gown, arm in arm with MARCUS.
MARCUS: Delivery guys use the back door, pal.
ETHAN: I'm not here to deliver food.
VIVIAN: Ethan? You told me you were broke... that you'd left the city.
A black Rolls-Royce glides to the curb. An old butler, MR. HALE, steps out and opens a large umbrella.
MR. HALE: Young master. The board is waiting for your signature.
Marcus's phone slips from his hand and splashes into a puddle.
ETHAN: Tell your father the Grant Group contract is cancelled.`;

export const SAMPLE = {
  title: "The Heir in the Rain",
  logline:
    "A soaked delivery rider humiliated at a luxury hotel turns out to be the hidden heir of the city's most powerful family.",
  style:
    "Cinematic photoreal short drama, rainy night in the city, neon and golden hotel light, teal-and-amber color grade, shallow depth of field, 35mm film look",
  characters: [
    {
      name: "Ethan",
      gender: "male" as const,
      description:
        "28-year-old man, short black hair plastered by rain, sharp jawline, calm dark eyes, soaked bright-yellow food-delivery jacket over a charcoal hoodie, black jeans",
    },
    {
      name: "Vivian",
      gender: "female" as const,
      description:
        "26-year-old woman, long wavy auburn hair, green eyes, red satin evening gown, thin diamond necklace, small silver clutch",
    },
    {
      name: "Marcus",
      gender: "male" as const,
      description: "30-year-old man, slicked-back blond hair, smug smirk, tailored navy three-piece suit, gold wristwatch",
    },
    {
      name: "Mr. Hale",
      gender: "male" as const,
      description:
        "butler in his sixties, neat silver hair and trimmed gray mustache, black tailcoat, white gloves, carrying a large black umbrella",
    },
  ],
  shots: [
    {
      duration: 5,
      shot_type: "Wide shot",
      camera: "slow push in",
      location: "Grand Arlington Hotel entrance, rainy night",
      characters: ["Ethan"],
      action: "Ethan stands alone in the pouring rain at the foot of the hotel's marble steps, holding a delivery bag.",
      dialogue: [],
      image_prompt:
        "Ethan stands alone at the foot of wide marble steps leading up to a luxurious hotel entrance at night, pouring rain, golden light spilling from glass doors, neon reflections on wet pavement, he holds an insulated delivery bag, low angle from behind",
      motion_prompt: "Heavy rain falls; Ethan lifts his head toward the hotel doors, water dripping from his jacket",
    },
    {
      duration: 5,
      shot_type: "Medium shot",
      camera: "static",
      location: "Hotel entrance under the awning",
      characters: ["Vivian", "Marcus"],
      action: "The doors open; Vivian and Marcus step out under the awning, laughing.",
      dialogue: [],
      image_prompt:
        "Vivian and Marcus step out of the hotel's glass doors under a lit awning, Marcus's arm around Vivian's waist, both dressed for a gala, warm light behind them, rain in the foreground",
      motion_prompt: "Vivian and Marcus walk forward out of the doors, Marcus laughing, Vivian adjusting her clutch; rain streaks past the lens",
    },
    {
      duration: 4,
      shot_type: "Close-up",
      camera: "static",
      location: "Hotel entrance under the awning",
      characters: ["Marcus"],
      action: "Marcus looks down at Ethan with contempt.",
      dialogue: [{ speaker: "Marcus", line: "Delivery guys use the back door, pal." }],
      image_prompt: "Close-up of Marcus looking down with a smug smirk, one eyebrow raised, hotel lights behind him, shallow depth of field",
      motion_prompt: "Marcus smirks and tilts his head dismissively as he speaks",
    },
    {
      duration: 4,
      shot_type: "Close-up",
      camera: "slow push in",
      location: "Bottom of the hotel steps, rain",
      characters: ["Ethan"],
      action: "Ethan answers calmly, rain running down his face.",
      dialogue: [{ speaker: "Ethan", line: "I'm not here to deliver food." }],
      image_prompt: "Close-up of Ethan's face in the rain, water running down his cheeks, calm steady gaze, neon reflections in his eyes",
      motion_prompt: "Ethan speaks calmly without blinking, rain running down his face",
    },
    {
      duration: 5,
      shot_type: "Close-up",
      camera: "static",
      location: "Hotel entrance under the awning",
      characters: ["Vivian"],
      action: "Vivian recognizes Ethan and freezes.",
      dialogue: [{ speaker: "Vivian", line: "Ethan? You told me you were broke... that you'd left the city." }],
      image_prompt: "Close-up of Vivian, shocked, lips parted, eyes wide, rain-blurred city lights behind her",
      motion_prompt: "Vivian's expression shifts from confusion to shock as she speaks, her hand rising to her necklace",
    },
    {
      duration: 6,
      shot_type: "Wide shot",
      camera: "pan right",
      location: "Street in front of the hotel, heavy rain",
      characters: ["Mr. Hale"],
      action: "A black Rolls-Royce glides to the curb; Mr. Hale steps out and opens a large umbrella.",
      dialogue: [],
      image_prompt:
        "A black Rolls-Royce with glowing headlights stopped at the curb in front of the hotel in heavy rain, rear door open, Mr. Hale stepping out holding a closed black umbrella",
      motion_prompt: "Mr. Hale steps out of the car and snaps open a large black umbrella; headlights cut through the rain",
    },
    {
      duration: 5,
      shot_type: "Medium shot",
      camera: "static",
      location: "Bottom of the hotel steps, rain",
      characters: ["Mr. Hale", "Ethan"],
      action: "Mr. Hale shelters Ethan with the umbrella and bows.",
      dialogue: [{ speaker: "Mr. Hale", line: "Young master. The board is waiting for your signature." }],
      image_prompt:
        "Mr. Hale holds a large black umbrella over Ethan and bows respectfully, Ethan still in his soaked delivery jacket, rain all around them",
      motion_prompt: "Mr. Hale bows slightly while holding the umbrella over Ethan and speaks; Ethan stands still",
    },
    {
      duration: 4,
      shot_type: "Extreme close-up",
      camera: "static",
      location: "Wet pavement under the awning",
      characters: ["Marcus"],
      action: "Marcus's phone slips from his hand and splashes into a puddle.",
      dialogue: [],
      image_prompt:
        "Extreme close-up of Marcus's hand with a gold wristwatch, a smartphone slipping from his fingers above a puddle reflecting neon lights",
      motion_prompt: "The phone falls in slow motion and splashes into the puddle, droplets flying",
    },
    {
      duration: 6,
      shot_type: "Close-up",
      camera: "slow push in",
      location: "Under the umbrella, hotel steps",
      characters: ["Ethan"],
      action: "Ethan delivers the final blow.",
      dialogue: [{ speaker: "Ethan", line: "Tell your father the Grant Group contract is cancelled." }],
      image_prompt: "Close-up of Ethan under a black umbrella, cold confident stare past the camera, rain falling behind him, golden rim light",
      motion_prompt: "Ethan turns his head slowly toward Marcus and speaks with quiet authority",
    },
  ],
};
