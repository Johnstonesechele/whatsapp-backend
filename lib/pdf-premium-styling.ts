
"use client"

/**
 * Premium PDF Styling Utility for Union
 * 
 * This utility provides premium PDF generation that matches the system's
 * color scheme and design language.
 * 
 * System Color Scheme:
 * - Primary: Blue-900/950 (#0f172a, #020617)
 * - Accent: Yellow-500/600 (#eab308, #ca8a04)
 * - Text: Blue-200/300 (#93c5fd, #60a5fa)
 * - Borders: Blue-600/700 (#2563eb, #1d4ed8)
 * - Background: Blue-800/900 (#1e3a5f, #0f2744)
 */

export interface PDFTheme {
  // Primary colors
  primary: [number, number, number]
  primaryDark: [number, number, number]
  primaryLight: [number, number, number]
  
  // Accent colors
  accent: [number, number, number]
  accentDark: [number, number, number]
  accentLight: [number, number, number]
  
  // Background colors
  bgDark: [number, number, number]
  bgMedium: [number, number, number]
  bgLight: [number, number, number]
  
  // Text colors
  textPrimary: [number, number, number]
  textSecondary: [number, number, number]
  textMuted: [number, number, number]
  
  // Status colors
  success: [number, number, number]
  warning: [number, number, number]
  error: [number, number, number]
  info: [number, number, number]
  
  // Chart colors
  chartColors: [number, number, number][]
}

// Premium theme matching Union design system
export const premiumTheme: PDFTheme = {
  // Primary - Deep blues from the system
  primary: [15, 23, 42],        // gray-900
  primaryDark: [2, 6, 23],      // gray-950
  primaryLight: [30, 41, 59],   // gray-800
  
  // Accent - Gold/yellow from the system
  accent: [234, 179, 8],       // [#0D5C3A]
  accentDark: [202, 138, 4],   // [#0D5C3A]
  accentLight: [253, 224, 71], // gray-300
  
  // Background colors
  bgDark: [15, 23, 42],        // gray-900
  bgMedium: [30, 41, 59],      // gray-800
  bgLight: [51, 65, 85],       // [#0D5C3A]
  
  // Text colors
  textPrimary: [255, 255, 255],     // white
  textSecondary: [147, 197, 253],   // gray-300
  textMuted: [100, 116, 139],       // [#0D5C3A]
  
  // Status colors
  success: [34, 197, 94],     // green-500
  warning: [234, 179, 8],     // [#0D5C3A]
  error: [239, 68, 68],       // red-500
  info: [59, 130, 246],       // [#0D5C3A]
  
  // Chart colors - vibrant palette
  chartColors: [
    [59, 130, 246],   // [#0D5C3A]
    [34, 197, 94],    // green-500
    [234, 179, 8],    // [#0D5C3A]
    [239, 68, 68],    // red-500
    [168, 85, 247],   // [#0D5C3A]
    [236, 72, 153],   // [#0D5C3A]
    [20, 184, 166],   // [#0D5C3A]
    [249, 115, 22],   // [#0D5C3A]
    [99, 102, 241],   // [#0D5C3A]
    [16, 185, 129],   // [#0D5C3A]
  ]
}

export interface PDFConfig {
  theme: PDFTheme
  companyName: string
  reportTitle: string
  generatedAt: Date
  dateRange?: { start: Date; end: Date }
}

/**
 * Creates a premium PDF document with Union branding
 */
export function createPremiumPDF(config: PDFConfig) {
  const { theme, companyName, reportTitle, generatedAt } = config
  
  // Dynamic import to avoid SSR issues
  const initPDF = async () => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    })
    
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    
    return { doc, autoTable, pageWidth, pageHeight }
  }
  
  return { initPDF, theme, config }
}

/**
 * Adds a premium cover page to the PDF
 */
