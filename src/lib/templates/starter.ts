import type { TemplateDefinition } from "./schema";

/**
 * An original example sheet for learning the builder. Generic fantasy
 * mechanics only; no text from any published rulebook.
 */
export const STARTER_TEMPLATE: TemplateDefinition = {
  formatVersion: 1,
  sections: [
    {
      id: "s-basics",
      title: "Basics",
      fields: [
        { id: "f-name", key: "name", label: "Character name", type: "text" },
        { id: "f-calling", key: "calling", label: "Calling", type: "text", help: "Your character’s class, job or path." },
        { id: "f-level", key: "level", label: "Level", type: "number", default: 1, min: 1, max: 20 },
        {
          id: "f-temperament",
          key: "temperament",
          label: "Temperament",
          type: "choice",
          options: ["Kind", "Practical", "Reckless", "Mysterious"],
        },
      ],
    },
    {
      id: "s-abilities",
      title: "Abilities",
      fields: [
        { id: "f-str", key: "strength", label: "Strength", type: "number", default: 10, min: 1, max: 30 },
        { id: "f-str-mod", key: "strength_mod", label: "Strength modifier", type: "calculated", formula: "floor((strength - 10) / 2)", format: "modifier" },
        { id: "f-dex", key: "dexterity", label: "Dexterity", type: "number", default: 10, min: 1, max: 30 },
        { id: "f-dex-mod", key: "dexterity_mod", label: "Dexterity modifier", type: "calculated", formula: "floor((dexterity - 10) / 2)", format: "modifier" },
        { id: "f-con", key: "constitution", label: "Constitution", type: "number", default: 10, min: 1, max: 30 },
        { id: "f-con-mod", key: "constitution_mod", label: "Constitution modifier", type: "calculated", formula: "floor((constitution - 10) / 2)", format: "modifier" },
        { id: "f-wis", key: "wisdom", label: "Wisdom", type: "number", default: 10, min: 1, max: 30 },
        { id: "f-wis-mod", key: "wisdom_mod", label: "Wisdom modifier", type: "calculated", formula: "floor((wisdom - 10) / 2)", format: "modifier" },
      ],
    },
    {
      id: "s-combat",
      title: "Combat",
      fields: [
        { id: "f-prof", key: "proficiency", label: "Proficiency bonus", type: "calculated", formula: "2 + floor((level - 1) / 4)", format: "modifier" },
        { id: "f-shield", key: "has_shield", label: "Carrying a shield", type: "checkbox", default: false },
        { id: "f-armor", key: "armor_bonus", label: "Armor bonus", type: "number", default: 0, min: 0, max: 10 },
        {
          id: "f-defense",
          key: "defense",
          label: "Defense",
          type: "calculated",
          formula: "10 + dexterity_mod + armor_bonus + if(has_shield, 2, 0)",
          format: "number",
        },
        {
          id: "f-hp",
          key: "hit_points",
          label: "Hit points",
          type: "resource",
          maxFormula: "max(1, 8 + constitution_mod + (level - 1) * (5 + constitution_mod))",
        },
        {
          id: "f-wounded",
          key: "bloodied",
          label: "Bloodied (at half health or less)",
          type: "calculated",
          formula: "hit_points <= hit_points.max / 2",
          format: "number",
        },
      ],
    },
    {
      id: "s-notes",
      title: "Notes",
      fields: [
        { id: "f-story", key: "backstory", label: "Backstory", type: "longtext" },
        { id: "f-gear", key: "gear", label: "Gear and treasure", type: "longtext" },
      ],
    },
  ],
};
