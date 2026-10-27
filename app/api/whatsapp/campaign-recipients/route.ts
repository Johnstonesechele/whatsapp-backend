export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from "@/backend/database/supabase-config"
import jwt from 'jsonwebtoken'
import { getJWTSecret } from "@/lib/jwt"

// Get recipients for WhatsApp campaigns based on source type and filters
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient()
    
    // Check authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 401 }
      )
    }

    const token = authHeader.split(' ')[1]
    const jwtSecret = getJWTSecret()
    
    let userInfo: any
    try {
      userInfo = jwt.verify(token, jwtSecret) as any
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { sourceType, filters } = body
    
    // sourceType can be: 'contacts', 'leads', 'deals', 'services_contacts', 'services_leads', 'services_deals'
    // filters can include: serviceId, status, tags, etc.

    let recipients: any[] = []
    let query: any

    switch (sourceType) {
      case 'contacts':
        // Get contacts from contacts table
        query = supabase
          .from('contacts')
          .select('id, name, phone, email, status, tags, company')
          .eq('company_id', userInfo.company_id)
          .eq('active', true)
          .not('phone', 'is', null)
          .neq('phone', '')

        // Apply filters
        if (filters?.status && filters.status.length > 0) {
          query = query.in('status', filters.status)
        }
        
        if (filters?.tags && filters.tags.length > 0) {
          // For tags, we need to check if any of the selected tags exist in the tags array
          query = query.contains('tags', filters.tags)
        }

        const { data: contacts, error: contactsError } = await query

        if (contactsError) {
          console.error('Error fetching contacts:', contactsError)
          return NextResponse.json(
            { success: false, error: 'Failed to fetch contacts', details: contactsError.message },
            { status: 500 }
          )
        }

        recipients = contacts?.map((c: any) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          status: c.status,
          tags: c.tags || [],
          company: c.company,
          sourceType: 'contact',
          sourceId: c.id
        })) || []
        break

      case 'leads':
        // Get leads from leads table
        query = supabase
          .from('leads')
          .select('id, name, phone, email, status, source, value, service_id, services(name)')
          .eq('company_id', userInfo.company_id)
          .not('phone', 'is', null)
          .neq('phone', '')

        // Apply filters
        if (filters?.status && filters.status.length > 0) {
          query = query.in('status', filters.status)
        }
        
        if (filters?.source && filters.source.length > 0) {
          query = query.in('source', filters.source)
        }
        
        if (filters?.serviceId) {
          query = query.eq('service_id', filters.serviceId)
        }

        const { data: leads, error: leadsError } = await query

        if (leadsError) {
          console.error('Error fetching leads:', leadsError)
          return NextResponse.json(
            { success: false, error: 'Failed to fetch leads' },
            { status: 500 }
          )
        }

        recipients = leads?.map((l: any) => ({
          id: l.id,
          name: l.name,
          phone: l.phone,
          email: l.email,
          status: l.status,
          source: l.source,
          value: l.value,
          service: l.services?.name || null,
          serviceId: l.service_id,
          sourceType: 'lead',
          sourceId: l.id
        })) || []
        break

      case 'deals':
        // Get contacts from deals
        query = supabase
          .from('deals')
          .select(`
            id, 
            title, 
            value, 
            status, 
            stage,
            service_id,
            services(name),
            contacts(id, name, phone, email)
          `)
          .eq('company_id', userInfo.company_id)

        // Apply filters
        if (filters?.status && filters.status.length > 0) {
          query = query.in('status', filters.status)
        }
        
        if (filters?.stage && filters.stage.length > 0) {
          query = query.in('stage', filters.stage)
        }
        
        if (filters?.serviceId) {
          query = query.eq('service_id', filters.serviceId)
        }

        const { data: deals, error: dealsError } = await query

        if (dealsError) {
          console.error('Error fetching deals:', dealsError)
          return NextResponse.json(
            { success: false, error: 'Failed to fetch deals', details: dealsError.message },
            { status: 500 }
          )
        }

        // Extract unique contacts from deals
        const contactsFromDeals = deals?.filter((d: any) => d.contacts && d.contacts.phone)
          .map((d: any) => ({
            id: d.contacts.id,
            name: d.contacts.name,
            phone: d.contacts.phone,
            email: d.contacts.email,
            dealTitle: d.title,
            dealValue: d.value,
            dealStatus: d.status,
            dealStage: d.stage,
            service: d.services?.name || null,
            serviceId: d.service_id,
            sourceType: 'deal',
            sourceId: d.id
          })) || []

        // Remove duplicates by phone number
        const uniquePhones = new Set()
        recipients = contactsFromDeals.filter((c: any) => {
          if (uniquePhones.has(c.phone)) return false
          uniquePhones.add(c.phone)
          return true
        })
        break

      case 'services_contacts':
        // Get contacts filtered by service using the service_contacts junction table
        if (!filters?.serviceId) {
          return NextResponse.json(
            { success: false, error: 'Service ID required for service-based filtering' },
            { status: 400 }
          )
        }

        // Get contacts associated with a specific service through the service_contacts table
        const { data: serviceContactsData, error: serviceContactsError } = await supabase
          .from('service_contacts')
          .select(`
            contact_id,
            status,
            enrollment_date,
            payment_status,
            contacts!inner(
              id,
              name,
              phone,
              email,
              status,
              company,
              tags,
              company_id
            ),
            services(name)
          `)
          .eq('contacts.company_id', userInfo.company_id)
          .eq('service_id', filters.serviceId)
          .eq('contacts.active', true)
          .not('contacts.phone', 'is', null)
          .neq('contacts.phone', '')

        if (serviceContactsError) {
          console.error('Error fetching service contacts:', serviceContactsError)
          return NextResponse.json(
            { success: false, error: 'Failed to fetch service contacts', details: serviceContactsError.message },
            { status: 500 }
          )
        }

        // Extract and deduplicate contacts
        const serviceContactsMap = new Map()
        serviceContactsData?.forEach((sc: any) => {
          const contact = Array.isArray(sc.contacts) ? sc.contacts[0] : sc.contacts
          if (contact && contact.phone && !serviceContactsMap.has(contact.phone)) {
            const service = Array.isArray(sc.services) ? sc.services[0] : sc.services
            serviceContactsMap.set(contact.phone, {
              id: contact.id,
              name: contact.name,
              phone: contact.phone,
              email: contact.email,
              status: contact.status,
              company: contact.company,
              tags: contact.tags || [],
              service: service?.name || null,
              serviceStatus: sc.status,
              enrollmentDate: sc.enrollment_date,
              paymentStatus: sc.payment_status,
              sourceType: 'service_contact',
              sourceId: contact.id,
              serviceId: filters.serviceId
            })
          }
        })

        recipients = Array.from(serviceContactsMap.values())
        break

      case 'services_leads':
        // Get leads for a specific service
        if (!filters?.serviceId) {
          return NextResponse.json(
            { success: false, error: 'Service ID required for service-based filtering' },
            { status: 400 }
          )
        }

        const { data: serviceLeads, error: serviceLeadsError } = await supabase
          .from('leads')
          .select('id, name, phone, email, status, source, value, services(name)')
          .eq('company_id', userInfo.company_id)
          .eq('service_id', filters.serviceId)
          .not('phone', 'is', null)
          .neq('phone', '')

        if (serviceLeadsError) {
          console.error('Error fetching service leads:', serviceLeadsError)
          return NextResponse.json(
            { success: false, error: 'Failed to fetch service leads' },
            { status: 500 }
          )
        }

        recipients = serviceLeads?.map((l: any) => ({
          id: l.id,
          name: l.name,
          phone: l.phone,
          email: l.email,
          status: l.status,
          source: l.source,
          value: l.value,
          service: Array.isArray(l.services) ? l.services[0]?.name : l.services?.name || null,
          sourceType: 'service_lead',
          sourceId: l.id,
          serviceId: filters.serviceId
        })) || []
        break

      case 'services_deals':
        // Get deals for a specific service
        if (!filters?.serviceId) {
          return NextResponse.json(
            { success: false, error: 'Service ID required for service-based filtering' },
            { status: 400 }
          )
        }

        const { data: serviceDeals, error: serviceDealsError } = await supabase
          .from('deals')
          .select(`
            id, 
            title, 
            value, 
            status, 
            stage,
            services(name),
            contacts(id, name, phone, email)
          `)
          .eq('company_id', userInfo.company_id)
          .eq('service_id', filters.serviceId)

        if (serviceDealsError) {
          console.error('Error fetching service deals:', serviceDealsError)
          return NextResponse.json(
            { success: false, error: 'Failed to fetch service deals', details: serviceDealsError.message },
            { status: 500 }
          )
        }

        const contactsFromServiceDeals = serviceDeals?.filter((d: any) => {
          const contact = Array.isArray(d.contacts) ? d.contacts[0] : d.contacts
          return contact && contact.phone
        })
          .map((d: any) => {
            const contact = Array.isArray(d.contacts) ? d.contacts[0] : d.contacts
            const service = Array.isArray(d.services) ? d.services[0] : d.services
            return {
              id: contact.id,
              name: contact.name,
              phone: contact.phone,
              email: contact.email,
              dealTitle: d.title,
              dealValue: d.value,
              dealStatus: d.status,
              dealStage: d.stage,
              service: service?.name || null,
              sourceType: 'service_deal',
              sourceId: d.id,
              serviceId: filters.serviceId
            }
          }) || []

        // Remove duplicates
        const uniqueServicePhones = new Set()
        recipients = contactsFromServiceDeals.filter((c: any) => {
          if (uniqueServicePhones.has(c.phone)) return false
          uniqueServicePhones.add(c.phone)
          return true
        })
        break

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid source type' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      recipients,
      count: recipients.length,
      sourceType,
      filters
    })

  } catch (error) {
    console.error(' Error fetching campaign recipients:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch recipients' },
      { status: 500 }
    )
  }
}

