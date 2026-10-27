import { query, queryOne, execute } from '../database/db-adapter'

export interface FeedbackSurvey {
  id: string
  title: string
  description: string
  questions: SurveyQuestion[]
  status: "draft" | "active" | "completed"
  responses: number
  createdAt: string
  updatedAt: string
}

export interface SurveyQuestion {
  id: string
  type: "text" | "rating" | "multiple_choice" | "nps"
  question: string
  options?: string[]
  required: boolean
}

export interface SurveyResponse {
  id: string
  surveyId: string
  customerId: string
  responses: Record<string, any>
  submittedAt: string
}

export interface NPSData {
  score: number
  category: "promoter" | "passive" | "detractor"
  feedback?: string
  customerId: string
  submittedAt: string
}

// API functions
export async function createSurvey(
  survey: Omit<FeedbackSurvey, "id" | "createdAt" | "updatedAt" | "responses">,
): Promise<FeedbackSurvey | null> {
  const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const now = new Date().toISOString()
  await execute(`INSERT INTO feedback_surveys (id, title, description, status, responses, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, survey.title, survey.description, survey.status || 'draft', 0, now, now])
  return await queryOne('SELECT * FROM feedback_surveys WHERE id = ?', [id])
}

export async function getSurveys(): Promise<FeedbackSurvey[]> {
  return await query('SELECT * FROM feedback_surveys')
}

export async function submitSurveyResponse(
  response: Omit<SurveyResponse, "id" | "submittedAt">,
): Promise<SurveyResponse | null> {
  const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const now = new Date().toISOString()
  await execute(`INSERT INTO survey_responses (id, "surveyId", "customerId", responses, "submittedAt") VALUES (?, ?, ?, ?, ?)`,
    [id, response.surveyId, response.customerId, JSON.stringify(response.responses), now])
  return await queryOne('SELECT * FROM survey_responses WHERE id = ?', [id])
}

export async function getNPSData(): Promise<NPSData[]> {
  return await query('SELECT * FROM nps_data')
}

export async function calculateNPSScore(data: NPSData[]): Promise<number> {
  const promoters = data.filter((d) => d.category === "promoter").length
  const detractors = data.filter((d) => d.category === "detractor").length
  const total = data.length

  if (total === 0) return 0

  return Math.round(((promoters - detractors) / total) * 100)
}
