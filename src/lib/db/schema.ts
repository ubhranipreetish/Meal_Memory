/**
 * Drizzle schema — mirrors docs/DATA_MODEL.md.
 *
 * Conventions:
 *  - uuid PK, default gen_random_uuid()
 *  - every user-scoped table has user_id (RLS enforces user_id = auth.uid())
 *  - created_at / updated_at on every table
 *  - nutrition snapshots are denormalized onto log items so history never
 *    silently changes when a food's macros are edited (RULES.md #12)
 *
 * pgvector is enabled by supabase/bootstrap.sql. RLS and private storage
 * policies are applied by supabase/rls.sql (Supabase-specific, auth.uid()).
 */
import {
  boolean,
  customType,
  date,
  integer,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** pgvector column type for food-name similarity search (Sprint 2). */
const vector = customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 768})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
});

const id = () => uuid("id").primaryKey().defaultRandom();
const userId = () => uuid("user_id").notNull();
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Profiles ────────────────────────────────────────────────────────────────
export const profiles = pgTable("profiles", {
  // For profiles, id IS the auth.users id (one profile per user).
  id: uuid("id").primaryKey(),
  name: text("name"),
  dob: date("dob"),
  gender: text("gender"), // male | female
  heightCm: numeric("height_cm"),
  currentWeightKg: numeric("current_weight_kg"),
  goal: text("goal"), // build_muscle | lose_fat | lean_bulk | recomp | athletic | general
  activityLevel: text("activity_level"),
  gymExperience: text("gym_experience"),
  dietType: text("diet_type"), // veg | eggetarian | non_veg | vegan
  allergies: text("allergies").array(),
  foodsAvoided: text("foods_avoided").array(),
  // budgetLevel: removed from onboarding (column left in DB, nullable, unused)
  cuisineNotes: text("cuisine_notes"),
  schedule: jsonb("schedule"), // { wake, sleep, gym, meals }
  targets: jsonb("targets"), // { kcal, proteinG, carbsG, fatG, waterMl, steps }
  targetsHistory: jsonb("targets_history").array(),
  ...timestamps(),
});

