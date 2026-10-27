/**
 * Convert a web survey (sections + questions rows) into a USSD menu tree.
 *
 * The web renderer and the USSD engine store the same survey very
 * differently:
 *
 *   web  -> surveys + survey_questions + survey_question_options
 *           (flat rows, section_id on each question)
 *   USSD -> surveys.root_menu (one nested JSON tree of menus and questions)
 *
 * Without root_menu a survey cannot run over USSD. This module builds that
 * tree from the rows the normal builder already writes, so a tenant does not
 * have to design their survey twice.
 *
 * USSD constraints that shape the conversion:
 *  - A menu lists options numbered 1..N; a question is reached by choosing
 *    one, and only THEN is the answer typed.
 *  - Free text is impractical on a handset, so long/open questions are
 *    rendered as a small numeric scale or a yes/no rather than a keypad.
 *  - Every question needs a stable string id. Web questions have UUIDs, which
 *    are fine, but two questions must never collide.
 */

export interface WebQuestion {
  id: string
  question_text: string
  description?: string | null
  question_type: string
  is_required?: boolean
  allow_other_option?: boolean
  order_index?: number
  section_id?: string | null
  section_title?: string | null
  section_order?: number | null
  validation_rules?: any
  options?: Array<{ id?: string; option_text?: string; text?: string; order_index?: number }> | null
}

export interface UsOption {
  id: string
  text: string
  value: number
  type: 'menu' | 'question'
  subMenu?: UsMenu
  question?: UsQuestion
}

export interface UsQuestion {
  id: string
  text: string
  type: 'rating' | 'text' | 'yesno' | 'multiple_choice'
  required: boolean
  options?: string[]
  validation?: { min?: number; max?: number; pattern?: string }
}

export interface UsMenu {
  id: string
  title: string
  description: string
  options: UsOption[]
  pagination: { enabled: boolean; itemsPerPage: number; currentPage: number; totalPages: number }
}

/** Question types that already mean the same thing on a handset. */
const DIRECT_TYPES = new Set(['rating', 'yesno', 'multiple_choice', 'text'])

/** Types that map to a numeric scale. */
const SCALE_TYPES = new Set([
  'rating', 'star_rating', 'linear_scale', 'slider', 'opinion_scale', 'nps', 'number', 'price',
])

/** Types whose options are stored in survey_question_options. */
const OPTION_TYPES = new Set(['single_choice', 'multiple_choice', 'checkboxes', 'dropdown', 'ranking', 'matrix'])

/** Wipe a label down to something a 160-character USSD screen can show. */
function shorten(text: string, max = 120): string {
  const clean = String(text || '')
    // Collapse the whitespace a text editor leaves behind.
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= max) return clean
  // Cut on a word boundary so a word is never sliced in half.
  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * USSD text messages are billed per session, so a huge custom "Other" field
 * is not usable on a feature phone. A bounded number input is.
 */
const TEXT_CHAR_LIMIT = 160

function buildValidation(rules: any, fallback: { min: number; max: number }): { min: number; max: number } {
  const min = Number.isFinite(rules?.min) ? rules.min : fallback.min
  const max = Number.isFinite(rules?.max) ? rules.max : fallback.max
  // A zero-based scale must keep min 0; a 1-based one must start at 1.
  if (max <= min) return fallback
  return { min, max }
}

