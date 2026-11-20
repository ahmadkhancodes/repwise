import { router, useLocalSearchParams } from 'expo-router';
import { ChefHat, CircleAlert, Clock } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useCatalogFor } from '@/services/catalog';
import { useTheme } from '@/theme';
import { Badge, BigNumber, Button, Card, EmptyState, Screen, SkeletonGroup, Skeleton, SkeletonText, Stepper, Text } from '@/ui';
import { enterAt } from '@/ui/listMotion';

import { BackButton } from '../components/BackButton';
import { MacroChips } from '../components/MacroChips';
import { RecipeArt } from '../components/RecipeArt';
import { allergenLabel } from '../logic/allergens';
import { recipeArt } from '../logic/art';
import {
  COST_LABEL,
  SERVING_MAX,
  SERVING_MIN,
  SERVING_STEP,
  cuisineLabel,
  dietTagLabel,
  formatGrams,
  formatServings,
  macrosFor,
  scaledIngredients,
} from '../logic/recipe';

function initialServings(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= SERVING_MIN && n <= SERVING_MAX ? n : 1;
}

/** S24 Recipe: serving scaler, macros per serving, scaled ingredients, steps → cook mode. */
export function RecipeScreen() {
  const t = useTheme();
  const reduce = useReducedMotion();
  const params = useLocalSearchParams<{ id: string; portion?: string; mealId?: string }>();
  const cat = useCatalogFor('recipes', 'foods');
  const recipe = cat?.recipeById.get(String(params.id));
  const [servings, setServings] = useState(() => initialServings(params.portion));
  const ingredients = useMemo(
    () => (recipe && cat ? scaledIngredients(recipe, servings, cat.foodById) : []),
    [recipe, cat, servings],
  );

  if (!cat) {
    return (
      <Screen headerLeft={<BackButton />} testID="screen-recipe">
        <SkeletonGroup label="Loading recipe" testID="recipe-loading" style={{ gap: t.spacing.md }}>
          <Skeleton height={t.sizes.ringHero} radius={t.radius.card} />
          <SkeletonText variant="title1" lines={2} lastLineWidth="60%" />
          <Skeleton height={t.sizes.ring} radius={t.radius.card} />
        </SkeletonGroup>
      </Screen>
    );
  }
  if (!recipe) {
    return (
      <Screen title="Recipe" headerLeft={<BackButton />} testID="screen-recipe">
        <EmptyState icon={CircleAlert} title="Recipe not found" body="It may have been removed from the catalogue." testID="recipe-missing" />
      </Screen>
    );
  }

  const per = recipe.perServing;
  const total = macrosFor(recipe, servings);
  return (
    <Screen
      title={recipe.title}
      headerLeft={<BackButton />}
      testID="screen-recipe"
      footer={
        <Button
          label="Start cook mode"
          icon={ChefHat}
          testID="start-cook"
          onPress={() =>
            router.push({
              pathname: '/recipe/cook/[id]',
              params: { id: recipe.id, servings: String(servings), ...(params.mealId ? { mealId: params.mealId } : {}) },
            })
          }
        />
      }
    >
      <RecipeArt
        art={recipeArt(recipe)}
        size="hero"
        accessibilityLabel={`${recipeArt(recipe).label}: ${recipe.title}`}
        testID="recipe-hero"
      >
        <View
          style={{
            position: 'absolute',
            left: t.spacing.sm,
            bottom: t.spacing.sm,
            flexDirection: 'row',
            gap: t.spacing.xs,
            flexWrap: 'wrap',
          }}
        >
          <Badge label={cuisineLabel(recipe.cuisine)} tone="inverse" />
          <Badge label={`${recipe.prepMin + recipe.cookMin} min`} icon={Clock} tone="inverse" />
        </View>
      </RecipeArt>
      <Text variant="callout" color="textSecondary" testID="recipe-meta">
        {recipe.prepMin} min prep · {recipe.cookMin} min cook · {COST_LABEL[recipe.costTier]}
      </Text>

      <Card>
        <BigNumber value={Math.round(total.kcal)} unit="kcal" label={`For ${formatServings(servings)} ${servings === 1 ? 'serving' : 'servings'}`} testID="recipe-kcal" />
        <MacroChips protein={total.protein} carbs={total.carbs} fat={total.fat} testID="recipe-macros" />
        <Text variant="caption" color="textSecondary" tabular style={{ marginTop: t.spacing.xs }}>
          Per serving: {per.kcal} kcal · P {Math.round(per.protein)} g · C {Math.round(per.carbs)} g · F {Math.round(per.fat)} g
        </Text>
      </Card>

      <Stepper
        label="Servings"
        value={servings}
        onChange={setServings}
        min={SERVING_MIN}
        max={SERVING_MAX}
        step={SERVING_STEP}
        format={formatServings}
        unit={servings === 1 ? 'serving' : 'servings'}
        testID="servings"
      />

      {recipe.dietTags.length || recipe.allergens.length ? (
        <View style={{ gap: t.spacing.xxs }}>
          {recipe.dietTags.length ? (
            <Text variant="callout" color="accentText">
              {recipe.dietTags.map(dietTagLabel).join(' · ')}
            </Text>
          ) : null}
          {recipe.allergens.length ? (
            <Text variant="callout" color="textSecondary" testID="recipe-allergens">
              Contains: {recipe.allergens.map(allergenLabel).join(', ')}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Text variant="title2" accessibilityRole="header">
        Ingredients
      </Text>
      <View testID="recipe-ingredients">
        {ingredients.map((ing, i) => (
          <View
            key={ing.foodId}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: t.sizes.touch,
              gap: t.spacing.sm,
              borderBottomWidth: i === ingredients.length - 1 ? 0 : t.sizes.hairline,
              borderBottomColor: t.colors.border,
            }}
          >
            <Text style={{ flex: 1 }}>
              {ing.name}
              {ing.note ? <Text color="textSecondary">{`, ${ing.note}`}</Text> : null}
            </Text>
            <Text variant="callout" color="textSecondary" tabular testID={`ing-${ing.foodId}`}>
              {formatGrams(ing.grams)}
            </Text>
          </View>
        ))}
      </View>

      <Text variant="title2" accessibilityRole="header">
        Steps
      </Text>
      {recipe.steps.map((s, i) => (
        <Animated.View key={i} entering={enterAt(i, reduce)} style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          <View
            style={{
              width: t.spacing.xl + t.spacing.xxs,
              height: t.spacing.xl + t.spacing.xxs,
              borderRadius: t.radius.pill,
              backgroundColor: t.colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="caption" tabular>
              {i + 1}
            </Text>
          </View>
          <Text style={{ flex: 1 }}>{s}</Text>
        </Animated.View>
      ))}
    </Screen>
  );
}
