export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bolivai_admins: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      bolivai_settings: {
        Row: {
          id: number
          notify_shared_secret: string | null
          notify_webhook_url: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          notify_shared_secret?: string | null
          notify_webhook_url?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          notify_shared_secret?: string | null
          notify_webhook_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      calendar_slots: {
        Row: {
          created_at: string
          end_at: string
          id: string
          is_available: boolean
          staff_id: string
          start_at: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          end_at: string
          id?: string
          is_available?: boolean
          staff_id: string
          start_at: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          end_at?: string
          id?: string
          is_available?: boolean
          staff_id?: string
          start_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_slots_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_slots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_history: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          evolution_message_id: string | null
          id: number
          is_pending: boolean
          metadata: Json
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          evolution_message_id?: string | null
          id?: number
          is_pending?: boolean
          metadata?: Json
          role: string
          tenant_id: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          evolution_message_id?: string | null
          id?: number
          is_pending?: boolean
          metadata?: Json
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_history_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          hitl_operator_id: string | null
          hitl_taken_over: boolean
          hitl_taken_over_at: string | null
          id: string
          last_message_at: string
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hitl_operator_id?: string | null
          hitl_taken_over?: boolean
          hitl_taken_over_at?: string | null
          id?: string
          last_message_at?: string
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          hitl_operator_id?: string | null
          hitl_taken_over?: boolean
          hitl_taken_over_at?: string | null
          id?: string
          last_message_at?: string
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_users: {
        Row: {
          created_at: string
          id: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          answer: string | null
          content: string
          created_at: string
          embedding: string | null
          id: number
          metadata: Json
          question: string | null
          response_template: string | null
          source: string | null
          tenant_id: string
        }
        Insert: {
          answer?: string | null
          content: string
          created_at?: string
          embedding?: string | null
          id?: number
          metadata?: Json
          question?: string | null
          response_template?: string | null
          source?: string | null
          tenant_id: string
        }
        Update: {
          answer?: string | null
          content?: string
          created_at?: string
          embedding?: string | null
          id?: number
          metadata?: Json
          question?: string | null
          response_template?: string | null
          source?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          tenant_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          position: number
          quantity: number
          service_id: string | null
          tax_rate_bps: number
          unit_price_cents: number
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          position?: number
          quantity?: number
          service_id?: string | null
          tax_rate_bps?: number
          unit_price_cents?: number
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          position?: number
          quantity?: number
          service_id?: string | null
          tax_rate_bps?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_number_sequence: {
        Row: {
          next_seq: number
          tenant_id: string
          year: number
        }
        Insert: {
          next_seq?: number
          tenant_id: string
          year: number
        }
        Update: {
          next_seq?: number
          tenant_id?: string
          year?: number
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_paid_cents: number
          application_fee_cents: number
          created_at: string
          currency: string
          customer_address: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          due_date: string | null
          id: string
          is_recurring: boolean
          issue_date: string | null
          notes: string | null
          number: string | null
          paid_at: string | null
          recurrence_end_date: string | null
          recurrence_interval: string | null
          recurrence_interval_count: number | null
          reservation_id: string | null
          sent_at: string | null
          status: string
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          stripe_invoice_pdf: string | null
          stripe_payment_link: string | null
          stripe_subscription_id: string | null
          subtotal_cents: number
          tax_cents: number
          tenant_id: string
          total_cents: number
          updated_at: string
        }
        Insert: {
          amount_paid_cents?: number
          application_fee_cents?: number
          created_at?: string
          currency?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean
          issue_date?: string | null
          notes?: string | null
          number?: string | null
          paid_at?: string | null
          recurrence_end_date?: string | null
          recurrence_interval?: string | null
          recurrence_interval_count?: number | null
          reservation_id?: string | null
          sent_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_invoice_pdf?: string | null
          stripe_payment_link?: string | null
          stripe_subscription_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          tenant_id: string
          total_cents?: number
          updated_at?: string
        }
        Update: {
          amount_paid_cents?: number
          application_fee_cents?: number
          created_at?: string
          currency?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean
          issue_date?: string | null
          notes?: string | null
          number?: string | null
          paid_at?: string | null
          recurrence_end_date?: string | null
          recurrence_interval?: string | null
          recurrence_interval_count?: number | null
          reservation_id?: string | null
          sent_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_invoice_pdf?: string | null
          stripe_payment_link?: string | null
          stripe_subscription_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          tenant_id?: string
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          conversation_id: string | null
          created_at: string
          email: string | null
          id: string
          intent: string | null
          name: string | null
          notes: string | null
          status: string
          tenant_id: string
          user_id: string | null
          whatsapp_number: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          intent?: string | null
          name?: string | null
          notes?: string | null
          status?: string
          tenant_id: string
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          intent?: string | null
          name?: string | null
          notes?: string | null
          status?: string
          tenant_id?: string
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_chat_histories: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      pain: {
        Row: {
          content: string
          created_at: string
          diagnosis: string | null
          embedding: string | null
          id: number
          metadata: Json
          recommendation: string | null
          source: string | null
          symptom: string | null
          tenant_id: string
        }
        Insert: {
          content: string
          created_at?: string
          diagnosis?: string | null
          embedding?: string | null
          id?: number
          metadata?: Json
          recommendation?: string | null
          source?: string | null
          symptom?: string | null
          tenant_id: string
        }
        Update: {
          content?: string
          created_at?: string
          diagnosis?: string | null
          embedding?: string | null
          id?: number
          metadata?: Json
          recommendation?: string | null
          source?: string | null
          symptom?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pain_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      record_manager: {
        Row: {
          hash: string
          id: number
          ingested_at: string
          source: string
          tenant_id: string
        }
        Insert: {
          hash: string
          id?: number
          ingested_at?: string
          source: string
          tenant_id: string
        }
        Update: {
          hash?: string
          id?: number
          ingested_at?: string
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_manager_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          duration_minutes: number
          end_at: string
          id: string
          meeting_provider: string | null
          meeting_room_name: string | null
          meeting_url: string | null
          notes: string | null
          service_id: string | null
          slot_id: string | null
          staff_id: string | null
          start_at: string
          status: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          duration_minutes: number
          end_at: string
          id?: string
          meeting_provider?: string | null
          meeting_room_name?: string | null
          meeting_url?: string | null
          notes?: string | null
          service_id?: string | null
          slot_id?: string | null
          staff_id?: string | null
          start_at: string
          status?: string
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          duration_minutes?: number
          end_at?: string
          id?: string
          meeting_provider?: string | null
          meeting_room_name?: string | null
          meeting_url?: string | null
          notes?: string | null
          service_id?: string | null
          slot_id?: string | null
          staff_id?: string | null
          start_at?: string
          status?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "calendar_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          description: string | null
          duration_min: number
          id: string
          metadata: Json
          name: string
          price_amount: number | null
          price_currency: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          duration_min?: number
          id?: string
          metadata?: Json
          name: string
          price_amount?: number | null
          price_currency?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          duration_min?: number
          id?: string
          metadata?: Json
          name?: string
          price_amount?: number | null
          price_currency?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          metadata: Json
          name: string
          role: string | null
          tenant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json
          name: string
          role?: string | null
          tenant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json
          name?: string
          role?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_daily_load: {
        Row: {
          available_minutes: number
          booked_minutes: number
          date: string
          staff_id: string
          tenant_id: string
        }
        Insert: {
          available_minutes?: number
          booked_minutes?: number
          date: string
          staff_id: string
          tenant_id: string
        }
        Update: {
          available_minutes?: number
          booked_minutes?: number
          date?: string
          staff_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_daily_load_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_daily_load_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_services: {
        Row: {
          created_at: string
          service_id: string
          staff_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          service_id: string
          staff_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          service_id?: string
          staff_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_integrations: {
        Row: {
          access_token: string | null
          created_at: string
          expires_at: string | null
          id: string
          metadata: Json
          provider: string
          refresh_token: string | null
          scope: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          provider: string
          refresh_token?: string | null
          scope?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          provider?: string
          refresh_token?: string | null
          scope?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accent_color: string | null
          address_city: string | null
          address_country: string | null
          address_line1: string | null
          address_line2: string | null
          address_postal_code: string | null
          address_state: string | null
          created_at: string
          custom_domain: string | null
          elevenlabs_agent_id: string | null
          gateway: string
          gateway_config: Json
          id: string
          industry: string | null
          invoice_default_currency: string
          invoice_footer: string | null
          language: string
          legal_name: string | null
          logo_url: string | null
          metadata: Json
          name: string
          notification_email: string | null
          notification_whatsapp_e164: string | null
          notify_on_cancel: boolean
          notify_on_new_reservation: boolean
          notify_on_reschedule: boolean
          plan: string
          primary_color: string | null
          prompt_template: string | null
          prompt_variables: Json
          slug: string
          status: string
          stripe_account_country: string | null
          stripe_account_id: string | null
          stripe_account_updated_at: string | null
          stripe_charges_enabled: boolean
          stripe_payouts_enabled: boolean
          support_email: string | null
          support_whatsapp: string | null
          tax_id: string | null
          timezone: string
          updated_at: string
          voice_agent_created_at: string | null
          voice_agent_updated_at: string | null
          voice_enabled: boolean
          voice_greeting: string | null
          voice_id: string | null
          voice_kb_doc_id: string | null
          voice_kb_synced_at: string | null
          voice_languages: string[]
          voice_phone_account_sid: string | null
          voice_phone_auth_token: string | null
          voice_phone_elevenlabs_id: string | null
          voice_phone_number: string | null
          voice_phone_provider: string | null
          whatsapp_number: string | null
          workflow_template: string
        }
        Insert: {
          accent_color?: string | null
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_line2?: string | null
          address_postal_code?: string | null
          address_state?: string | null
          created_at?: string
          custom_domain?: string | null
          elevenlabs_agent_id?: string | null
          gateway?: string
          gateway_config?: Json
          id?: string
          industry?: string | null
          invoice_default_currency?: string
          invoice_footer?: string | null
          language?: string
          legal_name?: string | null
          logo_url?: string | null
          metadata?: Json
          name: string
          notification_email?: string | null
          notification_whatsapp_e164?: string | null
          notify_on_cancel?: boolean
          notify_on_new_reservation?: boolean
          notify_on_reschedule?: boolean
          plan?: string
          primary_color?: string | null
          prompt_template?: string | null
          prompt_variables?: Json
          slug: string
          status?: string
          stripe_account_country?: string | null
          stripe_account_id?: string | null
          stripe_account_updated_at?: string | null
          stripe_charges_enabled?: boolean
          stripe_payouts_enabled?: boolean
          support_email?: string | null
          support_whatsapp?: string | null
          tax_id?: string | null
          timezone?: string
          updated_at?: string
          voice_agent_created_at?: string | null
          voice_agent_updated_at?: string | null
          voice_enabled?: boolean
          voice_greeting?: string | null
          voice_id?: string | null
          voice_kb_doc_id?: string | null
          voice_kb_synced_at?: string | null
          voice_languages?: string[]
          voice_phone_account_sid?: string | null
          voice_phone_auth_token?: string | null
          voice_phone_elevenlabs_id?: string | null
          voice_phone_number?: string | null
          voice_phone_provider?: string | null
          whatsapp_number?: string | null
          workflow_template?: string
        }
        Update: {
          accent_color?: string | null
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_line2?: string | null
          address_postal_code?: string | null
          address_state?: string | null
          created_at?: string
          custom_domain?: string | null
          elevenlabs_agent_id?: string | null
          gateway?: string
          gateway_config?: Json
          id?: string
          industry?: string | null
          invoice_default_currency?: string
          invoice_footer?: string | null
          language?: string
          legal_name?: string | null
          logo_url?: string | null
          metadata?: Json
          name?: string
          notification_email?: string | null
          notification_whatsapp_e164?: string | null
          notify_on_cancel?: boolean
          notify_on_new_reservation?: boolean
          notify_on_reschedule?: boolean
          plan?: string
          primary_color?: string | null
          prompt_template?: string | null
          prompt_variables?: Json
          slug?: string
          status?: string
          stripe_account_country?: string | null
          stripe_account_id?: string | null
          stripe_account_updated_at?: string | null
          stripe_charges_enabled?: boolean
          stripe_payouts_enabled?: boolean
          support_email?: string | null
          support_whatsapp?: string | null
          tax_id?: string | null
          timezone?: string
          updated_at?: string
          voice_agent_created_at?: string | null
          voice_agent_updated_at?: string | null
          voice_enabled?: boolean
          voice_greeting?: string | null
          voice_id?: string | null
          voice_kb_doc_id?: string | null
          voice_kb_synced_at?: string | null
          voice_languages?: string[]
          voice_phone_account_sid?: string | null
          voice_phone_auth_token?: string | null
          voice_phone_elevenlabs_id?: string | null
          voice_phone_number?: string | null
          voice_phone_provider?: string | null
          whatsapp_number?: string | null
          workflow_template?: string
        }
        Relationships: []
      }
      usage_metrics: {
        Row: {
          conversations_count: number
          messages_count: number
          period_start: string
          tenant_id: string
        }
        Insert: {
          conversations_count?: number
          messages_count?: number
          period_start: string
          tenant_id: string
        }
        Update: {
          conversations_count?: number
          messages_count?: number
          period_start?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string | null
          facts: string | null
          id: string
          is_vip: boolean
          metadata: Json
          name: string | null
          tenant_id: string
          tenant_notes: string | null
          updated_at: string
          whatsapp_number: string
          zep_session_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          facts?: string | null
          id?: string
          is_vip?: boolean
          metadata?: Json
          name?: string | null
          tenant_id: string
          tenant_notes?: string | null
          updated_at?: string
          whatsapp_number: string
          zep_session_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          facts?: string | null
          id?: string
          is_vip?: boolean
          metadata?: Json
          name?: string | null
          tenant_id?: string
          tenant_notes?: string | null
          updated_at?: string
          whatsapp_number?: string
          zep_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_conversations: {
        Row: {
          call_outcome: string | null
          caller_phone: string | null
          charged_cents: number | null
          cost_cents: number | null
          created_at: string
          direction: string
          duration_seconds: number | null
          elevenlabs_conversation_id: string | null
          ended_at: string | null
          id: string
          started_at: string
          tenant_id: string
          transcript_url: string | null
          user_id: string | null
        }
        Insert: {
          call_outcome?: string | null
          caller_phone?: string | null
          charged_cents?: number | null
          cost_cents?: number | null
          created_at?: string
          direction: string
          duration_seconds?: number | null
          elevenlabs_conversation_id?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string
          tenant_id: string
          transcript_url?: string | null
          user_id?: string | null
        }
        Update: {
          call_outcome?: string | null
          caller_phone?: string | null
          charged_cents?: number | null
          cost_cents?: number | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          elevenlabs_conversation_id?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string
          tenant_id?: string
          transcript_url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_usage_monthly: {
        Row: {
          charged_at: string | null
          charged_cents: number
          cost_cents: number
          id: string
          minutes_used: number
          stripe_invoice_id: string | null
          tenant_id: string
          year_month: string
        }
        Insert: {
          charged_at?: string | null
          charged_cents?: number
          cost_cents?: number
          id?: string
          minutes_used?: number
          stripe_invoice_id?: string | null
          tenant_id: string
          year_month: string
        }
        Update: {
          charged_at?: string | null
          charged_cents?: number
          cost_cents?: number
          id?: string
          minutes_used?: number
          stripe_invoice_id?: string | null
          tenant_id?: string
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_usage_monthly_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_slot: {
        Args: {
          p_customer_email: string
          p_customer_name: string
          p_customer_phone?: string
          p_duration_min: number
          p_notes?: string
          p_service_id?: string
          p_slot_id: string
          p_tenant_id: string
          p_user_id: string
        }
        Returns: {
          end_at: string
          end_local: string
          reservation_id: string
          staff_name: string
          start_at: string
          start_date_local: string
          start_local: string
        }[]
      }
      cancel_reservation: {
        Args: { p_reason?: string; p_reservation_id: string }
        Returns: {
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          duration_minutes: number
          end_at: string
          id: string
          meeting_provider: string | null
          meeting_room_name: string | null
          meeting_url: string | null
          notes: string | null
          service_id: string | null
          slot_id: string | null
          staff_id: string | null
          start_at: string
          status: string
          tenant_id: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin_of: { Args: { p_tenant_id: string }; Returns: boolean }
      is_bolivai_admin: { Args: never; Returns: boolean }
      is_member_of: { Args: { p_tenant_id: string }; Returns: boolean }
      list_services: {
        Args: { p_category?: string; p_tenant_id: string }
        Returns: {
          category: string
          description: string
          duration_min: number
          id: string
          name: string
          price_amount: number
          price_currency: string
        }[]
      }
      list_services_with_staff: {
        Args: { p_tenant_id: string }
        Returns: {
          category: string
          description: string
          duration_min: number
          price_amount: number
          price_currency: string
          service_id: string
          service_name: string
          staff: Json
        }[]
      }
      lookup_customer_reservation: {
        Args: {
          p_customer_phone: string
          p_request_reason?: string
          p_tenant_id: string
        }
        Returns: {
          customer_email: string
          customer_name: string
          duration_minutes: number
          end_at: string
          reservation_id: string
          service_id: string
          slot_id: string
          start_at: string
          status: string
        }[]
      }
      match_documents: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      match_pain: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      next_invoice_number: { Args: { p_tenant_id: string }; Returns: string }
      reschedule_reservation: {
        Args: {
          p_duration_min?: number
          p_new_slot_id: string
          p_reservation_id: string
        }
        Returns: {
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          duration_minutes: number
          end_at: string
          id: string
          meeting_provider: string | null
          meeting_room_name: string | null
          meeting_url: string | null
          notes: string | null
          service_id: string | null
          slot_id: string | null
          staff_id: string | null
          start_at: string
          status: string
          tenant_id: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      role_on_tenant: { Args: { p_tenant_id: string }; Returns: string }
      search_slots_day: {
        Args: {
          p_date: string
          p_duration_min?: number
          p_service_id?: string
          p_tenant_id: string
        }
        Returns: {
          end_time: string
          slot_id: string
          staff_id: string
          staff_name: string
          start_time: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
