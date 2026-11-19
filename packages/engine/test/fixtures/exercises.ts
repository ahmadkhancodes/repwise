/**
 * Small fixture exercise catalogue (shape = ExerciseSchema). Not real content: steps/tips are
 * placeholders. Covers every pattern with 6+ variants across gym and home equipment.
 */
import { ExerciseCatalogueSchema, type Equipment, type Exercise, type ExerciseInput, type Injury, type Muscle, type Pattern } from '../../src';

type Row = [id: string, name: string, pattern: Pattern, primary: Muscle[], secondary: Muscle[], equipment: Equipment[], level: 1 | 2 | 3, unilateral: boolean, contra: Injury[], met?: number];

const CHEST: [Muscle[], Muscle[]] = [['chest'], ['front_delts', 'triceps']];
const SQUAT: [Muscle[], Muscle[]] = [['quads', 'glutes'], ['hamstrings', 'adductors']];
const HINGE: [Muscle[], Muscle[]] = [['hamstrings', 'glutes'], ['lower_back']];
const VPRESS: [Muscle[], Muscle[]] = [['front_delts'], ['triceps', 'side_delts']];
const ROW: [Muscle[], Muscle[]] = [['upper_back', 'lats'], ['biceps', 'rear_delts']];
const PULLDOWN: [Muscle[], Muscle[]] = [['lats'], ['biceps', 'upper_back']];
const LUNGE: [Muscle[], Muscle[]] = [['quads', 'glutes'], ['hamstrings', 'adductors']];