function convertQuestion(q: WebQuestion, index: number): UsQuestion | null {
  const type = String(q.question_type || '').trim()
  const text = shorten(q.question_text)
  if (!text) return null

  const id = String(q.id || `q_${index + 1}`)

  if (type === 'yes_no' || type === 'true_false' || type === 'consent') {
    const yes = type === 'true_false' ? 'True' : 'Yes'
    const no = type === 'true_false' ? 'False' : 'No'
    return {
      id, text, type: 'yesno', required: Boolean(q.is_required),
      options: [yes, no],
    }
  }

  if (type === 'multiple_choice' || type === 'checkboxes') {
    const opts = (q.options || [])
      .map(o => shorten(o.option_text ?? o.text ?? '', 40))
      .filter(Boolean)
    // Fewer than two choices is not answerable on a menu.
    if (opts.length < 2) return null
    return {
      id,
      text: `${text}\n\n${opts.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
      type: 'multiple_choice',
      required: Boolean(q.is_required),
      options: opts.slice(0, 9),
    }
  }

  if (SCALE_TYPES.has(type)) {
    // NPS is 0-10 by definition; star rating is 1-5.
    const fallback = type === 'nps' ? { min: 0, max: 10 }
      : type === 'star_rating' || type === 'rating' ? { min: 1, max: 5 }
      : { min: 0, max: 10 }
    const { min, max } = buildValidation(q.validation_rules, fallback)
    const scaleLabel = type === 'nps' ? `Rate 0-10 (0 = not at all likely, 10 = extremely likely)`
      : `Rate ${min}-${max}`
    return {
      id,
      text: `${text}\n\n${scaleLabel}:`,
      type: 'rating',
      required: Boolean(q.is_required),
      validation: { min, max },
    }
  }

  if (type === 'short_answer' || type === 'long_answer' || type === 'address' || type === 'email' || type === 'url') {
    return {
      id,
      text: `${text}\n\nReply with your answer:`,
      type: 'text',
      required: Boolean(q.is_required),
      validation: { pattern: `^.{1,${TEXT_CHAR_LIMIT}}$` },
    }
  }

  if (type === 'phone') {
    return {
      id, text: `${text}\n\nReply with your phone number:`,
      type: 'text', required: Boolean(q.is_required),
      validation: { pattern: '^\\+?[0-9]{7,15}$' },
    }
  }

  if (type === 'date' || type === 'time' || type === 'datetime' || type === 'date_time') {
    return {
      id, text: `${text}\n\nReply as YYYY-MM-DD:`,
      type: 'text', required: Boolean(q.is_required),
      validation: { pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
    }
  }

  // Single choice, dropdown, ranking, matrix and anything else with options:
  // a menu selection is the most natural handset interaction.
  if (OPTION_TYPES.has(type) || Array.isArray(q.options)) {
    const opts = (q.options || [])
      .map(o => shorten(o.option_text ?? o.text ?? '', 40))
      .filter(Boolean)
    if (opts.length < 2) return null
    return {
      id,
      text: `${text}\n\n${opts.slice(0, 9).map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\nReply with the number:`,
      type: 'multiple_choice',
      required: Boolean(q.is_required),
      options: opts.slice(0, 9),
    }
  }

  // Unknown type: fall back to a short answer rather than dropping the
  // question, but never leave the respondent stuck.
  return {
    id, text: `${text}\n\nReply with your answer:`,
    type: 'text', required: false,
    validation: { pattern: `^.{1,${TEXT_CHAR_LIMIT}}$` },
  }
}

/**
 * Build the USSD root menu from a flat list of web questions.
 *
 * Sections become submenus so a long survey is navigable; questions inside a
 * section become numbered menu options in their stored order.
 */
export function buildUssdMenu(questions: WebQuestion[]): UsMenu | null {
  const usable = questions.filter(q => q && q.question_text && String(q.question_text).trim())
  if (usable.length === 0) return null

  // Group by section, preserving each section's stored order.
  const sections = new Map<string, { title: string; order: number; items: WebQuestion[] }>()
  for (const q of usable) {
    const sid = q.section_id || 'section-1'
    if (!sections.has(sid)) {
      sections.set(sid, {
        title: q.section_title || 'Questions',
        // section_order is authoritative; fall back to appearance order.
        order: Number.isFinite(q.section_order) ? Number(q.section_order) : sections.size,
        items: [],
      })
    }
    sections.get(sid)!.items.push(q)
  }

  const orderedSections = [...sections.entries()].sort((a, b) => a[1].order - b[1].order)
  // A single section needs no extra menu layer.
  if (orderedSections.length === 1) {
    return menuFromQuestions('main_menu', orderedSections[0][1].title, orderedSections[0][1].items)
  }

  const options: UsOption[] = orderedSections.map(([sid, sec], i) => ({
    id: sid,
    text: shorten(sec.title, 40),
    value: i + 1,
    type: 'menu' as const,
    subMenu: menuFromQuestions(sid, sec.title, sec.items)!,
  }))

  return {
    id: 'root_menu',
    title: 'Survey Menu',
    description: 'Please choose an option:',
    options,
    pagination: { enabled: false, itemsPerPage: 10, currentPage: 1, totalPages: 1 },
  }
}

function menuFromQuestions(menuId: string, title: string, items: WebQuestion[]): UsMenu | null {
  const options: UsOption[] = []
  let value = 1
  items.forEach((q, i) => {
    const question = convertQuestion(q, i)
    if (!question) return
    options.push({
      id: question.id,
      text: shorten(firstLine(question.text), 40),
      value: value++,
      type: 'question',
      question,
    })
  })
  if (options.length === 0) return null
  return {
    id: menuId,
    title: shorten(title, 60),
    description: 'Please select a question:',
    options,
    pagination: { enabled: false, itemsPerPage: 10, currentPage: 1, totalPages: 1 },
  }
}

/** The first line of a question is its label; the rest is instructions. */
function firstLine(text: string): string {
  return String(text).split('\n')[0].trim()
}