export async function addPremiumCoverPage(
  doc: any,
  theme: PDFTheme,
  config: PDFConfig
) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  
  // Full-bleed dark background
  doc.setFillColor(...theme.primaryDark)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')
  
  // Gradient overlay effect (simulated with rectangles)
  for (let i = 0; i < 100; i++) {
    const alpha = 0.01
    doc.setFillColor(...theme.primary)
    doc.rect(0, i * 2.97, pageWidth, 2.97, 'F')
  }
  
  // Top accent bar
  doc.setFillColor(...theme.accent)
  doc.rect(0, 0, pageWidth, 6, 'F')
  
  // Bottom accent bar
  doc.setFillColor(...theme.accent)
  doc.rect(0, pageHeight - 6, pageWidth, 6, 'F')
  
  // Decorative elements
  doc.setDrawColor(...theme.accent)
  doc.setLineWidth(0.5)
  
  // Top decorative line
  doc.line(20, 80, pageWidth - 20, 80)
  
  // Bottom decorative line
  doc.line(20, pageHeight - 80, pageWidth - 20, pageHeight - 80)
  
  // Company logo/name
  doc.setTextColor(...theme.accent)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(config.companyName.toUpperCase(), pageWidth / 2, 100, { align: 'center' })
  
  // Report title
  doc.setTextColor(...theme.textPrimary)
  doc.setFontSize(32)
  doc.setFont('helvetica', 'bold')
  doc.text(config.reportTitle, pageWidth / 2, 130, { align: 'center' })
  
  // Subtitle
  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...theme.textSecondary)
  doc.text('Analytics & Performance Report', pageWidth / 2, 145, { align: 'center' })
  
  // Divider
  doc.setDrawColor(...theme.accent)
  doc.setLineWidth(1)
  doc.line(pageWidth / 2 - 40, 155, pageWidth / 2 + 40, 155)
  
  // Generation info
  doc.setFontSize(11)
  doc.setTextColor(...theme.textMuted)
  doc.text(
    `Generated: ${config.generatedAt.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}`,
    pageWidth / 2,
    170,
    { align: 'center' }
  )
  doc.text(
    `At: ${config.generatedAt.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })}`,
    pageWidth / 2,
    178,
    { align: 'center' }
  )
  
  // Date range if provided
  if (config.dateRange) {
    doc.setFontSize(10)
    doc.text(
      `Period: ${config.dateRange.start.toLocaleDateString()} - ${config.dateRange.end.toLocaleDateString()}`,
      pageWidth / 2,
      190,
      { align: 'center' }
    )
  }
  
  // Confidential notice
  doc.setFontSize(9)
  doc.setTextColor(...theme.textMuted)
  doc.text('CONFIDENTIAL - For Internal Use Only', pageWidth / 2, pageHeight - 100, { align: 'center' })
  
  // Footer branding
  doc.setFontSize(8)
  doc.text('Generated by Union Analytics Engine', pageWidth / 2, pageHeight - 90, { align: 'center' })
}

/**
 * Adds a premium header to content pages
 */
export function addPremiumHeader(
  doc: any,
  theme: PDFTheme,
  config: PDFConfig,
  pageNumber: number
) {
  const pageWidth = doc.internal.pageSize.getWidth()
  
  // Header background
  doc.setFillColor(...theme.primary)
  doc.rect(0, 0, pageWidth, 20, 'F')
  
  // Accent line
  doc.setFillColor(...theme.accent)
  doc.rect(0, 20, pageWidth, 2, 'F')
  
  // Company name
  doc.setTextColor(...theme.accent)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(config.companyName.toUpperCase(), 15, 12)
  
  // Report title
  doc.setTextColor(...theme.textPrimary)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(config.reportTitle, pageWidth - 15, 12, { align: 'right' })
  
  // Page number
  doc.setFontSize(8)
  doc.setTextColor(...theme.textMuted)
  doc.text(`Page ${pageNumber}`, pageWidth / 2, 12, { align: 'center' })
  
  return 30 // Return starting Y position for content
}

