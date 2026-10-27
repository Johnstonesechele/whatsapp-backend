import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

// Database configuration - Use absolute path to avoid any path resolution issues
const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'app/database/crm.db')

let db: Database.Database
let eventListenersAdded = false

// Initialize database connection
export function initializeDatabase() {
  try {
    // Create database connection
    db = new Database(dbPath)
    
    // Enable foreign keys
    db.pragma('foreign_keys = ON')
    
    console.log('Database connection established successfully')
    
    // Initialize tables if they don't exist
    initializeTables()
    
    // Add event listeners only once
    if (!eventListenersAdded) {
      addEventListeners()
      eventListenersAdded = true
    }

    return db
  } catch (error) {
    console.error('Failed to connect to database:', error)
    throw error
  }
}

// Initialize database tables
function initializeTables() {
  try {
    // Companies table - for multi-tenant support
    db.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        website TEXT,
        industry TEXT,
        size TEXT,
        subscription_plan TEXT DEFAULT 'basic',
        subscription_status TEXT DEFAULT 'active',
        max_users INTEGER DEFAULT 10,
        logo TEXT,
        settings TEXT DEFAULT '{}',
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Enhanced Users table with company reference
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        company_id TEXT REFERENCES companies(id),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'team_member',
        permissions TEXT DEFAULT '[]',
        department TEXT,
        position TEXT,
        location TEXT,
        phone TEXT,
        avatar TEXT,
        active INTEGER DEFAULT 1,
        email_verified INTEGER DEFAULT 0,
        invitation_token TEXT,
        invitation_expires_at TEXT,
        last_login TEXT,
        created_by TEXT REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Add company_id and invitation fields to users table if they don't exist
    try {
      db.exec(`ALTER TABLE users ADD COLUMN company_id TEXT REFERENCES companies(id)`)
    } catch (e) { /* Column might already exist */ }

    try {
      db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`)
    } catch (e) { /* Column might already exist */ }
    
    try {
      db.exec(`ALTER TABLE users ADD COLUMN invitation_token TEXT`)
    } catch (e) { /* Column might already exist */ }
    
    try {
      db.exec(`ALTER TABLE users ADD COLUMN invitation_expires_at TEXT`)
    } catch (e) { /* Column might already exist */ }
    
    try {
      db.exec(`ALTER TABLE users ADD COLUMN created_by TEXT REFERENCES users(id)`)
    } catch (e) { /* Column might already exist */ }

    // Activity logs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        user_id TEXT REFERENCES users(id),
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        metadata TEXT DEFAULT '{}',
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Enhanced Roles table
    db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        permissions TEXT DEFAULT '[]',
        is_system INTEGER DEFAULT 0,
        is_company_manager INTEGER DEFAULT 0,
        can_assign_leads INTEGER DEFAULT 0,
        can_invite_users INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Add new columns to roles table if they don't exist
    try {
      db.exec(`ALTER TABLE roles ADD COLUMN is_company_manager INTEGER DEFAULT 0`)
    } catch (e) { /* Column might already exist */ }
    
    try {
      db.exec(`ALTER TABLE roles ADD COLUMN can_assign_leads INTEGER DEFAULT 0`)
    } catch (e) { /* Column might already exist */ }
    
    try {
      db.exec(`ALTER TABLE roles ADD COLUMN can_invite_users INTEGER DEFAULT 0`)
    } catch (e) { /* Column might already exist */ }
    
    try {
      db.exec(`ALTER TABLE roles ADD COLUMN level INTEGER DEFAULT 1`)
    } catch (e) { /* Column might already exist */ }

    // Enhanced Contacts table with company isolation
    db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        company_id TEXT NOT NULL REFERENCES companies(id),
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        company TEXT,
        position TEXT,
        status TEXT DEFAULT 'Active',
        tags TEXT DEFAULT '[]',
        source TEXT,
        notes TEXT,
        assigned_to TEXT REFERENCES users(id),
        created_by TEXT REFERENCES users(id),
        updated_by TEXT REFERENCES users(id),
        last_contact TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Add company_id to contacts table if it doesn't exist
    try {
      db.exec(`ALTER TABLE contacts ADD COLUMN company_id TEXT REFERENCES companies(id)`)
    } catch (e) { /* Column might already exist */ }

    // Enhanced Leads table with company isolation and assignment tracking
    db.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        company_id TEXT NOT NULL REFERENCES companies(id),
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        company TEXT,
        status TEXT DEFAULT 'Cold',
        stage TEXT DEFAULT 'Qualification',
        value REAL DEFAULT 0,
        probability INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        source TEXT,
        notes TEXT,
        assigned_to TEXT REFERENCES users(id),
        assigned_by TEXT REFERENCES users(id),
        assigned_at TEXT,
        created_by TEXT REFERENCES users(id),
        updated_by TEXT REFERENCES users(id),
        last_activity TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Add new columns to leads table if they don't exist
    try {
      db.exec(`ALTER TABLE leads ADD COLUMN company_id TEXT REFERENCES companies(id)`)
    } catch (e) { /* Column might already exist */ }
    
    try {
      db.exec(`ALTER TABLE leads ADD COLUMN assigned_by TEXT REFERENCES users(id)`)
    } catch (e) { /* Column might already exist */ }
    
    try {
      db.exec(`ALTER TABLE leads ADD COLUMN assigned_at TEXT`)
    } catch (e) { /* Column might already exist */ }

    try {
      db.exec(`ALTER TABLE leads ADD COLUMN service_id TEXT REFERENCES services(id)`)
    } catch (e) { /* Column might already exist */ }

    try {
      db.exec(`ALTER TABLE leads ADD COLUMN converted_from_service_contact_id TEXT`)
    } catch (e) { /* Column might already exist */ }

    // Lead assignment notifications table
    db.exec(`
      CREATE TABLE IF NOT EXISTS lead_assignments (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        lead_id TEXT NOT NULL REFERENCES leads(id),
        assigned_to TEXT NOT NULL REFERENCES users(id),
        assigned_by TEXT NOT NULL REFERENCES users(id),
        notification_sent INTEGER DEFAULT 0,
        notification_sent_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Notifications table
    db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        user_id TEXT REFERENCES users(id),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT DEFAULT 'info',
        read INTEGER DEFAULT 0,
        read_at TEXT,
        action_url TEXT,
        expires_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Campaigns table
    db.exec(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        company_id TEXT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'draft',
        message TEXT,
        recipients INTEGER DEFAULT 0,
        sent INTEGER DEFAULT 0,
        delivered INTEGER DEFAULT 0,
        read INTEGER DEFAULT 0,
        responded INTEGER DEFAULT 0,
        created_by TEXT REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        scheduled_at TEXT,
        budget REAL DEFAULT 0,
        spent REAL DEFAULT 0,
        category TEXT,
        service_id INTEGER,
        template_id TEXT,
        survey_id TEXT
      )
    `)

    // Templates table
    db.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL,
        category TEXT,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        variables TEXT DEFAULT '[]',
        status TEXT DEFAULT 'active',
        usage INTEGER DEFAULT 0,
        created_by TEXT REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Scheduled messages table
    db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL,
        recipient_type TEXT NOT NULL,
        recipients INTEGER DEFAULT 0,
        scheduled_date_time TEXT NOT NULL,
        frequency TEXT DEFAULT 'once',
        status TEXT DEFAULT 'pending',
        attachments TEXT DEFAULT '[]',
        created_by TEXT REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Email templates table
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL,
        category TEXT,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        is_html INTEGER DEFAULT 1,
        variables TEXT DEFAULT '[]',
        usage_count INTEGER DEFAULT 0,
        created_by TEXT REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // WhatsApp menus table
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_menus (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        title TEXT NOT NULL,
        description TEXT,
        options TEXT DEFAULT '[]',
        is_active INTEGER DEFAULT 1,
        created_by TEXT REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Settings table for various app settings
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        value TEXT,
        type TEXT DEFAULT 'string',
        category TEXT DEFAULT 'general',
        description TEXT,
        updated_by TEXT REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Add company_id to settings table if it doesn't exist
    try {
      db.exec(`ALTER TABLE settings ADD COLUMN company_id TEXT REFERENCES companies(id)`)
    } catch (e) { /* Column might already exist */ }

    // Automations table
    db.exec(`
      CREATE TABLE IF NOT EXISTS automations (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL,
        description TEXT,
        trigger_type TEXT NOT NULL,
        trigger_config TEXT DEFAULT '{}',
        actions TEXT DEFAULT '[]',
        is_active INTEGER DEFAULT 1,
        execution_count INTEGER DEFAULT 0,
        created_by TEXT REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Chat and Document Management Tables
    
    // Chat Rooms table
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL DEFAULT 'team',
        company_id TEXT NOT NULL REFERENCES companies(id),
        created_by TEXT NOT NULL REFERENCES users(id),
        is_active INTEGER DEFAULT 1,
        is_private INTEGER DEFAULT 0,
        last_message_at TEXT,
        participant_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Chat Room Participants
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_participants (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT DEFAULT 'member',
        joined_at TEXT DEFAULT (datetime('now')),
        last_read_at TEXT,
        is_muted INTEGER DEFAULT 0,
        UNIQUE(room_id, user_id)
      )
    `)

    // Chat Messages
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        room_id TEXT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id),
        message TEXT,
        message_type TEXT DEFAULT 'text',
        reply_to TEXT REFERENCES chat_messages(id),
        file_id TEXT REFERENCES documents(id),
        is_edited INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Documents table
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_type TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        company_id TEXT NOT NULL REFERENCES companies(id),
        uploaded_by TEXT NOT NULL REFERENCES users(id),
        folder_id TEXT REFERENCES document_folders(id),
        is_public INTEGER DEFAULT 0,
        download_count INTEGER DEFAULT 0,
        description TEXT,
        tags TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Document Folders
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_folders (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL,
        parent_id TEXT REFERENCES document_folders(id),
        company_id TEXT NOT NULL REFERENCES companies(id),
        created_by TEXT NOT NULL REFERENCES users(id),
        is_public INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Document Permissions
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_permissions (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
        folder_id TEXT REFERENCES document_folders(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        role_id TEXT REFERENCES roles(id),
        permission_type TEXT NOT NULL,
        granted_by TEXT NOT NULL REFERENCES users(id),
        granted_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Document Shares
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_shares (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        shared_by TEXT NOT NULL REFERENCES users(id),
        shared_with TEXT REFERENCES users(id),
        chat_room_id TEXT REFERENCES chat_rooms(id),
        share_type TEXT NOT NULL DEFAULT 'internal',
        access_token TEXT,
        expires_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Message Reactions
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reaction TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(message_id, user_id, reaction)
      )
    `)

    // Chat Notifications
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_notifications (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        room_id TEXT REFERENCES chat_rooms(id) ON DELETE CASCADE,
        message_id TEXT REFERENCES chat_messages(id) ON DELETE CASCADE,
        document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Services table
    db.exec(`
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        pricing_model TEXT NOT NULL CHECK(pricing_model IN ('per_person', 'per_group', 'flat_rate')) DEFAULT 'per_person',
        price REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        service_type TEXT NOT NULL CHECK(service_type IN ('one_time', 'recurring')) DEFAULT 'one_time',
        billing_frequency TEXT CHECK(billing_frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
        billing_cycle_count INTEGER,
        setup_fee REAL DEFAULT 0,
        tax_rate REAL DEFAULT 0,
        discount_percentage REAL DEFAULT 0,
        features TEXT,
        requirements TEXT,
        duration INTEGER,
        max_participants INTEGER,
        is_active INTEGER DEFAULT 1,
        company_id TEXT NOT NULL REFERENCES companies(id),
        created_by TEXT NOT NULL REFERENCES users(id),
        updated_by TEXT REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Service Contacts table
    db.exec(`
      CREATE TABLE IF NOT EXISTS service_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_id INTEGER NOT NULL REFERENCES services(id),
        contact_id TEXT NOT NULL REFERENCES contacts(id),
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled', 'pending')),
        enrollment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        start_date DATETIME,
        end_date DATETIME,
        payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('paid', 'pending', 'overdue', 'cancelled')),
        amount_paid REAL DEFAULT 0,
        amount_due REAL DEFAULT 0,
        next_payment_date DATETIME,
        payment_cycle_number INTEGER DEFAULT 0,
        assigned_sales_rep TEXT REFERENCES users(id),
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(service_id, contact_id)
      )
    `)

    // Create indexes for performance
    try {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created ON chat_messages(room_id, created_at DESC)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_participants_room ON chat_participants(room_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_document_permissions_doc ON document_permissions(document_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_document_permissions_user ON document_permissions(user_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_notifications_user ON chat_notifications(user_id, is_read)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_services_company ON services(company_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_service_contacts_service ON service_contacts(service_id)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_service_contacts_contact ON service_contacts(contact_id)`)
    } catch (e) {
      console.log('Some indexes may already exist')
    }

    // Insert default roles if they don't exist
    const rolesExist = db.prepare('SELECT COUNT(*) as count FROM roles').get() as { count: number }
    if (rolesExist.count === 0) {
      const insertRole = db.prepare(`
        INSERT INTO roles (id, name, description, permissions, is_system, is_company_manager, can_assign_leads, can_invite_users, level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      
      // System Administrator - Can access everything
      insertRole.run('system_admin', 'System Administrator', 'Full system access across all companies and settings', 
        JSON.stringify([
          'contact_view', 'contact_create', 'contact_edit', 'contact_delete', 'contact_export', 'contact_import',
          'lead_view', 'lead_create', 'lead_edit', 'lead_delete', 'lead_assign', 'lead_manage',
          'campaign_view', 'campaign_create', 'campaign_edit', 'campaign_delete', 'campaign_send',
          'analytics_view', 'analytics_export', 'analytics_advanced', 'ai_analytics_view',
          'automation_view', 'automation_create', 'automation_edit', 'automation_delete', 'automation_manage',
          'team_view', 'team_invite', 'team_manage', 'team_delete',
          'settings_access', 'security_access', 'admin_access', 'company_manage',
          'role_manage', 'permission_manage', 'system_settings'
        ]), 1, 1, 1, 1, 10)

      // Company Manager - Can manage their company and invite users
      insertRole.run('company_manager', 'Company Manager', 'Manages company operations, users, and can assign leads',
        JSON.stringify([
          'contact_view', 'contact_create', 'contact_edit', 'contact_delete', 'contact_export', 'contact_import',
          'lead_view', 'lead_create', 'lead_edit', 'lead_assign', 'lead_manage',
          'campaign_view', 'campaign_create', 'campaign_edit', 'campaign_send',
          'analytics_view', 'analytics_export', 'ai_analytics_view',
          'automation_view', 'automation_create', 'automation_edit',
          'team_view', 'team_invite', 'team_manage',
          'settings_access'
        ]), 1, 1, 1, 1, 8)

      // Sales Manager - Can assign leads and manage sales team
      insertRole.run('sales_manager', 'Sales Manager', 'Manages sales team and lead assignments',
        JSON.stringify([
          'contact_view', 'contact_create', 'contact_edit', 'contact_export',
          'lead_view', 'lead_create', 'lead_edit', 'lead_assign', 'lead_manage',
          'campaign_view', 'campaign_create', 'campaign_edit',
          'analytics_view', 'analytics_export', 'ai_analytics_view',
          'team_view'
        ]), 0, 0, 1, 0, 6)

      // Marketing Manager - Manages campaigns and marketing activities
      insertRole.run('marketing_manager', 'Marketing Manager', 'Manages marketing campaigns and activities',
        JSON.stringify([
          'contact_view', 'contact_create', 'contact_edit', 'contact_export',
          'lead_view', 'lead_create', 'lead_edit',
          'campaign_view', 'campaign_create', 'campaign_edit', 'campaign_send',
          'analytics_view', 'analytics_export', 'ai_analytics_view',
          'automation_view', 'automation_create', 'automation_edit',
          'team_view'
        ]), 0, 0, 0, 0, 6)

      // Sales Representative - Manages their assigned leads and contacts
      insertRole.run('sales_rep', 'Sales Representative', 'Manages assigned leads and contacts',
        JSON.stringify([
          'contact_view', 'contact_create', 'contact_edit',
          'lead_view', 'lead_edit', 'lead_manage',
          'campaign_view',
          'analytics_view'
        ]), 0, 0, 0, 0, 4)

      // Marketing Specialist - Creates campaigns and manages marketing content
      insertRole.run('marketing_specialist', 'Marketing Specialist', 'Creates and manages marketing campaigns',
        JSON.stringify([
          'contact_view', 'contact_create',
          'lead_view', 'lead_create',
          'campaign_view', 'campaign_create', 'campaign_edit', 'campaign_send',
          'analytics_view',
          'automation_view'
        ]), 0, 0, 0, 0, 4)

      // Customer Support - Handles customer inquiries and support
      insertRole.run('customer_support', 'Customer Support', 'Handles customer support and basic contact management',
        JSON.stringify([
          'contact_view', 'contact_edit',
          'lead_view',
          'analytics_view'
        ]), 0, 0, 0, 0, 3)

      // Team Member - Basic access for general team members
      insertRole.run('team_member', 'Team Member', 'Basic access for team members',
        JSON.stringify([
          'contact_view',
          'lead_view',
          'campaign_view',
          'analytics_view'
        ]), 0, 0, 0, 0, 2)

      // Viewer - Read-only access
      insertRole.run('viewer', 'Viewer', 'Read-only access to basic information',
        JSON.stringify([
          'contact_view',
          'lead_view',
          'campaign_view'
        ]), 0, 0, 0, 0, 1)
    }

    // Insert default company if none exist
    const companiesExist = db.prepare('SELECT COUNT(*) as count FROM companies').get() as { count: number }
    if (companiesExist.count === 0) {
      const insertCompany = db.prepare(`
        INSERT INTO companies (id, name, email, subscription_plan, subscription_status, max_users)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      
      insertCompany.run(
        'default-company-1',
        'Default Company',
        'admin@company.com',
        'enterprise',
        'active',
        100
      )
    }

    // Insert default admin user if no users exist
    const usersExist = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
    if (usersExist.count === 0) {
      const insertUser = db.prepare(`
        INSERT INTO users (id, company_id, name, email, password_hash, role, permissions, department, position, location, email_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      
      insertUser.run(
        'admin-user-1',
        'default-company-1',
        'System Administrator',
        'admin@crm.local',
        '$2b$10$Qs8Mc1ro47eHkpgKHwiJw.G02t0qqk/qzh.G.cv8B3sbWJaHu/SEe', // password: admin123
        'system_admin',
        JSON.stringify([
          'contact_view', 'contact_create', 'contact_edit', 'contact_delete', 'contact_export', 'contact_import',
          'lead_view', 'lead_create', 'lead_edit', 'lead_delete', 'lead_assign', 'lead_manage',
          'campaign_view', 'campaign_create', 'campaign_edit', 'campaign_delete', 'campaign_send',
          'analytics_view', 'analytics_export', 'analytics_advanced', 'ai_analytics_view',
          'automation_view', 'automation_create', 'automation_edit', 'automation_delete', 'automation_manage',
          'team_view', 'team_invite', 'team_manage', 'team_delete',
          'settings_access', 'security_access', 'admin_access', 'company_manage',
          'role_manage', 'permission_manage', 'system_settings'
        ]),
        'Administration',
        'System Administrator',
        'Head Office',
        1
      )
    }

    // WhatsApp sessions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        user_id TEXT NOT NULL REFERENCES users(id),
        phone_number TEXT NOT NULL,
        name TEXT NOT NULL,
        platform TEXT,
        connected INTEGER DEFAULT 0,
        battery_level INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        last_seen TEXT DEFAULT (datetime('now'))
      )
    `)

    // Message logs table for tracking email/SMS/WhatsApp delivery status
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_logs (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        type TEXT NOT NULL, -- 'email', 'whatsapp', 'sms'
        status TEXT NOT NULL, -- 'sent', 'delivered', 'opened', 'clicked', 'failed', 'pending', 'read'
        recipient TEXT NOT NULL,
        subject TEXT,
        message TEXT,
        user_id TEXT NOT NULL REFERENCES users(id),
        external_id TEXT, -- ID from external provider (Twilio, etc.)
        error_message TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // WhatsApp menus table for interactive menu management
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_menus (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        name TEXT NOT NULL,
        description TEXT,
        welcome_message TEXT NOT NULL,
        invalid_choice_message TEXT NOT NULL,
        timeout_message TEXT NOT NULL,
        timeout_seconds INTEGER DEFAULT 300,
        is_active INTEGER DEFAULT 0,
        parent_menu_id TEXT REFERENCES whatsapp_menus(id),
        created_by TEXT REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // WhatsApp menu options table
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_menu_options (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        menu_id TEXT NOT NULL REFERENCES whatsapp_menus(id),
        option_key TEXT NOT NULL, -- '1', '2', '3', or text keywords
        label TEXT NOT NULL,
        message TEXT,
        action TEXT NOT NULL, -- 'message', 'submenu', 'transfer', 'webhook', 'collect_info', 'end'
        submenu_id TEXT REFERENCES whatsapp_menus(id),
        webhook_url TEXT,
        transfer_department TEXT,
        collect_field TEXT,
        priority INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // Incoming emails table
    db.exec(`
      CREATE TABLE IF NOT EXISTS incoming_emails (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        serial_number TEXT UNIQUE NOT NULL,
        from_email TEXT NOT NULL,
        to_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        message_id TEXT,
        in_reply_to TEXT,
        received_at TEXT NOT NULL,
        processed INTEGER DEFAULT 0,
        auto_reply_sent INTEGER DEFAULT 0,
        auto_reply_message_id TEXT,
        assigned_to TEXT REFERENCES users(id),
        status TEXT DEFAULT 'New',
        priority TEXT DEFAULT 'Normal',
        category TEXT,
        tags TEXT DEFAULT '[]',
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // AI Insights table for storing machine learning generated insights
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_insights (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- 'prediction', 'recommendation', 'alert', 'trend', 'opportunity'
        category TEXT NOT NULL, -- 'revenue', 'pipeline', 'customer', 'performance', 'risk'
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        confidence REAL NOT NULL, -- 0.0 to 1.0
        impact TEXT NOT NULL, -- 'critical', 'high', 'medium', 'low'
        priority INTEGER NOT NULL,
        actionable INTEGER DEFAULT 1,
        data TEXT, -- JSON string for additional data
        recommendations TEXT, -- JSON array of recommendation strings
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // AI Revenue Forecasts table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_revenue_forecasts (
        id TEXT PRIMARY KEY,
        next_month REAL NOT NULL,
        next_quarter REAL NOT NULL,
        next_year REAL NOT NULL,
        confidence REAL NOT NULL, -- 0.0 to 1.0
        growth_trend TEXT NOT NULL, -- 'increasing', 'decreasing', 'stable'
        factors TEXT, -- JSON array of contributing factors
        risk_factors TEXT, -- JSON array of risk factors
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    // AI Lead Scores table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_lead_scores (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        score INTEGER NOT NULL, -- 0-100
        confidence REAL NOT NULL, -- 0.0 to 1.0
        engagement_score INTEGER NOT NULL,
        demographic_score INTEGER NOT NULL,
        behavioral_score INTEGER NOT NULL,
        company_score INTEGER NOT NULL,
        reasons TEXT, -- JSON array of scoring reasons
        recommendations TEXT, -- JSON array of recommendation strings
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(lead_id)
      )
    `)

    // AI Customer Intelligence table
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_customer_intelligence (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        customer_type TEXT, -- 'high_value', 'growth_potential', 'at_risk', 'loyal', 'new'
        lifetime_value REAL,
        churn_probability REAL, -- 0.0 to 1.0
        engagement_level TEXT, -- 'high', 'medium', 'low'
        preferred_communication TEXT,
        best_contact_time TEXT,
        interests TEXT, -- JSON array of interests/topics
        behaviors TEXT, -- JSON object of key behavioral patterns
        next_best_action TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(contact_id)
      )
    `)

    // AI Deal Risk Assessments table
    db.exec(`
      CREATE TABLE IF NOT EXISTS deal_risk_assessments (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        deal_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        risk_level TEXT DEFAULT 'LOW', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
        risk_score INTEGER DEFAULT 0, -- 0-100
        risk_factors TEXT, -- JSON object of risk factor scores
        alerts TEXT, -- JSON array of alert objects
        recommendations TEXT, -- JSON array of recommendation strings
        automated_actions TEXT, -- JSON array of automated action strings
        probability_of_close INTEGER DEFAULT 50, -- 0-100
        time_to_close INTEGER DEFAULT 30, -- estimated days
        suggested_intervention TEXT,
        last_assessment TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(deal_id)
      )
    `)

    // Create indexes for AI tables for better performance
    try {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_insights(type)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_insights_category ON ai_insights(category)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_insights_priority ON ai_insights(priority DESC)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_insights_created_at ON ai_insights(created_at DESC)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_lead_scores_score ON ai_lead_scores(score DESC)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_lead_scores_created_at ON ai_lead_scores(created_at DESC)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_customer_intelligence_type ON ai_customer_intelligence(customer_type)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_customer_intelligence_churn ON ai_customer_intelligence(churn_probability DESC)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_deal_risk_assessments_risk_level ON deal_risk_assessments(risk_level)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_deal_risk_assessments_risk_score ON deal_risk_assessments(risk_score DESC)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_deal_risk_assessments_deal_id ON deal_risk_assessments(deal_id)`)
    } catch (e) {
      console.log('Some AI indexes may already exist')
    }

    console.log('Database tables initialized successfully')
  } catch (error) {
    console.error('Failed to initialize database tables:', error)
    throw error
  }
}

// Get database instance
export function getDatabase() {
  if (!db) {
    return initializeDatabase()
  }
  return db
}

// Execute a query
export function query(sql: string, params?: any[]) {
  const database = getDatabase()
  if (params && params.length > 0) {
    return database.prepare(sql).all(params)
  } else {
    return database.prepare(sql).all()
  }
}

// Execute a query and get first result
export function queryOne(sql: string, params?: any[]) {
  const database = getDatabase()
  if (params && params.length > 0) {
    return database.prepare(sql).get(params)
  } else {
    return database.prepare(sql).get()
  }
}

// Execute a query with no results
export function execute(sql: string, params?: any[]) {
  const database = getDatabase()
  if (params && params.length > 0) {
    return database.prepare(sql).run(params)
  } else {
    return database.prepare(sql).run()
  }
}

// Execute transaction
export function transaction<T>(callback: (db: Database.Database) => T): T {
  const database = getDatabase()
  return database.transaction(callback)(database)
}

// Graceful shutdown
function addEventListeners() {
  // Remove existing listeners before adding new ones to prevent memory leaks
  process.removeAllListeners('SIGINT')
  process.removeAllListeners('SIGTERM')
  
  process.on('SIGINT', () => {
    if (db) {
      console.log('Closing database connection...')
      db.close()
    }
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    if (db) {
      console.log('Closing database connection...')
      db.close()
    }
    process.exit(0)
  })
}

export default getDatabase
