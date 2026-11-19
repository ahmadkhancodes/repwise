/**
 * Quiz copy: questions and answer options (sheet 10 S03–S05). Data only, no UI.
 * No medical claims or advice anywhere (CLAUDE.md "Never").
 */
import type {
  Allergen,
  Cuisine,
  DietType,
  Equipment,
  Experience,
  Goal,
  Injury,
  Lifestyle,
  Sex,
} from '@/features/planner/engine';

import type { Location } from './answers';
import type { StepId } from './steps';

export type Option<T> = { value: T; label: string; detail?: string };

export const QUESTIONS: Record<StepId, { title: string; subtitle?: string }> = {
  goal: {
    title: 'What do you want to achieve?',
    subtitle: 'We build your training and meals around it.',
  },
  about: { title: 'About you', subtitle: 'Used for your calorie and macro targets.' },
  body: {
    title: 'Your height and weight',
    subtitle: 'Only stored on this phone unless you back up.',
  },
  target: {
    title: 'Do you have a target weight?',
    subtitle: 'Optional. We use it to show a goal date.',
  },
  experience: { title: 'How long have you been lifting?' },
  days: {
    title: 'Which days can you train?',
    subtitle: 'Pick how many, then the days that suit you.',
  },
  length: { title: 'How long is a session?' },
  equipment: { title: 'Where do you train?', subtitle: 'Every exercise will fit your kit.' },
  injuries: {
    title: 'Anything to go easy on?',
    subtitle: 'We leave out moves that load these areas. This is not medical advice.',
  },
  activity: { title: 'How active are your days?', subtitle: 'Outside of training.' },
  diet: { title: 'How do you eat?' },
  avoid: {
    title: 'Anything to avoid?',
    subtitle: 'Allergies are never in your plan. Dislikes neither.',
  },
  cuisines: { title: 'Cuisines you love', subtitle: 'Optional. We still rotate for variety.' },
  kitchen: { title: 'Your kitchen', subtitle: 'Budget per meal and time to cook.' },
  meals: { title: 'Meals per day', subtitle: 'We remind you at these times.' },
};

export const GOAL_OPTIONS: Option<Goal>[] = [
  { value: 'fat_loss', label: 'Lose fat', detail: 'Lean out and keep your strength' },
  { value: 'muscle_gain', label: 'Build muscle', detail: 'Get bigger and stronger' },
  { value: 'recomp', label: 'Recomposition', detail: 'Lose fat and build muscle slowly' },
  { value: 'maintain', label: 'Stay fit', detail: 'Keep your shape, train well' },
];

export const SEX_OPTIONS: Option<Sex>[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

export const EXPERIENCE_OPTIONS: Option<Experience>[] = [
  { value: 'beginner', label: 'New to it', detail: 'Less than 6 months' },
  { value: 'intermediate', label: 'Some experience', detail: '6 months to 2 years' },
  { value: 'advanced', label: 'Experienced', detail: 'More than 2 years' },
];

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAY_LONG = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const LOCATION_OPTIONS: Option<Location>[] = [
  { value: 'gym', label: 'Gym', detail: 'Barbells, machines, cables' },
  { value: 'home', label: 'Home', detail: 'Dumbbells, a bench, bands' },
  { value: 'bodyweight', label: 'No equipment', detail: 'Bodyweight only' },
];

/** Equipment the user can toggle (engine profile vocabulary). */
export const EQUIPMENT_OPTIONS: Option<Equipment>[] = [
  { value: 'dumbbell', label: 'Dumbbells' },
  { value: 'barbell', label: 'Barbell' },
  { value: 'squat_rack', label: 'Squat rack' },
  { value: 'bench', label: 'Bench' },
  { value: 'kettlebell', label: 'Kettlebells' },
  { value: 'band', label: 'Bands' },
  { value: 'pullup_bar', label: 'Pull-up bar' },
  { value: 'cable', label: 'Cables' },
  { value: 'machine', label: 'Machines' },
  { value: 'smith', label: 'Smith machine' },
  { value: 'ez_bar', label: 'EZ bar' },
  { value: 'trap_bar', label: 'Trap bar' },
  { value: 'dip_station', label: 'Dip station' },
  { value: 'cardio_machine', label: 'Cardio machines' },
];

export const INJURY_OPTIONS: Option<Injury>[] = [
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'wrist', label: 'Wrist' },
  { value: 'neck', label: 'Neck' },
  { value: 'lower_back', label: 'Lower back' },
  { value: 'hip', label: 'Hip' },
  { value: 'knee', label: 'Knee' },
  { value: 'ankle', label: 'Ankle' },
];