/**
 * Adds a premium footer to content pages
 */
export function addPremiumFooter(
  doc: any,
  theme: PDFTheme,
  config: PDFConfig,
  pageNumber: number
) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  
  // Footer line
  doc.setDrawColor(...theme.bgLight)
  doc.setLineWidth(0.5)
  doc.line(15, pageHeight - 25, pageWidth - 15, pageHeight - 25)
  
  // Footer text
  doc.setFontSize(8)
  doc.setTextColor(...theme.textMuted)
  doc.setFont('helvetica', 'normal')
  doc.text('CONFIDENTIAL', 15, pageHeight - 18)
  doc.text(config.companyName, pageWidth / 2, pageHeight - 18, { align: 'center' })
  doc.text(`Page ${pageNumber}`, pageWidth - 15, pageHeight - 18, { align: 'right' })
  
  // Generation date
  doc.setFontSize(7)
  doc.text(
    `Generated: ${config.generatedAt.toLocaleDateString()}`,
    pageWidth - 15,
    pageHeight - 12,
    { align: 'right' }
  )
}

/**
 * Creates a premium section header
 */
export function addPremiumSectionHeader(
  doc: any,
  theme: PDFTheme,
  title: string,
  yPosition: number,
  options?: {
    subtitle?: string
    icon?: string
    color?: [number, number, number]
  }
) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const color = options?.color || theme.accent
  
  // Section background bar
  doc.setFillColor(...color)
  doc.rect(15, yPosition - 5, pageWidth - 30, 10, 'F')
  
  // Section title
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(title.toUpperCase(), 20, yPosition + 2)
  
  // Subtitle if provided
  if (options?.subtitle) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...theme.textMuted)
    doc.text(options.subtitle, 20, yPosition + 15)
    return yPosition + 25
  }
  
  return yPosition + 18
}

/**
 * Creates a premium metric card
 */
export function addPremiumMetricCard(
  doc: any,
  theme: PDFTheme,
  options: {
    label: string
    value: string
    change?: string
    changeType?: 'positive' | 'negative' | 'neutral'
    x: number
    y: number
    width: number
    height: number
  }
) {
  const { label, value, change, changeType, x, y, width, height } = options
  
  // Card background
  doc.setFillColor(...theme.bgMedium)
  doc.roundedRect(x, y, width, height, 3, 3, 'F')
  
  // Card border
  doc.setDrawColor(...theme.bgLight)
  doc.setLineWidth(0.5)
  doc.roundedRect(x, y, width, height, 3, 3, 'S')
  
  // Label
  doc.setTextColor(...theme.textMuted)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(label, x + 5, y + 8)
  
  // Value
  doc.setTextColor(...theme.textPrimary)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(value, x + 5, y + 18)
  
  // Change indicator
  if (change) {
    const changeColor = changeType === 'positive' ? theme.success : 
                       changeType === 'negative' ? theme.error : theme.textMuted
    doc.setFontSize(8)
    doc.setTextColor(...changeColor)
    doc.text(change, x + 5, y + 25)
  }
}

/**
 * Creates a premium table with autoTable
 */
export function addPremiumTable(
  doc: any,
  autoTable: any,
  options: {
    startY: number
    head: string[][]
    body: string[][]
    theme: PDFTheme
    columnStyles?: Record<number, any>
    title?: string
  }
) {
  const { startY, head, body, theme, columnStyles, title } = options
  
  // Table title if provided
  let finalY = startY
  if (title) {
    doc.setTextColor(...theme.textPrimary)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(title, 15, startY)
    finalY = startY + 10
  }
  
  autoTable(doc, {
    startY: finalY,
    head,
    body,
    theme: 'plain',
    styles: {
      fontSize: 9,
      textColor: theme.textPrimary,
      font: 'helvetica',
      cellPadding: 4,
      lineColor: theme.bgLight,
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: theme.primary,
      textColor: theme.textPrimary,
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: theme.bgMedium,
    },
    columnStyles: columnStyles || {},
    margin: { left: 15, right: 15 },
  })
  
  return (doc as any).lastAutoTable.finalY + 10
}

