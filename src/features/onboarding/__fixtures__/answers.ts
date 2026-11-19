import { EMPTY_ANSWERS, presetFor, type Answers } from '../logic/answers';
import { defaultMealTimes } from '../logic/mealTimes';

/** A fully answered quiz. */
export function fullAnswers(over: Partial<Answers> = {}): Answers {
  return {
    ...EMPTY_ANSWERS,
    goal: 'fat_loss',
    sex: 'female',
    birthYear: 1994,
    heightCm: 165,
    weightKg: 70,
    targetKg: 64,
    experience: 'beginner',
    daysPerWeek: 3,
    trainingWeekdays: [1, 3, 5],
    sessionMin: 45,
    location: 'home',
    equipment: presetFor('home'),
    injuries: [],
    lifestyle: 'light',
    dietType: 'omnivore',
    allergies: [],
    dislikes: [],
    cuisines: [],
    budget: 2,
    cookMin: 30,
    mealsPerDay: 3,
    mealTimes: defaultMealTimes(3),
    ...over,
  };
}