export const ACTIVITY_OPTIONS: Option<Lifestyle>[] = [
  { value: 'sedentary', label: 'Mostly sitting', detail: 'Desk job, under 5,000 steps' },
  { value: 'light', label: 'Lightly active', detail: 'Some walking, 5–8k steps' },
  { value: 'moderate', label: 'Active', detail: 'On your feet a lot, 8–12k steps' },
  { value: 'active', label: 'Very active', detail: 'Physical job, 12k+ steps' },
];

export const DIET_OPTIONS: Option<DietType>[] = [
  { value: 'omnivore', label: 'Everything', detail: 'Meat, fish, eggs and plants' },
  { value: 'halal', label: 'Halal' },
  { value: 'pescatarian', label: 'Pescatarian', detail: 'Fish, no meat' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'keto', label: 'Keto', detail: 'Very low carb' },
];

export const ALLERGY_OPTIONS: Option<Allergen>[] = [
  { value: 'dairy', label: 'Milk' },
  { value: 'egg', label: 'Eggs' },
  { value: 'gluten', label: 'Gluten' },
  { value: 'nuts', label: 'Tree nuts' },
  { value: 'peanut', label: 'Peanuts' },
  { value: 'soy', label: 'Soy' },
  { value: 'fish', label: 'Fish' },
  { value: 'shellfish', label: 'Shellfish' },
  { value: 'sesame', label: 'Sesame' },
  { value: 'celery', label: 'Celery' },
  { value: 'mustard', label: 'Mustard' },
  { value: 'lupin', label: 'Lupin' },
  { value: 'sulphites', label: 'Sulphites' },
];

/** Dislikes are ingredient ids from the food catalogue (the engine matches id or name). */
export const DISLIKE_OPTIONS: Option<string>[] = [
  { value: 'mushrooms', label: 'Mushrooms' },
  { value: 'olives', label: 'Olives' },
  { value: 'coriander-leaves', label: 'Coriander' },
  { value: 'aubergine', label: 'Aubergine' },
  { value: 'tofu', label: 'Tofu' },
  { value: 'avocado', label: 'Avocado' },
  { value: 'beetroot', label: 'Beetroot' },
  { value: 'spinach', label: 'Spinach' },
  { value: 'broccoli', label: 'Broccoli' },
  { value: 'prawns', label: 'Prawns' },
  { value: 'salmon', label: 'Salmon' },
  { value: 'tuna', label: 'Tuna' },
  { value: 'cottage-cheese', label: 'Cottage cheese' },
  { value: 'chickpeas', label: 'Chickpeas' },
];

/** The content catalogue's cuisine groups (engine values since D26). */
export const CUISINE_OPTIONS: Option<Cuisine>[] = [
  { value: 'pakistani', label: 'Pakistani' },
  { value: 'indian', label: 'Indian' },
  { value: 'middle_eastern', label: 'Middle Eastern' },
  { value: 'gulf', label: 'Gulf' },
  { value: 'north_african', label: 'North African' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'italian', label: 'Italian' },
  { value: 'british', label: 'British' },
  { value: 'american', label: 'American' },
  { value: 'mexican', label: 'Mexican' },
  { value: 'east_asian', label: 'East Asian' },
  { value: 'southeast_asian', label: 'Southeast Asian' },
  { value: 'global', label: 'Anything' },
];

export const BUDGET_OPTIONS: Option<'1' | '2' | '3'>[] = [
  { value: '1', label: 'Budget' },
  { value: '2', label: 'Medium' },
  { value: '3', label: 'Premium' },
];

export function labelOf<T>(options: readonly Option<T>[], value: T | null | undefined): string {
  return options.find((o) => o.value === value)?.label ?? '';
}