/**
 * Adds a premium chart placeholder
 */
export function addPremiumChartPlaceholder(
  doc: any,
  theme: PDFTheme,
  options: {
    title: string
    subtitle?: string
    chartImage?: string
    x: number
    y: number
    width: number
    height: number
  }
) {
  const { title, subtitle, chartImage, x, y, width, height } = options
  
  // Chart container background
  doc.setFillColor(...theme.bgMedium)
  doc.roundedRect(x, y, width, height, 3, 3, 'F')
  
  // Chart border
  doc.setDrawColor(...theme.bgLight)
  doc.setLineWidth(0.5)
  doc.roundedRect(x, y, width, height, 3, 3, 'S')
  
  if (chartImage) {
    try {
      doc.addImage(chartImage, 'PNG', x + 2, y + 2, width - 4, height - 4)
    } catch {
      // Fallback to placeholder
      doc.setFillColor(...theme.bgLight)
      doc.roundedRect(x + 2, y + 2, width - 4, height - 4, 2, 2, 'F')
    }
  } else {
    // Placeholder
    doc.setFillColor(...theme.bgLight)
    doc.roundedRect(x + 2, y + 2, width - 4, height - 4, 2, 2, 'F')
  }
  
  // Chart title
  doc.setTextColor(...theme.textPrimary)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(title, x + 5, y - 3)
  
  if (subtitle) {
    doc.setFontSize(8)
    doc.setTextColor(...theme.textMuted)
    doc.text(subtitle, x + 5, y - 8)
  }
}

/**
 * Adds a premium insight box
 */
export function addPremiumInsightBox(
  doc: any,
  theme: PDFTheme,
  options: {
    title: string
    insights: string[]
    x: number
    y: number
    width: number
  }
) {
  const { title, insights, x, y, width } = options
  
  // Calculate height based on insights
  const lineHeight = 5
  const padding = 10
  const titleHeight = 12
  const height = titleHeight + (insights.length * lineHeight) + padding * 2
  
  // Box background
  doc.setFillColor(...theme.bgMedium)
  doc.roundedRect(x, y, width, height, 3, 3, 'F')
  
  // Left accent border
  doc.setFillColor(...theme.accent)
  doc.rect(x, y, 3, height, 'F')
  
  // Title
  doc.setTextColor(...theme.accent)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(title, x + padding, y + padding)
  
  // Insights
  doc.setTextColor(...theme.textSecondary)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  
  insights.forEach((insight, index) => {
    doc.text(`• ${insight}`, x + padding, y + titleHeight + padding + (index * lineHeight))
  })
  
  return y + height + 10
}

/**
 * Premium color palette for charts
 */
export const premiumChartColors = {
  blue: [59, 130, 246],
  green: [34, 197, 94],
  yellow: [234, 179, 8],
  red: [239, 68, 68],
  purple: [168, 85, 247],
  pink: [236, 72, 153],
  teal: [20, 184, 166],
  orange: [249, 115, 22],
  indigo: [99, 102, 241],
  emerald: [16, 185, 129],
}

/**
 * Status color helper
 */
export function getStatusColor(status: string, theme: PDFTheme): [number, number, number] {
  const statusLower = status.toLowerCase()
  if (['excellent', 'strong', 'active', 'completed', 'won', 'success'].includes(statusLower)) {
    return theme.success
  }
  if (['good', 'normal', 'in_progress', 'pending'].includes(statusLower)) {
    return theme.info
  }
  if (['needs improvement', 'slow', 'at risk', 'medium'].includes(statusLower)) {
    return theme.warning
  }
  if (['poor', 'critical', 'high risk', 'lost', 'failed'].includes(statusLower)) {
    return theme.error
  }
  return theme.textMuted
}

/**
 * Format currency
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Format number with commas
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}