// Get available services for filtering
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient()
    
    // Check authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 401 }
      )
    }

    const token = authHeader.split(' ')[1]
    const jwtSecret = getJWTSecret()
    
    let userInfo: any
    try {
      userInfo = jwt.verify(token, jwtSecret) as any
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    // Get all services
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('id, name, description, is_active')
      .eq('company_id', userInfo.company_id)
      .eq('is_active', true)
      .order('name')

    if (servicesError) {
      console.error('Error fetching services:', servicesError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch services' },
        { status: 500 }
      )
    }

    // Get count of contacts, leads, and deals per service
    const servicesWithCounts = await Promise.all(
      (services || []).map(async (service) => {
        // Use service.id directly — in the actual Supabase DB, services.id is UUID
        const sid = service.id

        // Count service contacts (simple count via junction table)
        const { count: contactsCount } = await supabase
          .from('service_contacts')
          .select('*', { count: 'exact', head: true })
          .eq('service_id', sid)

        // Count leads: via direct service_id OR via service_contacts junction (converted leads)
        const [{ count: directLeadsCount }, { data: junctionLeads }] = await Promise.all([
          supabase.from('leads').select('*', { count: 'exact', head: true })
            .eq('company_id', userInfo.company_id)
            .eq('service_id', sid)
            .not('phone', 'is', null),
          supabase.from('service_contacts').select('converted_to_lead_id')
            .eq('service_id', sid)
            .not('converted_to_lead_id', 'is', null)
        ])
        const junctionLeadIds = (junctionLeads || []).map((r: any) => r.converted_to_lead_id).filter(Boolean)
        let junctionLeadsCount = 0
        if (junctionLeadIds.length > 0) {
          const { count: jlc } = await supabase.from('leads').select('*', { count: 'exact', head: true })
            .in('id', junctionLeadIds).not('phone', 'is', null)
          junctionLeadsCount = jlc || 0
        }
        const leadsCount = Math.max(directLeadsCount || 0, junctionLeadsCount)

        // Count deals: via direct service_id OR via service contact chain
        const [{ count: directDealsCount }, { data: junctionDeals }] = await Promise.all([
          supabase.from('deals').select('*', { count: 'exact', head: true })
            .eq('company_id', userInfo.company_id)
            .eq('service_id', sid),
          junctionLeadIds.length > 0
            ? supabase.from('deals').select('id', { count: 'exact', head: false })
                .eq('company_id', userInfo.company_id)
                .in('lead_id', junctionLeadIds)
            : Promise.resolve({ data: [] })
        ])
        const dealsCount = Math.max(directDealsCount || 0, (junctionDeals || []).length)

        return {
          ...service,
          contactsCount: contactsCount || 0,
          leadsCount: leadsCount || 0,
          dealsCount: dealsCount || 0
        }
      })
    )

    // Get overall counts
    const { count: totalContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', userInfo.company_id)
      .eq('active', true)
      .not('phone', 'is', null)

    const { count: totalLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', userInfo.company_id)
      .not('phone', 'is', null)

    const { count: totalDeals } = await supabase
      .from('deals')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', userInfo.company_id)

    return NextResponse.json({
      success: true,
      services: servicesWithCounts,
      counts: {
        contacts: totalContacts || 0,
        leads: totalLeads || 0,
        deals: totalDeals || 0
      }
    })

  } catch (error) {
    console.error(' Error fetching campaign data:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch campaign data' },
      { status: 500 }
    )
  }
}


