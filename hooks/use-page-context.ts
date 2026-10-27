/**
 * Hook to detect the current page context for AI chat assistance
 * Provides page-specific information, actions, and guidance
 * Role-aware: admin-only pages are gated and non-admins never see admin navigation tips
 */

import { usePathname } from 'next/navigation'
import { useMemo } from 'react'

export interface PageContext {
  pageName: string
  pageType: string
  description: string
  availableActions: string[]
  commonQuestions: string[]
  quickHelp: string[]
  features: string[]
  navigationTips: string[]
  adminOnlyPage: boolean
}

const ADMIN_ROLES = ['system_admin', 'super_admin', 'system-admin']

export function usePageContext(userRole?: string): PageContext {
  const rawPathname = usePathname()
  const pathname = rawPathname || ''
  const isAdmin = ADMIN_ROLES.includes(userRole || '')

  const context = useMemo((): PageContext => {
    // Shared non-admin navigation tips (never mention admin-only pages)
    const generalNavTips = [
      'Use the sidebar menu to navigate between modules',
      'Use the search function to find records quickly',
      'Ask the AI assistant for help with any feature',
    ]
    // Dashboard / Home
    if (pathname === '/' || pathname === '/dashboard') {
      return {
        pageName: 'Dashboard',
        pageType: 'overview',
        adminOnlyPage: false,
        description: 'Main dashboard showing live metrics, AI recommendations, recent activities, pipeline overview, and revenue analytics for your company.',
        availableActions: [
          'View real-time contacts, leads, deals and revenue stats',
          'Read AI-generated recommendations based on your live data',
          'Monitor the live activity feed showing what your team is doing',
          'Navigate to Contacts, Leads, Deals, Campaigns from Quick Actions',
          'Inspect pipeline stages and revenue cards',
          'Check percentage changes month-over-month for each metric',
        ],
        commonQuestions: [
          'What should I focus on today based on my current data?',
          'How do I improve my pipeline conversion rate?',
          'Why are my revenue numbers showing zero?',
          'How do I add contacts, leads or deals quickly?',
          'What do the AI recommendations on the dashboard mean?',
          'How does the real-time activity feed work?',
        ],
        quickHelp: [
          'The AI Recommendations card uses Union AI + your live data to suggest next steps',
          'Green dot = Live (Supabase Realtime), Yellow dot = Polling (10-second refresh)',
          'Click any metric card to navigate to that section for more detail',
          'Revenue cards pull from deals marked as Won — update deal stages to see changes',
        ],
        features: [
          'Union AI recommendations based on live CRM data',
          'Supabase Realtime activity feed (push updates)',
          'Revenue analytics: pipeline, expected, won, MRR',
          'Month-over-month percentage change indicators',
          'Quick action buttons to key modules',
          'Lead pipeline stage visualization',
        ],
        navigationTips: [
          'Use the sidebar to jump to any module',
          'Click on metric cards to drill into that section',
          'Open the AI chat (bottom-right button) for personalised help based on your data',
        ],
      }
    }

    // Contacts
    if (pathname.startsWith('/contacts')) {
      return {
        pageName: 'Contacts',
        pageType: 'list_management',
        adminOnlyPage: false,
        description: 'Manage your full contact database — add, edit, search, tag, and convert contacts into sales leads. Bulk operations and CSV import/export are available.',
        availableActions: [
          'Click "+ Add Contact" to manually create a new contact',
          'Click the Import button to upload a CSV file of contacts',
          'Click Export to download all contacts as a CSV',
          'Use the green UserPlus button on any row to convert a contact into a lead',
          'Use the search box or status/tag filters to find specific contacts',
          'Select multiple contacts with checkboxes to bulk activate, deactivate, or delete',
          'Click the notes (document) icon on any row to add or edit notes',
          'Click the edit (pencil) icon to open the full contact edit form',
          'Click the phone/email/message icons to call, email, or SMS a contact directly',
        ],
        commonQuestions: [
          'How do I add a new contact?',
          'How do I convert a contact into a lead?',
          'How do I import contacts from a CSV file?',
          'How do I bulk delete or deactivate contacts?',
          'How do I search or filter contacts?',
          'How do I add notes to a contact?',
          'How do I export the contact list?',
        ],
        quickHelp: [
          'Green UserPlus button on each row converts that contact directly into a lead',
          'Select checkboxes + use the bulk action bar to activate, deactivate, or delete many at once',
          'Filter by Status (Active/Inactive/Blocked) or Tag to segment your list',
          'The document (FileText) icon opens inline notes editing for any contact',
          'Import accepts CSV files — use the template layout (Name, Email, Phone, Company)',
        ],
        features: [
          'Full contact database with company isolation',
          'One-click convert-to-lead (green button per row)',
          'CSV import and export',
          'Bulk activate / deactivate / delete',
          'Inline notes editing',
          'Status badges: Active, Inactive, Blocked',
          'Tag-based filtering and categorisation',
          'Search by name, email, or company',
          'Paginated list with 50 contacts per page',
        ],
        navigationTips: [
          'Use "+ Add Contact" or "Import" at the top right to add contacts',
          'Open the AI chat (bottom-right) to ask Union AI for contact management tips',
          'After converting to a lead, navigate to /leads to manage the pipeline',
        ],
      }
    }

    // Leads
    if (pathname.startsWith('/leads')) {
      return {
        pageName: 'Leads',
        pageType: 'pipeline_management',
        adminOnlyPage: false,
        description: 'Track and manage sales leads through your pipeline stages',
        availableActions: [
          'Add new leads manually',
          'Move leads between pipeline stages',
          'Assign leads to team members',
          'Convert qualified leads to deals',
          'Add notes and activities to leads',
          'Set follow-up reminders',
          'Filter leads by stage, source, or assigned user'
        ],
        commonQuestions: [
          'How do I create a new lead?',
          'What are the different pipeline stages?',
          'How do I move a lead to the next stage?',
          'When should I convert a lead to a deal?',
          'How can I assign leads to my team?',
          'What is the difference between a lead and a contact?'
        ],
        quickHelp: [
          'Drag and drop leads between stages in kanban view',
          'Click "+ Add Lead" to create new leads',
          'Convert button appears when lead is qualified',
          'Use stage filters to focus on specific pipeline phases',
          'Set reminders to never miss follow-ups'
        ],
        features: [
          'Visual pipeline with kanban board',
          'Lead scoring and qualification',
          'Stage-based workflow management',
          'Lead assignment and distribution',
          'Conversion tracking',
          'Activity timeline per lead',
          'Email and SMS integration'
        ],
        navigationTips: [
          'Switch between list and kanban views',
          'Use the pipeline filter to view specific stages',
          'Click on lead cards to see full details'
        ]
      }
    }

    // Deals
    if (pathname.startsWith('/deals')) {
      return {
        pageName: 'Deals',
        pageType: 'deal_management',
        adminOnlyPage: false,
        description: 'Manage active deals, track progress, and close sales',
        availableActions: [
          'Create new deals from qualified leads',
          'Update deal values and expected close dates',
          'Move deals through sales stages',
          'Add products or services to deals',
          'Generate proposals and quotes',
          'Mark deals as won or lost',
          'Track deal activities and notes'
        ],
        commonQuestions: [
          'How do I create a deal?',
          'What information should I include in a deal?',
          'How do I track deal progress?',
          'Can I add multiple products to a deal?',
          'How do I mark a deal as won?',
          'What happens when I close a deal?'
        ],
        quickHelp: [
          'Click "+ Add Deal" to create new deals',
          'Drag deals between stages to update status',
          'Enter deal value to track revenue pipeline',
          'Set expected close date for forecasting',
          'Use won/lost buttons when deal concludes'
        ],
        features: [
          'Deal pipeline visualization',
          'Revenue forecasting',
          'Product/service association',
          'Proposal generation',
          'Win/loss analysis',
          'Deal stage automation',
          'Probability tracking'
        ],
        navigationTips: [
          'Filter deals by stage, owner, or value',
          'Sort by close date to prioritize',
          'Use the calendar view for timeline planning'
        ]
      }
    }

    // Services
    if (pathname.startsWith('/services')) {
      const isNewPage = pathname.endsWith('/new')
      const isEditPage = pathname.includes('/edit')
      const isContactsPage = pathname.includes('/contacts')
      const isDetailPage = !isNewPage && !isEditPage && !isContactsPage && pathname.match(/\/services\/[^/]+$/)

      if (isContactsPage) {
        return {
          pageName: 'Service Contacts',
          pageType: 'service_management',
          adminOnlyPage: false,
          description: 'Manage contacts enrolled in a service — update their enrollment status, payment details, notes, assigned rep, and more.',
          availableActions: [
            'Click the Pencil () icon to edit enrollment status and payment details for any contact',
            'Click the FileText icon to add or edit notes for a specific enrolled contact',
            'Click the UserCheck icon to assign or reassign a sales rep to an enrolled contact',
            'Click the green TrendingUp icon to convert an enrolled contact into a lead',
            'Click the red Trash icon to unenroll a contact from this service',
            'Click "Import Contacts" to bulk-enroll contacts from a CSV file',
            'Use the search bar to find a specific enrolled contact by name, email, or company',
            'Click Phone or Mail icons to call or email a contact directly',
          ],
          commonQuestions: [
            'How do I update a contact\'s payment status to Paid?',
            'How do I change a contact\'s enrollment status to Active or Completed?',
            'How do I unenroll a contact from this service?',
            'How do I assign a different sales rep to an enrolled contact?',
            'How do I convert an enrolled contact into a lead?',
            'How do I add notes to a specific enrolled contact?',
            'How do I bulk-import contacts into this service?',
          ],
          quickHelp: [
            'Pencil () button on each row → opens Edit Enrollment dialog with status, payment status, and amount fields',
            'Payment status options: Pending, Paid, Partial, Overdue, Waived',
            'Enrollment status options: Enrolled, Active, Completed, Cancelled, Suspended',
            'Red Trash icon → Unenroll removes the contact from this service entirely',
            'Green TrendingUp icon → converts the contact into a sales lead (requires lead_create permission)',
            'Import Contacts button (top right) → bulk CSV upload to enroll many contacts at once',
          ],
          features: [
            'Edit enrollment status and payment details per contact',
            'Inline notes editing per enrollment',
            'Sales rep assignment per enrollment',
            'One-click convert-to-lead',
            'Unenroll individual contacts',
            'Bulk CSV import for enrollment',
            'Search by name, email, or company',
            'Direct call/email from the table',
          ],
          navigationTips: [
            'Use the Back button at the top to return to the service details page',
            'Ask Union AI to help you figure out which contacts to prioritise or follow up with',
            'After converting a contact to a lead, go to /leads to manage the pipeline',
          ],
        }
      }

      if (isNewPage) {
        return {
          pageName: 'Create Service',
          pageType: 'service_management',
          adminOnlyPage: false,
          description: 'Create a new service — one-time or recurring — with pricing, billing cycle, features, and optional upfront contact enrollment.',
          availableActions: [
            'Fill in Service Name (required) and Category',
            'Select service type: One-Time (e.g. training, workshop) or Recurring (e.g. insurance, subscription)',
            'Choose a Pricing Model: Per Person, Per Group, or Flat Rate',
            'Set Price and Currency (USD, EUR, GBP, KES supported)',
            'For recurring services: choose Billing Frequency (daily/weekly/monthly/quarterly/yearly) and optionally a cycle count',
            'Add Setup Fee, Tax Rate, and Discount Percentage if applicable',
            'Add feature bullet points describing what the service includes',
            'Optionally select contacts from the list to enroll them immediately on creation',
            'Click "Create Service" to save',
          ],
          commonQuestions: [
            'What is the difference between One-Time and Recurring service types?',
            'Which pricing model should I choose — Per Person, Per Group, or Flat Rate?',
            'How do I set up a monthly subscription service?',
            'Can I enroll contacts when I create the service?',
            'What happens if I leave the billing cycle count empty for a recurring service?',
            'How do I add features to the service?',
          ],
          quickHelp: [
            'One-Time → charge once (training, event, workshop); Recurring → charge on a schedule (insurance, retainer, subscription)',
            'Per Person = each enrolled contact pays the price; Per Group = flat price for the whole group; Flat Rate = same price regardless of how many enroll',
            'Billing Frequency is required for Recurring services — pick daily, weekly, monthly, quarterly, or yearly',
            'Leaving Billing Cycle Count empty means the subscription runs indefinitely until cancelled',
            'Features section = bullet points shown on the service details card (e.g. "24/7 support", "Monthly reporting")',
            'Contacts selected at creation are enrolled immediately with status "enrolled" and payment status "pending"',
          ],
          features: [
            'One-time and recurring service types',
            'Three pricing models (per person, per group, flat rate)',
            'Billing frequency and cycle configuration',
            'Setup fee, tax rate, and discount fields',
            'Feature bullet-point management',
            'Upfront contact enrollment during creation',
            'Multi-currency support',
          ],
          navigationTips: [
            'After creating, you\'ll be redirected to the service details page',
            'You can always add more contacts later via the Enrolled Contacts page',
            'Use Cancel to discard and go back to the services list',
          ],
        }
      }

      if (isDetailPage) {
        return {
          pageName: 'Service Details',
          pageType: 'service_management',
          adminOnlyPage: false,
          description: 'View full details of a service — pricing, type, features, billing configuration, and enrolled contact count.',
          availableActions: [
            'Click "Edit Service" to update any service details',
            'Click "View Enrolled Contacts" (or the contacts link) to manage who is in this service',
            'Click "Import Contacts" to bulk-enroll contacts via CSV',
            'Toggle the service active/inactive status',
            'View service features, pricing model, billing frequency, and setup fee',
          ],
          commonQuestions: [
            'How do I edit this service?',
            'How do I see who is enrolled in this service?',
            'How do I add more contacts to this service?',
            'How do I deactivate or archive this service?',
            'What does the enrolled contacts count mean?',
          ],
          quickHelp: [
            '"Edit Service" button (top right) opens the edit form for all service fields',
            '"Enrolled Contacts" link/button takes you to the full contacts management table',
            'Enrolled count = total number of contacts currently in this service',
            'Service features appear as bullet points showing what the service includes',
            'Billing frequency and cycle count are shown for recurring services',
          ],
          features: [
            'Full service information display',
            'Pricing model and billing details',
            'Feature list display',
            'Enrolled contact count',
            'Edit and manage navigation',
            'Service status toggle',
          ],
          navigationTips: [
            'Click "Edit" to change any details',
            'Click "Enrolled Contacts" to manage who is in the service',
            'Use the Back button to return to the services list',
          ],
        }
      }

      if (isEditPage) {
        return {
          pageName: 'Edit Service',
          pageType: 'service_management',
          adminOnlyPage: false,
          description: 'Update service name, description, pricing, billing configuration, features, and active status.',
          availableActions: [
            'Update service name, category, and description',
            'Change service type between One-Time and Recurring',
            'Update pricing model, price, and currency',
            'Modify billing frequency and billing cycle count for recurring services',
            'Add or remove feature bullet points',
            'Update setup fee, tax rate, and discount percentage',
            'Activate or deactivate the service using the is_active field',
            'Click "Save Changes" to persist all updates',
          ],
          commonQuestions: [
            'How do I change the price of this service?',
            'Can I switch from one-time to recurring after creation?',
            'How do I add or remove features?',
            'How do I deactivate a service without deleting it?',
            'What happens to enrolled contacts if I change the billing frequency?',
          ],
          quickHelp: [
            'All fields from creation are editable here — name, type, pricing, billing, features',
            'Switching service_type to Recurring will reveal the Billing Frequency selector (required)',
            'Toggle is_active off to deactivate — existing enrollments are not affected',
            'Features: click the X on any feature to remove it; click "Add Feature" to add a new one',
            'Click "Save Changes" to apply — "Cancel" discards all edits',
          ],
          features: [
            'Full service field editing',
            'Service type switching',
            'Billing reconfiguration',
            'Feature management',
            'Activation/deactivation toggle',
          ],
          navigationTips: [
            'Required fields (Name) must be filled before saving',
            'Use Cancel to go back without saving',
            'After saving you\'ll be redirected back to the service details page',
          ],
        }
      }

      // Services list
      return {
        pageName: 'Services',
        pageType: 'service_catalog',
        adminOnlyPage: false,
        description: 'Browse and manage your full service catalog — one-time and recurring services, with enrollment counts and pricing at a glance.',
        availableActions: [
          'Click "+ Add Service" (New Service) to create a one-time or recurring service',
          'Click on a service card to view its full details',
          'Use the search bar to find services by name, category, or description',
          'Filter by service type (one_time / recurring) or active status',
          'Edit any service via its detail or edit page',
          'Navigate to enrolled contacts for a service to manage its contact list',
        ],
        commonQuestions: [
          'How do I create a new service?',
          'What is the difference between one-time and recurring services?',
          'How do I see which contacts are enrolled in a service?',
          'How do I set up monthly or yearly billing?',
          'How do I deactivate a service without deleting it?',
          'How many contacts are currently enrolled across all services?',
        ],
        quickHelp: [
          '"+ Add Service" (top right) → opens the service creation form',
          'Each card shows: service name, type badge, price, enrolled contact count, and active status',
          'Click a card → service detail page with full info and enrolled contacts link',
          'One-Time = charged once at point of enrollment; Recurring = charged on a schedule',
          'Filter by type to separate subscription services from one-off offerings',
        ],
        features: [
          'Service catalog with one-time and recurring types',
          'Per-person, per-group, and flat-rate pricing models',
          'Enrolled contact count per service',
          'Active/inactive status per service',
          'Search and type/status filtering',
          'Multi-currency pricing',
          'Feature bullet-points per service',
        ],
        navigationTips: [
          'Click "+ Add Service" to start building your service catalog',
          'Click any service to see details and manage enrolled contacts',
          'Ask Union AI how many enrollments or overdue payments you have right now',
        ],
      }
    }

    // Campaigns
    if (pathname.startsWith('/campaigns')) {
      return {
        pageName: 'Campaigns',
        pageType: 'marketing',
        adminOnlyPage: false,
        description: 'Create and manage multi-channel marketing campaigns',
        availableActions: [
          'Create new campaigns',
          'Design email, SMS, or WhatsApp campaigns',
          'Select target audience',
          'Schedule campaign delivery',
          'Track campaign performance',
          'View analytics and metrics',
          'Duplicate successful campaigns'
        ],
        commonQuestions: [
          'How do I create a campaign?',
          'Which channels can I use?',
          'How do I target specific contacts?',
          'Can I schedule campaigns for later?',
          'How do I track campaign performance?',
          'What metrics should I monitor?'
        ],
        quickHelp: [
          'Click "+ New Campaign" to start',
          'Choose between email, SMS, or WhatsApp',
          'Use audience filters to target the right people',
          'Preview before sending',
          'Track opens, clicks, and conversions'
        ],
        features: [
          'Multi-channel campaign creation',
          'Audience segmentation',
          'Campaign scheduling',
          'A/B testing',
          'Performance analytics',
          'Template library',
          'Automation workflows'
        ],
        navigationTips: [
          'Use tabs to filter by campaign type',
          'Click on campaigns to see detailed metrics',
          'Access templates from the library'
        ]
      }
    }

    // WhatsApp
    if (pathname.startsWith('/whatsapp')) {
      return {
        pageName: 'WhatsApp Integration',
        pageType: 'communication',
        adminOnlyPage: false,
        description: 'Manage WhatsApp connections and communicate with customers',
        availableActions: [
          'Connect WhatsApp accounts',
          'Send messages to contacts',
          'View message history',
          'Create message templates',
          'Set up automated responses',
          'Monitor connection status',
          'Manage multiple WhatsApp accounts'
        ],
        commonQuestions: [
          'How do I connect my WhatsApp account?',
          'Can I send bulk messages?',
          'How do I create message templates?',
          'Is there a message limit?',
          'Can I automate responses?',
          'How do I manage multiple accounts?'
        ],
        quickHelp: [
          'Scan QR code to connect WhatsApp',
          'Use templates for consistent messaging',
          'View real-time message status',
          'Set up auto-replies for common questions',
          'Monitor connection health'
        ],
        features: [
          'WhatsApp Business API integration',
          'Message templates',
          'Bulk messaging',
          'Automated responses',
          'Message history',
          'Multi-account support',
          'Status notifications'
        ],
        navigationTips: [
          'Check connection status in the header',
          'Use message templates for efficiency',
          'Access settings to configure automation'
        ]
      }
    }

    // Analytics
    if (pathname.startsWith('/analytics')) {
      return {
        pageName: 'Analytics',
        pageType: 'reporting',
        adminOnlyPage: false,
        description: 'View detailed reports and business intelligence',
        availableActions: [
          'View sales performance reports',
          'Analyze conversion funnels',
          'Track revenue metrics',
          'Export reports to PDF/Excel',
          'Create custom dashboards',
          'Set date ranges for analysis',
          'Compare period-over-period performance'
        ],
        commonQuestions: [
          'How do I generate a report?',
          'Can I export analytics data?',
          'What metrics are tracked?',
          'How do I compare time periods?',
          'Can I create custom reports?',
          'What does the conversion funnel show?'
        ],
        quickHelp: [
          'Use date picker to select time range',
          'Click "Export" to download reports',
          'Hover over charts for detailed data',
          'Use filters to drill down into specific metrics',
          'Save custom views for quick access'
        ],
        features: [
          'Comprehensive reporting suite',
          'Interactive charts and graphs',
          'Custom date range selection',
          'Export to multiple formats',
          'Funnel analysis',
          'Revenue forecasting',
          'Team performance metrics'
        ],
        navigationTips: [
          'Use the sidebar to navigate between report types',
          'Click on chart elements to filter data',
          'Access saved reports from favorites'
        ]
      }
    }

    // Settings
    if (pathname.startsWith('/settings')) {
      return {
        pageName: 'Settings',
        pageType: 'configuration',
        adminOnlyPage: false,
        description: 'Configure system settings, user preferences, and integrations',
        availableActions: [
          'Update profile information',
          'Change password',
          'Configure notification preferences',
          'Manage team members',
          'Set up integrations',
          'Customize system appearance',
          'Configure security settings'
        ],
        commonQuestions: [
          'How do I change my password?',
          'Can I customize notifications?',
          'How do I add team members?',
          'What integrations are available?',
          'How do I update my profile?',
          'Can I change the system theme?'
        ],
        quickHelp: [
          'Navigate using the settings sidebar',
          'Changes are saved automatically',
          'Manage team access in Users section',
          'Configure integrations in Connections tab',
          'Update preferences in Profile section'
        ],
        features: [
          'User profile management',
          'Team administration',
          'Integration management',
          'Notification configuration',
          'Security settings',
          'System customization',
          'API access management'
        ],
        navigationTips: [
          'Use tabs to navigate between setting categories',
          'Click "Save" to apply changes',
          'Access help documentation from any setting'
        ]
      }
    }

    // Automation
    if (pathname.startsWith('/automation')) {
      return {
        pageName: 'Automation',
        pageType: 'workflow',
        adminOnlyPage: false,
        description: 'Build and manage automated workflows, triggers, and actions',
        availableActions: [
          'Create new automation workflows',
          'Set up triggers based on CRM events',
          'Define actions: send emails, update records, notify team',
          'Enable or disable existing automations',
          'View automation execution history',
          'Test workflows before activating',
        ],
        commonQuestions: [
          'How do I create a workflow?',
          'What triggers are available?',
          'Can I automate email follow-ups?',
          'How do I test an automation?',
          'How do I enable/disable a workflow?',
        ],
        quickHelp: [
          'Click "+ New Workflow" to start building',
          'Triggers fire when CRM events happen (new lead, deal stage change, etc.)',
          'Actions include sending emails, SMS, updating fields, or notifying team',
          'Use the toggle to activate or pause workflows',
        ],
        features: [
          'Event-based triggers',
          'Multi-step action chains',
          'Email and SMS automation',
          'CRM record updates',
          'Team notifications',
          'Conditional logic',
          'Execution history logs',
        ],
        navigationTips: generalNavTips,
      }
    }

    // Team / Collaboration
    if (pathname.startsWith('/collaboration')) {
      return {
        pageName: 'Team',
        pageType: 'collaboration',
        adminOnlyPage: false,
        description: 'Collaborate with your team via chat, shared documents, and activity logs',
        availableActions: [
          'Send messages in team channels',
          'Share and edit documents collaboratively',
          'View team member list',
          'Check activity log',
          'Manage permissions for team members',
        ],
        commonQuestions: [
          'How do I message a team member?',
          'How do I share a document?',
          'Where can I see the activity log?',
          'How do I manage team permissions?',
        ],
        quickHelp: [
          'Use the Chat tab to send messages',
          'Documents tab allows shared file editing',
          'Activity tab tracks all team actions',
          'Members tab lists all team members',
        ],
        features: [
          'Real-time team chat',
          'Shared document workspace',
          'Team member management',
          'Activity and audit log',
          'Role-based permissions',
        ],
        navigationTips: generalNavTips,
      }
    }

    // Integrations
    if (pathname.startsWith('/integrations')) {
      return {
        pageName: 'Integrations',
        pageType: 'integrations',
        adminOnlyPage: false,
        description: 'Connect third-party tools like Salesforce, HubSpot, Zapier, and Google Workspace',
        availableActions: [
          'Connect or disconnect integrations',
          'Configure API credentials',
          'Sync data with external platforms',
          'View integration status and logs',
        ],
        commonQuestions: [
          'How do I connect Salesforce?',
          'Can I sync contacts with HubSpot?',
          'How do I set up Zapier?',
          'How do I connect Google Workspace?',
        ],
        quickHelp: [
          'Click on an integration card to configure it',
          'Enter API credentials in the connection form',
          'Check the status indicator for connection health',
          'Use the sync button to manually trigger data sync',
        ],
        features: [
          'Salesforce sync',
          'HubSpot integration',
          'Zapier automation bridge',
          'Google Workspace connection',
          'API credential management',
          'Connection status monitoring',
        ],
        navigationTips: generalNavTips,
      }
    }

    // Subscription & Billing
    if (pathname.startsWith('/subscription')) {
      return {
        pageName: 'Subscription & Billing',
        pageType: 'billing',
        adminOnlyPage: false,
        description: 'Manage your subscription plan, billing information, and payment methods',
        availableActions: [
          'View current subscription plan',
          'Upgrade or downgrade plan',
          'Update payment method',
          'View billing history',
          'Download invoices',
          'Cancel subscription',
        ],
        commonQuestions: [
          'How do I upgrade my plan?',
          'Where can I download invoices?',
          'How do I update my payment method?',
          'What happens if I cancel?',
        ],
        quickHelp: [
          'Current plan is displayed at the top of the page',
          'Click "Upgrade" to switch to a higher plan',
          'Billing History tab shows all past invoices',
          'Payment Methods tab manages cards and bank accounts',
        ],
        features: [
          'Plan management',
          'Billing history',
          'Payment method management',
          'Invoice download',
          'Usage tracking',
        ],
        navigationTips: generalNavTips,
      }
    }

    // Documentation
    if (pathname.startsWith('/docs')) {
      return {
        pageName: 'Documentation',
        pageType: 'help',
        adminOnlyPage: false,
        description: 'Help guides, tutorials, and API documentation',
        availableActions: [
          'Browse help articles',
          'Search for specific topics',
          'View API documentation',
          'Access video tutorials',
        ],
        commonQuestions: [
          'How do I find help for a specific feature?',
          'Is there an API I can use?',
          'Are there video tutorials?',
        ],
        quickHelp: [
          'Use the search bar to find articles quickly',
          'Articles are grouped by feature category',
          'API docs include code examples',
        ],
        features: ['Help articles', 'API documentation', 'Video tutorials', 'Search'],
        navigationTips: generalNavTips,
      }
    }

    // --- ADMIN-ONLY PAGES ---
    // Security
    if (pathname.startsWith('/security')) {
      return {
        pageName: 'Security',
        pageType: 'security',
        adminOnlyPage: !isAdmin,
        description: isAdmin
          ? 'Manage access controls, security policies, audit logs, and system protection'
          : 'This section is restricted to system administrators',
        availableActions: isAdmin ? [
          'Review audit logs',
          'Configure MFA policies',
          'Manage IP allowlists',
          'View login history',
          'Set password policies',
          'Review active sessions',
        ] : [],
        commonQuestions: isAdmin ? [
          'How do I enable MFA for all users?',
          'Where are the audit logs?',
          'How do I block an IP address?',
          'How do I force a password reset?',
        ] : [],
        quickHelp: isAdmin ? [
          'Audit Logs tab shows all user actions',
          'MFA can be enforced company-wide in Policies',
          'Active Sessions shows who is currently logged in',
        ] : ['Please contact your system administrator for security settings.'],
        features: isAdmin ? ['Audit logs', 'MFA enforcement', 'IP management', 'Session control', 'Password policies'] : [],
        navigationTips: isAdmin ? generalNavTips : [],
      }
    }

    // System Admin (admin only)
    if (pathname.startsWith('/system-admin')) {
      return {
        pageName: 'System Admin',
        pageType: 'admin',
        adminOnlyPage: !isAdmin,
        description: isAdmin
          ? 'Full system administration: manage companies, users, subscriptions, and platform settings'
          : 'This section is restricted to system administrators',
        availableActions: isAdmin ? [
          'Manage all companies on the platform',
          'Create, edit, or deactivate user accounts',
          'Override subscription settings',
          'View platform-wide analytics',
          'Configure global system settings',
          'Monitor platform health',
        ] : [],
        commonQuestions: isAdmin ? [
          'How do I add a new company?',
          'How do I suspend a user account?',
          'Where are platform-wide analytics?',
          'How do I override a subscription?',
        ] : [],
        quickHelp: isAdmin ? [
          'Companies tab manages all client companies',
          'Users tab shows all platform users',
          'Subscriptions tab manages billing for all companies',
          'Settings tab controls global platform configuration',
        ] : ['Please contact your system administrator.'],
        features: isAdmin ? ['Company management', 'User administration', 'Subscription control', 'Platform analytics', 'Global settings'] : [],
        navigationTips: isAdmin ? generalNavTips : [],
      }
    }

    // AI Learning (admin only)
    if (pathname.startsWith('/ai-learning')) {
      return {
        pageName: 'AI Learning',
        pageType: 'admin',
        adminOnlyPage: !isAdmin,
        description: isAdmin
          ? 'Train and manage the internal AI model using interaction data and Union AI'
          : 'This section is restricted to system administrators',
        availableActions: isAdmin ? [
          'View AI model training status',
          'Trigger manual training cycles',
          'Review learning data quality',
          'Monitor model performance metrics',
          'Configure Union AI integration',
        ] : [],
        commonQuestions: isAdmin ? [
          'How do I retrain the AI model?',
          'How is training data collected?',
          'What does the confidence score mean?',
          'How do I check model performance?',
        ] : [],
        quickHelp: isAdmin ? [
          'Training happens automatically from user interactions',
          'Click "Train Now" for a manual training cycle',
          'Monitor confidence scores over time',
          'Union AI acts as the teacher model',
        ] : ['Please contact your system administrator.'],
        features: isAdmin ? ['Automated model training', 'Union AI teacher', 'Performance monitoring', 'Training data management'] : [],
        navigationTips: isAdmin ? generalNavTips : [],
      }
    }

    // Default/Unknown page
    return {
      pageName: 'Current Page',
      pageType: 'general',
      adminOnlyPage: false,
      description: 'CRM system page',
      availableActions: [
        'Navigate using the sidebar menu',
        'Access different modules',
        'Use search to find records',
        'Get help from AI assistant'
      ],
      commonQuestions: [
        'How do I navigate the system?',
        'What features are available?',
        'Where can I find help?',
        'How do I perform common tasks?'
      ],
      quickHelp: [
        'Use the sidebar to navigate',
        'Click on menu items to explore',
        'Ask me for specific help',
        'Search for records or features'
      ],
      features: [
        'Comprehensive CRM functionality',
        'Multi-channel communication',
        'Sales pipeline management',
        'Analytics and reporting'
      ],
      navigationTips: generalNavTips,
    }
  }, [pathname, isAdmin])

  return context
}