// ── Food memory ─────────────────────────────────────────────────────────────
export const foodMemory = pgTable("food_memory", {
  id: id(),
  userId: userId(),
  canonicalName: text("canonical_name").notNull(),
  embedding: vector("embedding", { dimensions: 768 }), // populated in Sprint 2
  servingUnit: text("serving_unit").notNull(),
  servingQty: numeric("serving_qty").notNull().default("1"),
  kcal: numeric("kcal"),
  proteinG: numeric("protein_g"),
  carbsG: numeric("carbs_g"),
  fatG: numeric("fat_g"),
  fiberG: numeric("fiber_g"),
  source: text("source"), // llm_estimate | reference_db | user_entered | photo
  confidence: numeric("confidence"),
  assumptions: text("assumptions"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  timesLogged: integer("times_logged").notNull().default(0),
  lastLoggedAt: timestamp("last_logged_at", { withTimezone: true }),
  ...timestamps(),
}, (t) => [
  index("food_memory_user_recent_idx").on(t.userId, t.lastLoggedAt),
  index("food_memory_user_frequent_idx").on(t.userId, t.timesLogged),
]);

export const foodAliases = pgTable(
  "food_aliases",
  {
    id: id(),
    userId: userId(),
    foodMemoryId: uuid("food_memory_id")
      .notNull()
      .references(() => foodMemory.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(), // normalized lowercase
    ...timestamps(),
  },
  (t) => [uniqueIndex("food_aliases_user_alias_uq").on(t.userId, t.alias)],
);

// ── Meal logs ───────────────────────────────────────────────────────────────
export const mealLogs = pgTable("meal_logs", {
  id: id(),
  userId: userId(),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  mealType: text("meal_type"), // breakfast | lunch | snack | post_workout | dinner (legacy: other)
  rawInput: text("raw_input").notNull(), // exact user utterance — always kept
  inputMode: text("input_mode"), // text | voice | photo | quick_pick
  photoPath: text("photo_path"),
  ...timestamps(),
}, (t) => [
  index("meal_logs_user_logged_idx").on(t.userId, t.loggedAt),
  index("meal_logs_user_type_logged_idx").on(t.userId, t.mealType, t.loggedAt),
]);

export const mealLogItems = pgTable("meal_log_items", {
  id: id(),
  userId: userId(),
  mealLogId: uuid("meal_log_id")
    .notNull()
    .references(() => mealLogs.id, { onDelete: "cascade" }),
  foodMemoryId: uuid("food_memory_id").references(() => foodMemory.id), // null when not saved to memory
  name: text("name"), // name snapshot at log time (added 2026-09-05; older rows null → join food_memory)
  qty: numeric("qty").notNull(),
  unit: text("unit"),
  // denormalized nutrition snapshot at log time
  kcal: numeric("kcal"),
  proteinG: numeric("protein_g"),
  carbsG: numeric("carbs_g"),
  fatG: numeric("fat_g"),
  fiberG: numeric("fiber_g"),
  ...timestamps(),
}, (t) => [index("meal_log_items_log_idx").on(t.mealLogId)]);

// ── Exercises & workouts ────────────────────────────────────────────────────
export const exercises = pgTable("exercises", {
  id: id(),
  userId: uuid("user_id"), // null = global/seeded exercise
  name: text("name").notNull(),
  muscleGroup: text("muscle_group"),
  equipment: text("equipment"),
  isCustom: boolean("is_custom").notNull().default(false),
  ...timestamps(),
});

export const workoutPlans = pgTable("workout_plans", {
  id: id(),
  userId: userId(),
  name: text("name").notNull(),
  ...timestamps(),
});

export const planExercises = pgTable("plan_exercises", {
  id: id(),
  userId: userId(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => workoutPlans.id, { onDelete: "cascade" }),
  exerciseId: uuid("exercise_id").references(() => exercises.id),
  dayLabel: text("day_label"),
  targetSets: integer("target_sets"),
  targetReps: integer("target_reps"),
  targetRestSec: integer("target_rest_sec"),
  orderIndex: integer("order_index"),
  ...timestamps(),
});

export const workoutSessions = pgTable("workout_sessions", {
  id: id(),
  userId: userId(),
  planId: uuid("plan_id").references(() => workoutPlans.id),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  notes: text("notes"),
  ...timestamps(),
}, (t) => [index("workout_sessions_user_started_idx").on(t.userId, t.startedAt)]);

export const sessionSets = pgTable("session_sets", {
  id: id(),
  userId: userId(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => workoutSessions.id, { onDelete: "cascade" }),
  exerciseId: uuid("exercise_id").references(() => exercises.id),
  setNumber: integer("set_number"),
  weightKg: numeric("weight_kg"),
  reps: integer("reps"),
  rpe: numeric("rpe"),
  isPr: boolean("is_pr").notNull().default(false),
  ...timestamps(),
}, (t) => [
  index("session_sets_session_idx").on(t.sessionId),
  index("session_sets_user_exercise_idx").on(t.userId, t.exerciseId, t.createdAt),
]);

// ── Daily metric logs ───────────────────────────────────────────────────────
export const weightLogs = pgTable("weight_logs", {
  id: id(),
  userId: userId(),
  date: date("date").notNull(),
  weightKg: numeric("weight_kg").notNull(),
  ...timestamps(),
}, (t) => [index("weight_logs_user_date_idx").on(t.userId, t.date)]);

export const waterLogs = pgTable("water_logs", {
  id: id(),
  userId: userId(),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  ml: integer("ml").notNull(),
  ...timestamps(),
}, (t) => [index("water_logs_user_logged_idx").on(t.userId, t.loggedAt)]);

export const sleepLogs = pgTable("sleep_logs", {
  id: id(),
  userId: userId(),
  date: date("date").notNull(),
  minutes: integer("minutes").notNull(),
  ...timestamps(),
});

export const stepsLogs = pgTable("steps_logs", {
  id: id(),
  userId: userId(),
  date: date("date").notNull(),
  steps: integer("steps").notNull(),
  ...timestamps(),
});

// ── Body reports, measurements, photos ──────────────────────────────────────
export const bodyReports = pgTable("body_reports", {
  id: id(),
  userId: userId(),
  reportType: text("report_type"), // inbody | dexa | blood | other
  reportDate: date("report_date"),
  filePath: text("file_path"),
  metrics: jsonb("metrics"),
  aiSummary: text("ai_summary"),
  ...timestamps(),
});

export const measurements = pgTable("measurements", {
  id: id(),
  userId: userId(),
  date: date("date").notNull(),
  chestCm: numeric("chest_cm"),
  waistCm: numeric("waist_cm"),
  hipsCm: numeric("hips_cm"),
  armCm: numeric("arm_cm"),
  thighCm: numeric("thigh_cm"),
  ...timestamps(),
});

export const progressPhotos = pgTable("progress_photos", {
  id: id(),
  userId: userId(),
  date: date("date").notNull(),
  filePath: text("file_path").notNull(),
  pose: text("pose"), // front | side | back
  notes: text("notes"),
  ...timestamps(),
});

// ── Reviews, coach, long-term memory ────────────────────────────────────────
export const reviews = pgTable("reviews", {
  id: id(),
  userId: userId(),
  periodType: text("period_type"), // weekly | monthly
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  stats: jsonb("stats"),
  narrative: text("narrative"),
  suggestions: jsonb("suggestions"),
  ...timestamps(),
});

export const coachNotes = pgTable("coach_notes", {
  id: id(),
  userId: userId(),
  date: date("date").notNull(),
  kind: text("kind"), // daily_brief | insight | alert
  content: text("content"),
  sourceMetrics: jsonb("source_metrics"),
  acknowledged: boolean("acknowledged").notNull().default(false),
  ...timestamps(),
});

export const userFacts = pgTable("user_facts", {
  id: id(),
  userId: userId(),
  fact: text("fact").notNull(),
  category: text("category"), // habit | preference | supplement | constraint | other
  source: text("source"), // stated | inferred
  confidence: numeric("confidence"),
  lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),
  ...timestamps(),
});
