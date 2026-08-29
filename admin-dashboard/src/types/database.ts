// ============================================================
// Database Types — auto-generated from Supabase schema
// Matches migrations/001_schema.sql exactly
// ============================================================

export type TransactionStatus =
  | 'received' | 'matched' | 'bundle_found' | 'pending'
  | 'processing' | 'ussd_started' | 'authenticating' | 'confirming'
  | 'success' | 'failed' | 'customer_not_found' | 'invalid_amount'
  | 'duplicate' | 'unknown_result' | 'ussd_interaction_required' | 'queued'

export type DeviceStatus = 'online' | 'offline' | 'processing' | 'disabled'
export type UserRole = 'admin' | 'operator'
export type ProfileStatus = 'active' | 'disabled'
export type DataUnit = 'MB' | 'GB'

export interface Profile {
  id: string
  role: UserRole
  full_name: string
  phone_number: string | null
  status: ProfileStatus
  force_password_change: boolean
  created_at: string
  updated_at: string
}

export interface Operator {
  id: string
  profile_id: string
  username: string
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined
  profile?: Profile
  devices?: Device[]
  _transaction_count?: number
  _total_sls?: number
}

export interface Customer {
  id: string
  customer_name: string
  telesom_number: string
  somtel_number: string
  active: boolean
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface BundleRule {
  id: string
  amount_sls: number
  bundle_name: string
  data_amount: number
  data_unit: DataUnit
  ussd_option: string
  ussd_code: string
  ussd_replies?: string[]
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface UssdConfig {
  id: string
  name: string
  description: string | null
  steps: UssdStep[]
  active: boolean
  created_at: string
  updated_at: string
}

export interface UssdStep {
  step: number
  type: 'DIAL' | 'WAIT_RESPONSE' | 'SEND_REPLY' | 'ENTER_NUMBER' | 'ENTER_PIN' | 'READ_RESPONSE'
  description: string
  ussd_code_template?: string
  field?: string
  value?: string
  timeout_ms: number
  expected_contains?: string[]
  success_patterns?: string[]
  failure_patterns?: string[]
}

export interface SmsParserConfig {
  id: string
  name: string
  description: string | null
  sender_pattern: string | null
  amount_pattern: string
  currency_pattern: string
  txn_id_pattern: string | null
  active: boolean
  priority: number
  created_at: string
  updated_at: string
}

export interface Device {
  id: string
  operator_id: string
  device_name: string
  device_identifier: string
  android_version: string | null
  app_version: string | null
  gateway_enabled: boolean
  status: DeviceStatus
  last_seen: string | null
  battery_level?: number | null
  is_charging?: boolean | null
  revoked: boolean
  revoked_at: string | null
  revoked_by: string | null
  created_at: string
  updated_at: string
  // Joined
  operator?: Operator
}

export interface Transaction {
  id: string
  sms_hash: string
  telesom_number: string
  amount_sls: number
  currency: string
  telesom_transaction_id: string | null
  somtel_number: string | null
  bundle_rule_id: string | null
  operator_id: string | null
  device_id: string | null
  status: TransactionStatus
  ussd_reference: string | null
  failure_reason: string | null
  sms_body: string | null
  sms_timestamp: string | null
  test_mode: boolean
  created_at: string
  processing_started_at: string | null
  completed_at: string | null
  updated_at: string
  // Joined
  bundle_rule?: BundleRule
  operator?: Operator
  device?: Device
  events?: TransactionEvent[]
}

export interface TransactionEvent {
  id: string
  transaction_id: string
  event_type: string
  description: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface AuditLog {
  id: string
  actor_id: string | null
  actor_role: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  description: string | null
  ip_address: string | null
  metadata: Record<string, unknown>
  created_at: string
  // Joined
  actor?: Profile
}

export interface DashboardStats {
  total: number
  success: number
  failed: number
  pending: number
  unknown: number
  customer_not_found: number
  invalid_amount: number
  duplicates: number
  total_sls_processed: number
  total_sls_attempted: number
}

// Supabase Database type for typed client
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> }
      operators: { Row: Operator; Insert: Partial<Operator>; Update: Partial<Operator> }
      customers: { Row: Customer; Insert: Partial<Customer>; Update: Partial<Customer> }
      bundle_rules: { Row: BundleRule; Insert: Partial<BundleRule>; Update: Partial<BundleRule> }
      ussd_config: { Row: UssdConfig; Insert: Partial<UssdConfig>; Update: Partial<UssdConfig> }
      sms_parser_config: { Row: SmsParserConfig; Insert: Partial<SmsParserConfig>; Update: Partial<SmsParserConfig> }
      devices: { Row: Device; Insert: Partial<Device>; Update: Partial<Device> }
      transactions: { Row: Transaction; Insert: Partial<Transaction>; Update: Partial<Transaction> }
      transaction_events: { Row: TransactionEvent; Insert: Partial<TransactionEvent>; Update: Partial<TransactionEvent> }
      audit_logs: { Row: AuditLog; Insert: Partial<AuditLog>; Update: Partial<AuditLog> }
    }
    Functions: {
      get_dashboard_stats: { Args: { p_from_date?: string; p_to_date?: string }; Returns: DashboardStats }
      get_operator_stats: { Args: { p_operator_id: string; p_from_date?: string; p_to_date?: string }; Returns: DashboardStats }
      update_transaction_state: { Args: { p_transaction_id: string; p_new_status: string; p_failure_reason?: string }; Returns: Transaction }
      check_duplicate_transaction: { Args: { p_sms_hash: string; p_telesom_txn_id?: string }; Returns: { is_duplicate: boolean; existing_id: string; existing_status: string }[] }
    }
  }
}
