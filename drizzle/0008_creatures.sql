CREATE TABLE `creature_species` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `primary_type` text NOT NULL,
  `secondary_type` text,
  `base_stats_json` text NOT NULL,
  `learnset_json` text NOT NULL
);

CREATE TABLE `creature_moves` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `category` text NOT NULL,
  `base_power` integer NOT NULL,
  `accuracy` integer NOT NULL,
  `pp` integer NOT NULL,
  `priority` integer NOT NULL DEFAULT 0,
  `effect_id` text,
  `status_chance` real
);

CREATE TABLE `creatures` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_player_id` text,
  `species_id` text NOT NULL,
  `nickname` text NOT NULL,
  `level` integer NOT NULL DEFAULT 1,
  `experience` integer NOT NULL DEFAULT 0,
  `current_hp` integer NOT NULL,
  `max_hp` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'none',
  `growth_curve` text NOT NULL DEFAULT 'medium',
  `known_moves_json` text NOT NULL,
  `x` real,
  `y` real,
  `z` real,
  `is_wild` integer NOT NULL DEFAULT 1
);
