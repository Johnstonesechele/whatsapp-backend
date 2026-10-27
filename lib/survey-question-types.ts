/**
 * Canonical survey question types.
 *
 * This module is the single source of truth shared by:
 *   - the survey builder UI
 *   - POST /api/surveys/web  (create)
 *   - PUT  /api/surveys/web/[surveyId] (update)
 *   - the public renderer /s/[token]
 *   - the analytics engine
 *
 * Rule: question types are stored losslessly. A type is NEVER rewritten into a
 * different type, because that makes two different questions render identically
 * (single_choice and multiple_choice both becoming radio buttons, for example).
 * Legacy aliases are mapped once, at write time, and only for genuine renames.
 */

/** Every type the app can store. Mirrors migration 029's CHECK constraint. */
export const SURVEY_QUESTION_TYPES = [
  // Choice
  'single_choice',
  'multiple_choice',
  'checkboxes',
  'dropdown',
  // Text
  'short_answer',
  'long_answer',
  // Scale / rating
  'rating',
  'linear_scale',
  'slider',
  'star_rating',
  'nps',
  'opinion_scale',
  // Date & time
  'date',
  'time',
  'datetime',
  'date_time',
  // Numeric / money
  'number',
  'price',
  'range',
  // Contact
  'email',
  'phone',
  'url',
  'address',
  // Files
  'file_upload',
  // Boolean
  'yes_no',
  'true_false',
  // Composite
  'ranking',
  'matrix',
  // Layout only (carry no answer)
  'section',
  'statement',
  // Misc
  'signature',
  'consent',
] as const

export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number]

const ALLOWED = new Set<string>(SURVEY_QUESTION_TYPES)

/** Human labels for the builder UI. */
export const SURVEY_QUESTION_TYPE_LABELS: Record<SurveyQuestionType, string> = {
  single_choice: 'Single Choice',
  multiple_choice: 'Multiple Choice',
  checkboxes: 'Checkboxes',
  dropdown: 'Dropdown',
  short_answer: 'Short Answer',
  long_answer: 'Long Answer',
  rating: 'Star Rating',
  linear_scale: 'Linear Scale',
  slider: 'Slider',
  star_rating: 'Star Rating',
  nps: 'NPS (0-10)',
  opinion_scale: 'Opinion Scale',
  date: 'Date',
  time: 'Time',
  datetime: 'Date & Time',
  date_time: 'Date & Time',
  number: 'Number',
  price: 'Price / Currency',
  range: 'Range (Min-Max)',
  email: 'Email',
  phone: 'Phone',
  url: 'URL',
  address: 'Address',
  file_upload: 'File Upload',
  yes_no: 'Yes / No',
  true_false: 'True / False',
  ranking: 'Ranking',
  matrix: 'Matrix / Grid',
  section: 'Section Break',
  statement: 'Statement',
  signature: 'Signature',
  consent: 'Consent',
}

/**
 * Legacy names that were previously collapsed into an unrelated type.
 *
 * Every question type is DISTINCT: `star_rating` is not `rating`,
 * `true_false` is not `yes_no`, and `range` is not `price`. Each stores and
 * renders independently, so the app behaves differently for each.
 *
 * Only genuine historical renames are mapped here (e.g. `text` -> `short_answer`).
 */
const LEGACY_ALIASES: Record<string, SurveyQuestionType> = {
  text: 'short_answer',
  textarea: 'long_answer',
  textbox: 'short_answer',
  paragraph: 'long_answer',
  question: 'short_answer',
  scale: 'linear_scale',
  matrix_grid: 'matrix',
  menu: 'dropdown',
}

/**
 * Normalize a question type for storage.
 * Legacy aliases are resolved; anything unrecognized becomes short_answer.
 * Distinct types are preserved as-is.
 */
export function normalizeQuestionType(type: string | null | undefined): SurveyQuestionType {
  const raw = (type || '').trim()
  if (ALLOWED.has(raw)) return raw as SurveyQuestionType
  if (raw in LEGACY_ALIASES) return LEGACY_ALIASES[raw]
  return 'short_answer'
}

/**
 * Strictly resolve a type, or return null when the input is not recognisable.
 *
 * normalizeQuestionType() is deliberately forgiving: an unknown string becomes
 * 'short_answer'. That is right for legacy stored rows, but WRONG for
 * machine-authored or user-supplied content, where silently reinterpreting
 * "sql_injection" as a short answer would persist a question nobody asked for.
 * Anything outside the canonical list and the legacy aliases is rejected.
 */
export function resolveQuestionTypeStrict(type: string | null | undefined): SurveyQuestionType | null {
  const raw = (type || '').trim()
  if (!raw) return null
  if (ALLOWED.has(raw)) return raw as SurveyQuestionType
  if (raw in LEGACY_ALIASES) return LEGACY_ALIASES[raw]
  return null
}

/** Types whose answers are stored in survey_question_options. */
export function questionNeedsOptions(type: string | null | undefined): boolean {
  const t = normalizeQuestionType(type)
  return ['single_choice', 'multiple_choice', 'checkboxes', 'dropdown', 'ranking', 'matrix'].includes(t)
}

/** Types that allow multiple selections in the public renderer. */
export function isMultiSelect(type: string | null | undefined): boolean {
  const t = normalizeQuestionType(type)
  return ['multiple_choice', 'checkboxes', 'ranking', 'matrix'].includes(t)
}

/**
 * Types that carry a value the respondent supplies.
 * Layout-only types (section, statement) return false.
 */
export function isAnswerable(type: string | null | undefined): boolean {
  const t = normalizeQuestionType(type)
  return t !== 'section' && t !== 'statement'
}