const rows: Row[] = [
  // squat
  ['back_squat', 'Back squat', 'squat', ...SQUAT, ['barbell'], 2, false, ['knee', 'lower_back']],
  ['front_squat', 'Front squat', 'squat', ...SQUAT, ['barbell'], 3, false, ['knee', 'wrist']],
  ['goblet_squat', 'Goblet squat', 'squat', ...SQUAT, ['dumbbell'], 1, false, ['knee']],
  ['leg_press', 'Leg press', 'squat', ...SQUAT, ['machine'], 1, false, ['knee']],
  ['hack_squat', 'Hack squat', 'squat', ...SQUAT, ['machine'], 2, false, ['knee']],
  ['smith_squat', 'Smith machine squat', 'squat', ...SQUAT, ['smith'], 1, false, ['knee']],
  ['bodyweight_squat', 'Bodyweight squat', 'squat', ...SQUAT, ['bodyweight'], 1, false, []],
  ['kb_goblet_squat', 'Kettlebell goblet squat', 'squat', ...SQUAT, ['kettlebell'], 1, false, ['knee']],
  ['band_squat', 'Band squat', 'squat', ...SQUAT, ['band'], 1, false, []],
  ['box_squat', 'Box squat', 'squat', ...SQUAT, ['bodyweight', 'bench'], 1, false, []],
  // hinge
  ['deadlift', 'Deadlift', 'hinge', ...HINGE, ['barbell'], 2, false, ['lower_back']],
  ['romanian_deadlift', 'Romanian deadlift', 'hinge', ...HINGE, ['barbell'], 2, false, ['lower_back']],
  ['dumbbell_rdl', 'Dumbbell Romanian deadlift', 'hinge', ...HINGE, ['dumbbell'], 1, false, ['lower_back']],
  ['trap_bar_deadlift', 'Trap bar deadlift', 'hinge', ...HINGE, ['trap_bar'], 2, false, []],
  ['hip_thrust', 'Barbell hip thrust', 'hinge', ['glutes'], ['hamstrings'], ['barbell', 'bench'], 1, false, []],
  ['glute_bridge', 'Glute bridge', 'hinge', ['glutes'], ['hamstrings'], ['bodyweight'], 1, false, []],
  ['kb_swing', 'Kettlebell swing', 'hinge', ...HINGE, ['kettlebell'], 2, false, ['lower_back']],
  ['cable_pull_through', 'Cable pull-through', 'hinge', ...HINGE, ['cable'], 1, false, []],
  ['back_extension', 'Back extension', 'hinge', ['hamstrings', 'glutes'], ['lower_back'], ['machine'], 1, false, ['lower_back']],
  ['single_leg_rdl', 'Single-leg Romanian deadlift', 'hinge', ...HINGE, ['bodyweight'], 1, true, []],
  ['band_good_morning', 'Band good morning', 'hinge', ...HINGE, ['band'], 1, false, []],
  ['dumbbell_hip_thrust', 'Dumbbell hip thrust', 'hinge', ['glutes'], ['hamstrings'], ['dumbbell', 'bench'], 1, false, []],
  // push_h
  ['bench_press', 'Bench press', 'push_h', ...CHEST, ['barbell', 'bench'], 1, false, ['shoulder']],
  ['incline_bench_press', 'Incline bench press', 'push_h', ...CHEST, ['barbell', 'bench'], 2, false, ['shoulder']],
  ['dumbbell_bench_press', 'Dumbbell bench press', 'push_h', ...CHEST, ['dumbbell', 'bench'], 1, false, []],
  ['incline_dumbbell_press', 'Incline dumbbell press', 'push_h', ...CHEST, ['dumbbell', 'bench'], 1, false, []],
  ['machine_chest_press', 'Machine chest press', 'push_h', ...CHEST, ['machine'], 1, false, []],
  ['push_up', 'Push-up', 'push_h', ...CHEST, ['bodyweight'], 1, false, ['wrist']],
  ['decline_push_up', 'Decline push-up', 'push_h', ...CHEST, ['bodyweight', 'bench'], 2, false, ['wrist']],
  ['cable_chest_press', 'Cable chest press', 'push_h', ...CHEST, ['cable'], 1, false, []],
  ['band_chest_press', 'Band chest press', 'push_h', ...CHEST, ['band'], 1, false, []],
  ['dip', 'Dip', 'push_h', ...CHEST, ['bodyweight'], 2, false, ['shoulder']],
  // push_v
  ['overhead_press', 'Overhead press', 'push_v', ...VPRESS, ['barbell'], 2, false, ['shoulder']],
  ['seated_dumbbell_press', 'Seated dumbbell press', 'push_v', ...VPRESS, ['dumbbell', 'bench'], 1, false, ['shoulder']],
  ['arnold_press', 'Arnold press', 'push_v', ...VPRESS, ['dumbbell'], 2, false, ['shoulder']],
  ['machine_shoulder_press', 'Machine shoulder press', 'push_v', ...VPRESS, ['machine'], 1, false, ['shoulder']],
  ['pike_push_up', 'Pike push-up', 'push_v', ...VPRESS, ['bodyweight'], 2, false, ['shoulder', 'wrist']],
  ['landmine_press', 'Landmine press', 'push_v', ...VPRESS, ['barbell'], 2, true, []],
  ['band_overhead_press', 'Half-kneeling band press', 'push_v', ...VPRESS, ['band'], 1, false, []],
  ['kb_press', 'Kettlebell press', 'push_v', ...VPRESS, ['kettlebell'], 2, true, ['shoulder']],
  ['single_arm_db_press', 'Single-arm dumbbell press', 'push_v', ...VPRESS, ['dumbbell'], 1, true, []],
  // pull_h
  ['barbell_row', 'Barbell row', 'pull_h', ...ROW, ['barbell'], 2, false, ['lower_back']],
  ['dumbbell_row', 'One-arm dumbbell row', 'pull_h', ...ROW, ['dumbbell', 'bench'], 1, true, []],
  ['seated_cable_row', 'Seated cable row', 'pull_h', ...ROW, ['cable'], 1, false, []],
  ['chest_supported_row', 'Chest-supported dumbbell row', 'pull_h', ...ROW, ['dumbbell', 'bench'], 1, false, []],
  ['machine_row', 'Machine row', 'pull_h', ...ROW, ['machine'], 1, false, []],
  ['inverted_row', 'Inverted row', 'pull_h', ...ROW, ['pullup_bar'], 1, false, []],
  ['band_row', 'Band row', 'pull_h', ...ROW, ['band'], 1, false, []],
  ['kb_row', 'Kettlebell row', 'pull_h', ...ROW, ['kettlebell'], 1, true, []],
  ['t_bar_row', 'T-bar row', 'pull_h', ...ROW, ['barbell'], 2, false, ['lower_back']],
  ['towel_row', 'Door towel row', 'pull_h', ...ROW, ['bodyweight'], 1, false, []],
  // pull_v
  ['pull_up', 'Pull-up', 'pull_v', ...PULLDOWN, ['pullup_bar'], 2, false, []],
  ['chin_up', 'Chin-up', 'pull_v', ['lats', 'biceps'], ['upper_back'], ['pullup_bar'], 2, false, []],
  ['lat_pulldown', 'Lat pulldown', 'pull_v', ...PULLDOWN, ['cable'], 1, false, []],
  ['close_grip_pulldown', 'Close-grip pulldown', 'pull_v', ...PULLDOWN, ['cable'], 1, false, []],
  ['assisted_pull_up', 'Assisted pull-up', 'pull_v', ...PULLDOWN, ['machine'], 1, false, []],
  ['band_pulldown', 'Band pulldown', 'pull_v', ...PULLDOWN, ['band'], 1, false, []],
  ['single_arm_pulldown', 'Single-arm cable pulldown', 'pull_v', ...PULLDOWN, ['cable'], 1, true, []],
  ['straight_arm_pulldown', 'Straight-arm pulldown', 'pull_v', ['lats'], ['triceps'], ['cable'], 1, false, []],
  ['band_straight_arm_pulldown', 'Band straight-arm pulldown', 'pull_v', ['lats'], [], ['band'], 1, false, []],
  ['db_pullover', 'Dumbbell pullover', 'pull_v', ['lats'], ['chest'], ['dumbbell', 'bench'], 1, false, ['shoulder']],
  // lunge
  ['walking_lunge', 'Walking lunge', 'lunge', ...LUNGE, ['dumbbell'], 1, true, ['knee']],
  ['reverse_lunge', 'Reverse lunge', 'lunge', ...LUNGE, ['bodyweight'], 1, true, ['knee']],
  ['bulgarian_split_squat', 'Bulgarian split squat', 'lunge', ...LUNGE, ['dumbbell', 'bench'], 2, true, ['knee']],
  ['step_up', 'Step-up', 'lunge', ...LUNGE, ['dumbbell', 'bench'], 1, true, ['knee']],
  ['barbell_lunge', 'Barbell lunge', 'lunge', ...LUNGE, ['barbell'], 2, true, ['knee']],
  ['split_squat', 'Split squat', 'lunge', ...LUNGE, ['bodyweight'], 1, true, ['knee']],
  ['lateral_lunge', 'Lateral lunge', 'lunge', ['quads', 'glutes'], ['adductors'], ['bodyweight'], 1, true, []],
  ['smith_split_squat', 'Smith split squat', 'lunge', ...LUNGE, ['smith'], 1, true, ['knee']],
  // core
  ['plank', 'Plank', 'core', ['abs'], ['obliques'], ['bodyweight'], 1, false, []],
  ['side_plank', 'Side plank', 'core', ['obliques'], ['abs'], ['bodyweight'], 1, true, []],
  ['dead_bug', 'Dead bug', 'core', ['abs'], [], ['bodyweight'], 1, false, []],
  ['hanging_leg_raise', 'Hanging leg raise', 'core', ['abs'], ['forearms'], ['pullup_bar'], 2, false, []],
  ['cable_crunch', 'Cable crunch', 'core', ['abs'], [], ['cable'], 1, false, []],
  ['ab_wheel', 'Ab wheel rollout', 'core', ['abs'], ['lats'], ['bodyweight'], 2, false, ['lower_back']],
  ['pallof_press', 'Pallof press', 'core', ['obliques'], ['abs'], ['cable'], 1, false, []],
  ['bird_dog', 'Bird dog', 'core', ['abs'], ['lower_back'], ['bodyweight'], 1, false, []],
  ['band_pallof', 'Band Pallof press', 'core', ['obliques'], ['abs'], ['band'], 1, false, []],
  ['bicycle_crunch', 'Bicycle crunch', 'core', ['abs'], ['obliques'], ['bodyweight'], 1, false, []],
  // carry
  ['farmers_walk', "Farmer's walk", 'carry', ['forearms', 'traps'], ['abs'], ['dumbbell'], 1, false, []],
  ['suitcase_carry', 'Suitcase carry', 'carry', ['obliques', 'forearms'], ['traps'], ['kettlebell'], 1, true, []],
  // isolation: side delts
  ['lateral_raise', 'Dumbbell lateral raise', 'isolation', ['side_delts'], [], ['dumbbell'], 1, false, []],
  ['cable_lateral_raise', 'Cable lateral raise', 'isolation', ['side_delts'], [], ['cable'], 1, true, []],
  ['machine_lateral_raise', 'Machine lateral raise', 'isolation', ['side_delts'], [], ['machine'], 1, false, []],
  ['band_lateral_raise', 'Band lateral raise', 'isolation', ['side_delts'], [], ['band'], 1, false, []],
  ['lean_away_lateral_raise', 'Lean-away lateral raise', 'isolation', ['side_delts'], [], ['dumbbell'], 2, true, []],
  // rear delts
  ['reverse_pec_deck', 'Reverse pec deck', 'isolation', ['rear_delts'], ['upper_back'], ['machine'], 1, false, []],
  ['face_pull', 'Face pull', 'isolation', ['rear_delts'], ['upper_back'], ['cable'], 1, false, []],
  ['band_pull_apart', 'Band pull-apart', 'isolation', ['rear_delts'], ['upper_back'], ['band'], 1, false, []],
  ['rear_delt_fly', 'Dumbbell rear delt fly', 'isolation', ['rear_delts'], ['upper_back'], ['dumbbell'], 1, false, []],
  ['prone_y_raise', 'Prone Y raise', 'isolation', ['rear_delts'], ['traps'], ['bodyweight'], 1, false, []],
  // biceps
  ['barbell_curl', 'Barbell curl', 'isolation', ['biceps'], ['forearms'], ['barbell'], 1, false, ['elbow']],
  ['dumbbell_curl', 'Dumbbell curl', 'isolation', ['biceps'], ['forearms'], ['dumbbell'], 1, false, []],
  ['hammer_curl', 'Hammer curl', 'isolation', ['biceps'], ['forearms'], ['dumbbell'], 1, false, []],
  ['incline_curl', 'Incline dumbbell curl', 'isolation', ['biceps'], [], ['dumbbell', 'bench'], 2, false, []],
  ['cable_curl', 'Cable curl', 'isolation', ['biceps'], ['forearms'], ['cable'], 1, false, []],
  ['preacher_curl', 'EZ-bar preacher curl', 'isolation', ['biceps'], [], ['ez_bar', 'bench'], 1, false, ['elbow']],
  ['band_curl', 'Band curl', 'isolation', ['biceps'], [], ['band'], 1, false, []],
  ['concentration_curl', 'Concentration curl', 'isolation', ['biceps'], [], ['dumbbell'], 1, true, []],
  // triceps
  ['triceps_pushdown', 'Triceps pushdown', 'isolation', ['triceps'], [], ['cable'], 1, false, []],
  ['overhead_cable_extension', 'Overhead cable extension', 'isolation', ['triceps'], [], ['cable'], 1, false, []],
  ['skull_crusher', 'Skull crusher', 'isolation', ['triceps'], [], ['ez_bar', 'bench'], 2, false, ['elbow']],
  ['db_overhead_extension', 'Dumbbell overhead extension', 'isolation', ['triceps'], [], ['dumbbell'], 1, false, []],
  ['bench_dip', 'Bench dip', 'isolation', ['triceps'], ['chest'], ['bodyweight', 'bench'], 1, false, ['shoulder']],
  ['close_grip_push_up', 'Close-grip push-up', 'isolation', ['triceps'], ['chest'], ['bodyweight'], 1, false, ['wrist']],
  ['band_pushdown', 'Band pushdown', 'isolation', ['triceps'], [], ['band'], 1, false, []],
  ['db_kickback', 'Dumbbell kickback', 'isolation', ['triceps'], [], ['dumbbell'], 1, true, []],
  // quads
  ['leg_extension', 'Leg extension', 'isolation', ['quads'], [], ['machine'], 1, false, []],
  ['single_leg_extension', 'Single-leg extension', 'isolation', ['quads'], [], ['machine'], 1, true, []],
  ['sissy_squat', 'Sissy squat', 'isolation', ['quads'], [], ['bodyweight'], 3, false, ['knee']],
  ['spanish_squat', 'Band Spanish squat', 'isolation', ['quads'], [], ['band'], 1, false, []],
  ['wall_sit', 'Wall sit', 'isolation', ['quads'], [], ['bodyweight'], 1, false, []],
  ['reverse_nordic', 'Reverse Nordic', 'isolation', ['quads'], [], ['bodyweight'], 2, false, ['knee']],
  ['heel_elevated_goblet', 'Heel-elevated goblet squat', 'isolation', ['quads'], ['glutes'], ['dumbbell'], 1, false, ['knee']],
  // hamstrings
  ['lying_leg_curl', 'Lying leg curl', 'isolation', ['hamstrings'], ['calves'], ['machine'], 1, false, []],
  ['seated_leg_curl', 'Seated leg curl', 'isolation', ['hamstrings'], [], ['machine'], 1, false, []],
  ['nordic_curl', 'Nordic curl', 'isolation', ['hamstrings'], [], ['bodyweight'], 3, false, ['knee']],
  ['slider_leg_curl', 'Slider leg curl', 'isolation', ['hamstrings'], ['glutes'], ['bodyweight'], 2, false, []],
  ['band_leg_curl', 'Band leg curl', 'isolation', ['hamstrings'], [], ['band'], 1, false, []],
  ['db_leg_curl', 'Dumbbell leg curl', 'isolation', ['hamstrings'], [], ['dumbbell', 'bench'], 1, false, []],
  ['single_leg_curl', 'Single-leg curl', 'isolation', ['hamstrings'], [], ['machine'], 1, true, []],
  ['stability_ham_bridge', 'Hamstring bridge', 'isolation', ['hamstrings'], ['glutes'], ['bodyweight'], 1, false, []],
  // calves
  ['standing_calf_raise', 'Standing calf raise', 'isolation', ['calves'], [], ['machine'], 1, false, []],
  ['seated_calf_raise', 'Seated calf raise', 'isolation', ['calves'], [], ['machine'], 1, false, []],
  ['single_leg_calf_raise', 'Single-leg calf raise', 'isolation', ['calves'], [], ['bodyweight'], 1, true, []],
  ['db_calf_raise', 'Dumbbell calf raise', 'isolation', ['calves'], [], ['dumbbell'], 1, false, []],
  ['smith_calf_raise', 'Smith calf raise', 'isolation', ['calves'], [], ['smith'], 1, false, []],
  ['leg_press_calf_raise', 'Leg press calf raise', 'isolation', ['calves'], [], ['machine'], 1, false, []],
  ['bodyweight_calf_raise', 'Calf raise', 'isolation', ['calves'], [], ['bodyweight'], 1, false, []],
  // glutes
  ['cable_kickback', 'Cable glute kickback', 'isolation', ['glutes'], [], ['cable'], 1, true, []],
  ['hip_abduction', 'Hip abduction machine', 'isolation', ['glutes', 'abductors'], [], ['machine'], 1, false, []],
  ['band_clamshell', 'Band clamshell', 'isolation', ['glutes'], ['abductors'], ['band'], 1, true, []],
  ['frog_pump', 'Frog pump', 'isolation', ['glutes'], [], ['bodyweight'], 1, false, []],
  ['glute_kickback_machine', 'Glute kickback machine', 'isolation', ['glutes'], [], ['machine'], 1, true, []],
  ['single_leg_glute_bridge', 'Single-leg glute bridge', 'isolation', ['glutes'], ['hamstrings'], ['bodyweight'], 1, true, []],
  // chest
  ['cable_fly', 'Cable fly', 'isolation', ['chest'], ['front_delts'], ['cable'], 1, false, []],
  ['pec_deck', 'Pec deck', 'isolation', ['chest'], [], ['machine'], 1, false, []],
  ['dumbbell_fly', 'Dumbbell fly', 'isolation', ['chest'], [], ['dumbbell', 'bench'], 1, false, ['shoulder']],
  ['band_fly', 'Band fly', 'isolation', ['chest'], [], ['band'], 1, false, []],
  ['low_high_cable_fly', 'Low-to-high cable fly', 'isolation', ['chest'], ['front_delts'], ['cable'], 1, false, []],
  ['svend_press', 'Svend press', 'isolation', ['chest'], [], ['dumbbell'], 1, false, []],
  // cardio
  ['treadmill_run', 'Treadmill run', 'cardio', ['quads'], ['calves'], ['cardio_machine'], 1, false, ['knee'], 9.8],
  ['rower', 'Rowing machine', 'cardio', ['upper_back'], ['quads'], ['cardio_machine'], 1, false, [], 7],
  ['brisk_walk', 'Brisk walk', 'cardio', ['calves'], [], ['bodyweight'], 1, false, [], 3.5],
  ['jump_rope', 'Jump rope', 'cardio', ['calves'], ['quads'], ['bodyweight'], 2, false, ['ankle'], 11],
];

export const exerciseInputs: ExerciseInput[] = rows.map(([id, name, pattern, primary, secondary, equipment, level, unilateral, contra, met]) => ({
  id,
  name,
  aliases: [],
  pattern,
  primaryMuscles: primary,
  secondaryMuscles: secondary,
  equipment,
  level,
  unilateral,
  mediaId: `exercises/${id}`,
  contraindications: contra,
  ...(met !== undefined ? { met } : {}),
  steps: ['Set up', 'Brace', 'Move with control'],
  tips: ['Keep form strict', 'Breathe out on effort'],
  source: 'fixture',
  licence: 'CC0',
}));

export const exercises: Exercise[] = ExerciseCatalogueSchema.parse(exerciseInputs);
