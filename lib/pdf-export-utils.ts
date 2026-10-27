/**
 * Revenue PDF Export Utilities
 * Provides consistent PDF generation for all revenue analytics pages
 */

// Import types
type jsPDFType = any
type AutoTableType = any

// Dynamic imports to handle Next.js client-side rendering
let jsPDFClass: any = null
let autoTableFunc: any = null

// Initialize PDF libraries
async function initPDFLibraries() {
  if (!jsPDFClass) {
    const jsPDFModule = await import('jspdf')
    jsPDFClass = jsPDFModule.default
  }
  if (!autoTableFunc) {
    const autoTableModule = await import('jspdf-autotable')
    autoTableFunc = autoTableModule.default
  }
  return { jsPDFClass, autoTableFunc }
}

/**
 * Generate PDF header with company branding
 */
function addPDFHeader(doc: any, title: string, subtitle?: string): number {
  let yPosition = 20
  
  // Title
  doc.setFontSize(20)
  doc.setTextColor(30, 58, 138) // Blue-900
  doc.text(title, 20, yPosition)
  yPosition += 10
  
  // Generated date
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Generated: ${new Date().toLocaleString()}`, 20, yPosition)
  yPosition += 5
  
  // Subtitle if provided
  if (subtitle) {
    doc.setFontSize(12)
    doc.setTextColor(60, 60, 60)
    doc.text(subtitle, 20, yPosition)
    yPosition += 10
  }
  
  // Divider line
  doc.setDrawColor(59, 130, 246) // Blue-500
  doc.setLineWidth(0.5)
  doc.line(20, yPosition, 190, yPosition)
  yPosition += 10
  
  return yPosition
}

/**
 * Add section header
 */
function addSectionHeader(doc: any, title: string, yPosition: number): number {
  doc.setFontSize(14)
  doc.setTextColor(30, 58, 138)
  doc.text(title, 20, yPosition)
  return yPosition + 8
}

/**
 * Add metric row
 */
function addMetric(doc: any, label: string, value: string, yPosition: number): number {
  doc.setFontSize(11)
  doc.setTextColor(60, 60, 60)
  doc.text(label, 25, yPosition)
  
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'bold')
  doc.text(value, 120, yPosition)
  doc.setFont('helvetica', 'normal')
  
  return yPosition + 6
}

/**
 * Check if we need a new page
 */
function checkNewPage(doc: any, yPosition: number, requiredSpace: number = 40): number {
  if (yPosition > 250) {
    doc.addPage()
    return 20
  }
  return yPosition
}

/**
 * Generate Revenue Dashboard PDF
 */
export async function generateRevenueDashboardPDF(data: {
  stats: any
  revenueBySection: any
  monthlyData: any[]
  mrrHistory: any[]
  period: string
}) {
  const { jsPDFClass, autoTableFunc } = await initPDFLibraries()
  const doc = new jsPDFClass()
  
  let yPosition = addPDFHeader(
    doc, 
    'Revenue Analytics Report',
    `Period: ${data.period.charAt(0).toUpperCase() + data.period.slice(1).replace('-', ' ')}`
  )
  
  // Executive Summary
  yPosition = addSectionHeader(doc, 'Executive Summary', yPosition)
  yPosition = addMetric(doc, 'Pipeline Value:', `$${data.stats.pipelineValue.toLocaleString()}`, yPosition)
  yPosition = addMetric(doc, 'Expected Revenue:', `$${data.stats.expectedRevenue.toLocaleString()}`, yPosition)
  yPosition = addMetric(doc, 'Net Revenue:', `$${data.stats.netRevenue.toLocaleString()}`, yPosition)
  yPosition = addMetric(doc, 'Monthly Recurring Revenue:', `$${data.stats.monthlyRecurring.toLocaleString()}`, yPosition)
  yPosition = addMetric(doc, 'Won Deals Revenue:', `$${data.stats.wonDealsRevenue.toLocaleString()}`, yPosition)
  yPosition = addMetric(doc, 'Average Deal Size:', `$${data.stats.avgDealSize.toLocaleString()}`, yPosition)
  yPosition = addMetric(doc, 'Revenue Growth:', `${data.stats.revenueGrowth}%`, yPosition)
  yPosition = addMetric(doc, 'Conversion Rate:', `${data.stats.conversionRate}%`, yPosition)
  yPosition = addMetric(doc, 'Total Deals:', `${data.stats.totalDeals}`, yPosition)
  yPosition = addMetric(doc, 'Won Deals:', `${data.stats.wonDeals}`, yPosition)
  yPosition += 10
  
  yPosition = checkNewPage(doc, yPosition)
  
  // Revenue by Section
  yPosition = addSectionHeader(doc, 'Revenue by Section', yPosition)
  yPosition += 5
  
  // Use autoTable function
  autoTableFunc(doc, {
    startY: yPosition,
    head: [['Section', 'Pipeline', 'Expected', 'Revenue', 'MRR']],
    body: [
      [
        'Deals',
        `$${data.revenueBySection.deals.pipelineValue.toLocaleString()}`,
        `$${data.revenueBySection.deals.expectedRevenue.toLocaleString()}`,
        `$${data.revenueBySection.deals.receivedRevenue.toLocaleString()}`,
        `$${data.revenueBySection.deals.mrr.toLocaleString()}`
      ],
      [
        'Leads',
        `$${data.revenueBySection.leads.pipelineValue.toLocaleString()}`,
        `$${data.revenueBySection.leads.expectedRevenue.toLocaleString()}`,
        '-',
        '-'
      ],
      [
        'Services',
        '-',
        '-',
        `$${data.revenueBySection.services.revenue.toLocaleString()}`,
        `$${data.revenueBySection.services.mrr.toLocaleString()}`
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138] },
    margin: { left: 20 }
  })
  
  yPosition = (doc as any).lastAutoTable.finalY + 10
  yPosition = checkNewPage(doc, yPosition)
  
  // Monthly Trend
  if (data.monthlyData && data.monthlyData.length > 0) {
    yPosition = addSectionHeader(doc, 'Monthly Revenue Trend', yPosition)
    yPosition += 5
    
    autoTableFunc(doc, {
      startY: yPosition,
      head: [['Month', 'Revenue', 'Deals', 'Growth']],
      body: data.monthlyData.map((m: any) => [
        m.month,
        `$${m.revenue.toLocaleString()}`,
        m.deals,
        `${m.growth}%`
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] },
      margin: { left: 20 }
    })
    
    yPosition = (doc as any).lastAutoTable.finalY + 10
  }
  
  yPosition = checkNewPage(doc, yPosition)
  
  // MRR History
  if (data.mrrHistory && data.mrrHistory.length > 0) {
    yPosition = addSectionHeader(doc, 'MRR History', yPosition)
    yPosition += 5
    
    autoTableFunc(doc, {
      startY: yPosition,
      head: [['Month', 'MRR', 'ARR']],
      body: data.mrrHistory.map((m: any) => [
        m.month,
        `$${m.mrr.toLocaleString()}`,
        `$${m.arr.toLocaleString()}`
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] },
      margin: { left: 20 }
    })
  }
  
  // Save PDF
  doc.save(`revenue-report-${new Date().toISOString().split('T')[0]}.pdf`)
}

/**
 * Generate Pipeline Analysis PDF
 */
export async function generatePipelinePDF(data: {
  stages: any[]
  deals: any[]
  totalPipelineValue: number
  totalDeals: number
}) {
  const { jsPDFClass, autoTableFunc } = await initPDFLibraries()
  const doc = new jsPDFClass()
  
  let yPosition = addPDFHeader(
    doc,
    'Pipeline Analysis Report',
    `Total Pipeline: $${data.totalPipelineValue.toLocaleString()}`
  )
  
  // Summary
  yPosition = addSectionHeader(doc, 'Pipeline Summary', yPosition)
  yPosition = addMetric(doc, 'Total Pipeline Value:', `$${data.totalPipelineValue.toLocaleString()}`, yPosition)
  yPosition = addMetric(doc, 'Total Open Deals:', `${data.totalDeals}`, yPosition)
  yPosition = addMetric(doc, 'Active Stages:', `${data.stages.length}`, yPosition)
  yPosition += 10
  
  // Stages Breakdown
  yPosition = addSectionHeader(doc, 'Pipeline by Stage', yPosition)
  yPosition += 5
  
  autoTableFunc(doc, {
    startY: yPosition,
    head: [['Stage', 'Deals', 'Value', 'Avg Value', 'Conv Rate', 'Avg Days']],
    body: data.stages.map(s => [
      s.stage,
      s.count,
      `$${s.value.toLocaleString()}`,
      `$${s.avgValue.toLocaleString()}`,
      `${s.conversionRate}%`,
      s.avgTimeInStage
    ]),
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138] },
    margin: { left: 20 }
  })
  
  yPosition = (doc as any).lastAutoTable.finalY + 15
  yPosition = checkNewPage(doc, yPosition)
  
  // Top Deals
  if (data.deals.length > 0) {
    yPosition = addSectionHeader(doc, 'Deals in Pipeline', yPosition)
    yPosition += 5
    
    autoTableFunc(doc, {
      startY: yPosition,
      head: [['Title', 'Value', 'Prob', 'Stage', 'Days', 'Expected Close']],
      body: data.deals.slice(0, 20).map(d => [
        d.title.length > 25 ? d.title.substring(0, 25) + '...' : d.title,
        `$${d.value.toLocaleString()}`,
        `${d.probability}%`,
        d.stage,
        d.daysInStage,
        d.expectedCloseDate
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] },
      margin: { left: 20 },
      styles: { fontSize: 9 }
    })
  }
  
  doc.save(`pipeline-analysis-${new Date().toISOString().split('T')[0]}.pdf`)
}

/**
 * Generate Forecasting PDF
 */
export async function generateForecastingPDF(data: {
  currentMonth: any
  nextMonth: any
  quarter: any
  year: any
  predictions: any[]
  topDeals: any[]
}) {
  const { jsPDFClass, autoTableFunc } = await initPDFLibraries()
  const doc = new jsPDFClass()
  
  let yPosition = addPDFHeader(doc, 'Revenue Forecasting Report')
  
  // Current Month
  yPosition = addSectionHeader(doc, 'Current Month Forecast', yPosition)
  yPosition = addMetric(doc, 'Projected:', `$${data.currentMonth.projected.toLocaleString()}`, yPosition)
  yPosition = addMetric(doc, 'Actual:', `$${data.currentMonth.actual.toLocaleString()}`, yPosition)
  yPosition = addMetric(doc, 'Remaining:', `$${data.currentMonth.remaining.toLocaleString()}`, yPosition)
  yPosition = addMetric(doc, 'Days Remaining:', `${data.currentMonth.daysRemaining}`, yPosition)
  yPosition = addMetric(doc, 'On Track:', data.currentMonth.onTrack ? 'Yes ' : 'No ', yPosition)
  yPosition += 10
  
  // Next Month
  yPosition = addSectionHeader(doc, 'Next Month Forecast', yPosition)
  yPosition = addMetric(doc, 'Projected:', `$${data.nextMonth.projected.toLocaleString()}`, yPosition)
  yPosition = addMetric(doc, 'Confidence:', `${data.nextMonth.confidence}%`, yPosition)
  yPosition = addMetric(doc, 'Deals Expected:', `${data.nextMonth.dealsExpected}`, yPosition)
  yPosition += 10
  
  yPosition = checkNewPage(doc, yPosition)
  
  // Quarter & Year
  yPosition = addSectionHeader(doc, 'Quarter & Year Overview', yPosition)
  yPosition += 5
  
  autoTableFunc(doc, {
    startY: yPosition,
    head: [['Period', 'Projected', 'Actual', 'Target', 'Progress']],
    body: [
      [
        'Quarter',
        `$${data.quarter.projected.toLocaleString()}`,
        `$${data.quarter.actual.toLocaleString()}`,
        `$${data.quarter.target.toLocaleString()}`,
        `${data.quarter.percentComplete}%`
      ],
      [
        'Year',
        `$${data.year.projected.toLocaleString()}`,
        `$${data.year.actual.toLocaleString()}`,
        `$${data.year.target.toLocaleString()}`,
        `${data.year.percentComplete}%`
      ]
    ],
    theme: 'grid',
    headStyles: { fillColor: [30, 58, 138] },
    margin: { left: 20 }
  })
  
  yPosition = (doc as any).lastAutoTable.finalY + 15
  yPosition = checkNewPage(doc, yPosition)
  
  // 6-Month Predictions
  if (data.predictions.length > 0) {
    yPosition = addSectionHeader(doc, '6-Month Revenue Predictions', yPosition)
    yPosition += 5
    
    autoTableFunc(doc, {
      startY: yPosition,
      head: [['Month', 'Conservative', 'Realistic', 'Optimistic', 'Confidence']],
      body: data.predictions.map(p => [
        p.month,
        `$${p.conservative.toLocaleString()}`,
        `$${p.realistic.toLocaleString()}`,
        `$${p.optimistic.toLocaleString()}`,
        `${p.confidence}%`
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] },
      margin: { left: 20 }
    })
    
    yPosition = (doc as any).lastAutoTable.finalY + 15
  }
  
  yPosition = checkNewPage(doc, yPosition)
  
  // Top Deals
  if (data.topDeals.length > 0) {
    yPosition = addSectionHeader(doc, 'Top Deals Closing Soon', yPosition)
    yPosition += 5
    
    autoTableFunc(doc, {
      startY: yPosition,
      head: [['Title', 'Value', 'Probability', 'Expected Close', 'Stage']],
      body: data.topDeals.map(d => [
        d.title.length > 25 ? d.title.substring(0, 25) + '...' : d.title,
        `$${d.value.toLocaleString()}`,
        `${d.probability}%`,
        d.expectedClose,
        d.stage
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] },
      margin: { left: 20 },
      styles: { fontSize: 9 }
    })
  }
  
  doc.save(`forecast-report-${new Date().toISOString().split('T')[0]}.pdf`)
}
