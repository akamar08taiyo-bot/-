// Local data model — persisted to this browser's localStorage (see lib/localDb.ts).
// Structure mirrors handoff doc section 5. Unconfirmed/unmeasured numeric fields are `null`, never fabricated.

// snacks_log は別コレクションのため、ここでは主食事の3区分のみを扱う。
export type MealType = '朝' | '昼' | '夕';

export interface Profile {
  height: number | null;
  current_weight: number | null;
  goals: {
    target_weight: number | null;
    target_body_fat: number | null;
  };
  notes: string;
}

export interface HealthCheck {
  id: string;
  date: string; // YYYY-MM-DD
  weight: number | null;
  bmi: number | null;
  waist: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  total_cholesterol: number | null;
  triglycerides: number | null;
  hdl: number | null;
  ldl: number | null;
  fasting_glucose: number | null;
  hba1c: number | null;
  uric_acid: number | null;
  creatinine: number | null;
  egfr: number | null;
  cystatin_c: number | null;
  egfr_cys: number | null;
  ast: number | null;
  alt: number | null;
  ggt: number | null;
  alp: number | null;
  ctr: number | null;
  urine_protein: string | null;
  uacr: number | null;
  chest_xray_note: string;
  notes: string;
  archived?: boolean;
}

export interface BodyLog {
  id: string;
  date: string; // YYYY-MM-DD
  weight: number | null;
  waist: number | null;
  body_fat: number | null;
  sleep: number | null;
  fatigue: string | null;
}

export interface MealItem {
  food_name: string;
  amount: number | null;
  unit: string | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  fiber: number | null;
  saturated_fat: number | null;
  sugar: number | null;
  sodium: number | null;
}

export interface Meal extends MealItem {
  id: string;
  datetime: string; // ISO
  meal_type: MealType;
  source: 'manual' | 'preset';
  notes: string;
}

export interface MealPreset {
  id: string;
  name: string;
  meal_type: MealType;
  items: MealItem[];
}

export interface SnackLog {
  id: string;
  datetime: string;
  item_name: string;
  amount: string | null;
  estimated_sugar: number | null;
  estimated_sat_fat: number | null;
  notes: string;
}

export interface AlcoholLog {
  id: string;
  date: string;
  drank: boolean;
  beer_amount: string | null;
  non_alcohol_items: string | null;
  notes: string;
}

export interface Supplement {
  id: string;
  product_name: string;
  ingredient: string;
  amount_per_unit: number;
  unit: string;
  default_frequency: string;
  active: boolean;
  caution: {
    threshold: number;
    text: string;
  } | null;
}

export interface SupplementLog {
  id: string;
  datetime: string;
  supplement_id: string;
  quantity: number;
}

export interface Workout {
  id: string;
  date: string;
  exercise: string;
  weight: number | null;
  reps: number | null;
  sets: number | null;
  rpe: number | null;
  body_part: string;
  duration: number | null;
}

export interface DailySummary {
  date: string;
  protein_total: number | null;
  calorie_total: number | null;
  snack_count: number;
  alcohol_flag: boolean;
  workout_flag: boolean;
  weight: number | null;
}
