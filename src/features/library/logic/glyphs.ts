/**
 * Icons for the exercise hero overlays (equipment glyph, difficulty). Typed as full Records so a
 * new content enum value fails the type check until it gets a glyph.
 */
import type { Equipment, Level } from '@repwise/content';
import {
  Activity,
  Bike,
  Box,
  Cable,
  CircleDot,
  Cog,
  Disc,
  Disc3,
  Dumbbell,
  Footprints,
  GripHorizontal,
  Layers2,
  MoveHorizontal,
  PersonStanding,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Spline,
  Waves,
  Weight,
  type LucideIcon,
} from 'lucide-react-native';

export const EQUIPMENT_GLYPH: Record<Equipment, LucideIcon> = {
  bodyweight: PersonStanding,
  dumbbell: Dumbbell,
  barbell: Dumbbell,
  ez_bar: Dumbbell,
  trap_bar: Dumbbell,
  kettlebell: Weight,
  cable: Cable,
  machine: Cog,
  smith_machine: Cog,
  band: Spline,
  bench: Layers2,
  squat_rack: Layers2,
  pull_up_bar: GripHorizontal,
  dip_station: GripHorizontal,
  landmine: Dumbbell,
  box: Box,
  medicine_ball: CircleDot,
  suspension_trainer: Cable,
  ab_wheel: Disc3,
  stability_ball: CircleDot,
  weight_plate: Disc,
  sled: MoveHorizontal,
  jump_rope: Activity,
  treadmill: Footprints,
  bike: Bike,
  rower: Waves,
  elliptical: Footprints,
  stair_climber: Footprints,
  foam_roller: Layers2,
  mat: Layers2,
};

export const LEVEL_GLYPH: Record<Level, LucideIcon> = {
  beginner: SignalLow,
  intermediate: SignalMedium,
  advanced: SignalHigh,
};

/** The kit that defines the exercise: accessories (bench, rack) only when nothing else is listed. */
export function mainEquipment(equipment: readonly Equipment[]): Equipment | null {
  return equipment.find((e) => e !== 'bench' && e !== 'squat_rack') ?? equipment[0] ?? null;
}
