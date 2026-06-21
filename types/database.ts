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
      aima_scrape_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          leads_found: number
          leads_new: number
          metadata: Json
          source: string
          started_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          leads_found?: number
          leads_new?: number
          metadata?: Json
          source: string
          started_at?: string
          status?: string
          tenant_id: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          leads_found?: number
          leads_new?: number
          metadata?: Json
          source?: string
          started_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aima_scrape_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      aima_settings: {
        Row: {
          apollo_api_key: string | null
          apollo_enabled: boolean
          apollo_search_params: Json
          cold_email_daily_cap: number
          cold_email_enabled: boolean
          google_maps_api_key: string | null
          instantly_api_key: string | null
          instantly_campaign_id: string | null
          scraper_concurrency: number
          scraper_enabled: boolean
          scraper_max_per_run: number
          scraper_proxy_token: string | null
          scraper_proxy_url: string | null
          scraper_sources: Json
          target_geographies: string[]
          target_verticals: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          apollo_api_key?: string | null
          apollo_enabled?: boolean
          apollo_search_params?: Json
          cold_email_daily_cap?: number
          cold_email_enabled?: boolean
          google_maps_api_key?: string | null
          instantly_api_key?: string | null
          instantly_campaign_id?: string | null
          scraper_concurrency?: number
          scraper_enabled?: boolean
          scraper_max_per_run?: number
          scraper_proxy_token?: string | null
          scraper_proxy_url?: string | null
          scraper_sources?: Json
          target_geographies?: string[]
          target_verticals?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          apollo_api_key?: string | null
          apollo_enabled?: boolean
          apollo_search_params?: Json
          cold_email_daily_cap?: number
          cold_email_enabled?: boolean
          google_maps_api_key?: string | null
          instantly_api_key?: string | null
          instantly_campaign_id?: string | null
          scraper_concurrency?: number
          scraper_enabled?: boolean
          scraper_max_per_run?: number
          scraper_proxy_token?: string | null
          scraper_proxy_url?: string | null
          scraper_sources?: Json
          target_geographies?: string[]
          target_verticals?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aima_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          tenant_id: string
          tools_used: Json
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          tenant_id: string
          tools_used?: Json
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          tenant_id?: string
          tools_used?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
      castillo_webhook_secrets: {
        Row: {
          created_at: string
          secret: string
          workflow_slug: string
        }
        Insert: {
          created_at?: string
          secret: string
          workflow_slug: string
        }
        Update: {
          created_at?: string
          secret?: string
          workflow_slug?: string
        }
        Relationships: []
      }
      ccavai_drafts: {
        Row: {
          accent_phrases: Json
          branded_headline: string | null
          category_label: string | null
          decided_at: string | null
          decided_notes: string | null
          draft_body: string
          draft_hashtags: Json
          draft_title: string | null
          generated_at: string
          id: string
          image_prompt: string | null
          image_url: string | null
          metadata: Json
          platform: string
          posted_url: string | null
          run_id: string
          status: string
          story_source: string | null
          story_summary: string | null
          story_title: string
          story_url: string | null
          subject_image_url: string | null
          tenant_id: string
          visual_prompt: string | null
        }
        Insert: {
          accent_phrases?: Json
          branded_headline?: string | null
          category_label?: string | null
          decided_at?: string | null
          decided_notes?: string | null
          draft_body: string
          draft_hashtags?: Json
          draft_title?: string | null
          generated_at?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          metadata?: Json
          platform: string
          posted_url?: string | null
          run_id: string
          status?: string
          story_source?: string | null
          story_summary?: string | null
          story_title: string
          story_url?: string | null
          subject_image_url?: string | null
          tenant_id?: string
          visual_prompt?: string | null
        }
        Update: {
          accent_phrases?: Json
          branded_headline?: string | null
          category_label?: string | null
          decided_at?: string | null
          decided_notes?: string | null
          draft_body?: string
          draft_hashtags?: Json
          draft_title?: string | null
          generated_at?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          metadata?: Json
          platform?: string
          posted_url?: string | null
          run_id?: string
          status?: string
          story_source?: string | null
          story_summary?: string | null
          story_title?: string
          story_url?: string | null
          subject_image_url?: string | null
          tenant_id?: string
          visual_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ccavai_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ccavai_runs: {
        Row: {
          articles_seen: number
          drafts_created: number
          error: string | null
          finished_at: string | null
          id: string
          metadata: Json
          sources_polled: number
          started_at: string
          status: string
          stories_picked: number
          tenant_id: string
        }
        Insert: {
          articles_seen?: number
          drafts_created?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          sources_polled?: number
          started_at?: string
          status?: string
          stories_picked?: number
          tenant_id?: string
        }
        Update: {
          articles_seen?: number
          drafts_created?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          sources_polled?: number
          started_at?: string
          status?: string
          stories_picked?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ccavai_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ccavai_settings: {
        Row: {
          auto_post: boolean
          brand_vocabulary: string | null
          created_at: string
          do_not_say: string[]
          drafts_per_run: number
          enabled: boolean
          generate_images: boolean
          image_style: string
          platforms: string[]
          rss_sources: Json
          tenant_id: string
          tone: string
          updated_at: string
        }
        Insert: {
          auto_post?: boolean
          brand_vocabulary?: string | null
          created_at?: string
          do_not_say?: string[]
          drafts_per_run?: number
          enabled?: boolean
          generate_images?: boolean
          image_style?: string
          platforms?: string[]
          rss_sources?: Json
          tenant_id: string
          tone?: string
          updated_at?: string
        }
        Update: {
          auto_post?: boolean
          brand_vocabulary?: string | null
          created_at?: string
          do_not_say?: string[]
          drafts_per_run?: number
          enabled?: boolean
          generate_images?: boolean
          image_style?: string
          platforms?: string[]
          rss_sources?: Json
          tenant_id?: string
          tone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ccavai_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_history: {
        Row: {
          channel: string
          content: string
          conversation_id: string
          created_at: string
          evolution_message_id: string | null
          id: number
          is_pending: boolean
          metadata: Json
          provider_message_id: string | null
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          channel?: string
          content: string
          conversation_id: string
          created_at?: string
          evolution_message_id?: string | null
          id?: number
          is_pending?: boolean
          metadata?: Json
          provider_message_id?: string | null
          role: string
          tenant_id: string
          user_id: string
        }
        Update: {
          channel?: string
          content?: string
          conversation_id?: string
          created_at?: string
          evolution_message_id?: string | null
          id?: number
          is_pending?: boolean
          metadata?: Json
          provider_message_id?: string | null
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
          channel: string
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
          channel?: string
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
          channel?: string
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
      credit_accounts: {
        Row: {
          auto_refill_amount_cents: number | null
          auto_refill_enabled: boolean
          auto_refill_trigger: number
          balance_credits: number
          created_at: string
          default_payment_method: string | null
          lifetime_spent_credits: number
          lifetime_topped_up_cents: number
          low_balance_threshold: number
          out_of_credits_at: string | null
          reserved_credits: number
          stripe_customer_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_refill_amount_cents?: number | null
          auto_refill_enabled?: boolean
          auto_refill_trigger?: number
          balance_credits?: number
          created_at?: string
          default_payment_method?: string | null
          lifetime_spent_credits?: number
          lifetime_topped_up_cents?: number
          low_balance_threshold?: number
          out_of_credits_at?: string | null
          reserved_credits?: number
          stripe_customer_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_refill_amount_cents?: number | null
          auto_refill_enabled?: boolean
          auto_refill_trigger?: number
          balance_credits?: number
          created_at?: string
          default_payment_method?: string | null
          lifetime_spent_credits?: number
          lifetime_topped_up_cents?: number
          low_balance_threshold?: number
          out_of_credits_at?: string | null
          reserved_credits?: number
          stripe_customer_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_budgets: {
        Row: {
          allocated_credits: number
          created_at: string
          enabled: boolean
          id: string
          period: string
          period_start: string
          scope_id: string
          scope_type: string
          spent_credits: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allocated_credits: number
          created_at?: string
          enabled?: boolean
          id?: string
          period: string
          period_start?: string
          scope_id: string
          scope_type: string
          spent_credits?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allocated_credits?: number
          created_at?: string
          enabled?: boolean
          id?: string
          period?: string
          period_start?: string
          scope_id?: string
          scope_type?: string
          spent_credits?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_budgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_pricing: {
        Row: {
          action_key: string
          cost_per_unit_micros: number
          credits_per_unit: number
          description: string | null
          unit_label: string
          updated_at: string
          vendor_cost_micros: Json
        }
        Insert: {
          action_key: string
          cost_per_unit_micros?: number
          credits_per_unit: number
          description?: string | null
          unit_label: string
          updated_at?: string
          vendor_cost_micros?: Json
        }
        Update: {
          action_key?: string
          cost_per_unit_micros?: number
          credits_per_unit?: number
          description?: string | null
          unit_label?: string
          updated_at?: string
          vendor_cost_micros?: Json
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          action_key: string | null
          actor_user_id: string | null
          balance_after: number
          budget_id: string | null
          created_at: string
          credits_delta: number
          id: string
          metadata: Json
          reference_id: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          action_key?: string | null
          actor_user_id?: string | null
          balance_after: number
          budget_id?: string | null
          created_at?: string
          credits_delta: number
          id?: string
          metadata?: Json
          reference_id?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          action_key?: string | null
          actor_user_id?: string | null
          balance_after?: number
          budget_id?: string | null
          created_at?: string
          credits_delta?: number
          id?: string
          metadata?: Json
          reference_id?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      employee_group_members: {
        Row: {
          added_at: string
          group_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          group_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          group_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "employee_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_group_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_group_members_user_id_tenant_id_fkey"
            columns: ["user_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_users"
            referencedColumns: ["user_id", "tenant_id"]
          },
        ]
      }
      employee_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_groups_tenant_id_fkey"
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
          metadata: Json
          name: string | null
          notes: string | null
          source: string
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
          metadata?: Json
          name?: string | null
          notes?: string | null
          source?: string
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
          metadata?: Json
          name?: string | null
          notes?: string | null
          source?: string
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
      sandra_call_queue: {
        Row: {
          attempts: number
          call_conversation_id: string | null
          id: string
          last_attempt_at: string | null
          lead_id: string | null
          metadata: Json
          notes: string | null
          outcome: string | null
          priority: number
          queued_at: string
          scheduled_for: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          call_conversation_id?: string | null
          id?: string
          last_attempt_at?: string | null
          lead_id?: string | null
          metadata?: Json
          notes?: string | null
          outcome?: string | null
          priority?: number
          queued_at?: string
          scheduled_for?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          call_conversation_id?: string | null
          id?: string
          last_attempt_at?: string | null
          lead_id?: string | null
          metadata?: Json
          notes?: string | null
          outcome?: string | null
          priority?: number
          queued_at?: string
          scheduled_for?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sandra_call_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandra_call_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      tenant_channels: {
        Row: {
          channel: string
          config: Json
          created_at: string
          external_id: string
          id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          config?: Json
          created_at?: string
          external_id: string
          id?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          config?: Json
          created_at?: string
          external_id?: string
          id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_facts: {
        Row: {
          created_at: string
          created_by: string | null
          fact: string
          id: string
          source: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fact: string
          id?: string
          source?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fact?: string
          id?: string
          source?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_facts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
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
          founding_member_number: number | null
          gateway: string
          gateway_config: Json
          id: string
          industry: string | null
          invoice_default_currency: string
          invoice_footer: string | null
          language: string
          legal_name: string | null
          lifetime_access: boolean
          lifetime_access_at: string | null
          lifetime_code: string | null
          lifetime_discount_pct: number
          lifetime_paid_cents: number | null
          lifetime_stripe_pi: string | null
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
          voice_elevenlabs_outbound_phone_id: string | null
          voice_enabled: boolean
          voice_greeting: string | null
          voice_id: string | null
          voice_kb_doc_id: string | null
          voice_kb_synced_at: string | null
          voice_languages: string[]
          voice_persona: Json
          voice_phone_account_sid: string | null
          voice_phone_auth_token: string | null
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
          founding_member_number?: number | null
          gateway?: string
          gateway_config?: Json
          id?: string
          industry?: string | null
          invoice_default_currency?: string
          invoice_footer?: string | null
          language?: string
          legal_name?: string | null
          lifetime_access?: boolean
          lifetime_access_at?: string | null
          lifetime_code?: string | null
          lifetime_discount_pct?: number
          lifetime_paid_cents?: number | null
          lifetime_stripe_pi?: string | null
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
          voice_elevenlabs_outbound_phone_id?: string | null
          voice_enabled?: boolean
          voice_greeting?: string | null
          voice_id?: string | null
          voice_kb_doc_id?: string | null
          voice_kb_synced_at?: string | null
          voice_languages?: string[]
          voice_persona?: Json
          voice_phone_account_sid?: string | null
          voice_phone_auth_token?: string | null
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
          founding_member_number?: number | null
          gateway?: string
          gateway_config?: Json
          id?: string
          industry?: string | null
          invoice_default_currency?: string
          invoice_footer?: string | null
          language?: string
          legal_name?: string | null
          lifetime_access?: boolean
          lifetime_access_at?: string | null
          lifetime_code?: string | null
          lifetime_discount_pct?: number
          lifetime_paid_cents?: number | null
          lifetime_stripe_pi?: string | null
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
          voice_elevenlabs_outbound_phone_id?: string | null
          voice_enabled?: boolean
          voice_greeting?: string | null
          voice_id?: string | null
          voice_kb_doc_id?: string | null
          voice_kb_synced_at?: string | null
          voice_languages?: string[]
          voice_persona?: Json
          voice_phone_account_sid?: string | null
          voice_phone_auth_token?: string | null
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
          business_name: string | null
          channel: string
          channel_user_id: string | null
          created_at: string
          email: string | null
          facts: string | null
          id: string
          is_vip: boolean
          metadata: Json
          name: string | null
          point_of_contact: string | null
          tenant_id: string
          tenant_notes: string | null
          updated_at: string
          whatsapp_number: string | null
          zep_session_id: string | null
        }
        Insert: {
          business_name?: string | null
          channel?: string
          channel_user_id?: string | null
          created_at?: string
          email?: string | null
          facts?: string | null
          id?: string
          is_vip?: boolean
          metadata?: Json
          name?: string | null
          point_of_contact?: string | null
          tenant_id: string
          tenant_notes?: string | null
          updated_at?: string
          whatsapp_number?: string | null
          zep_session_id?: string | null
        }
        Update: {
          business_name?: string | null
          channel?: string
          channel_user_id?: string | null
          created_at?: string
          email?: string | null
          facts?: string | null
          id?: string
          is_vip?: boolean
          metadata?: Json
          name?: string | null
          point_of_contact?: string | null
          tenant_id?: string
          tenant_notes?: string | null
          updated_at?: string
          whatsapp_number?: string | null
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
      vira_clips: {
        Row: {
          clip_index: number
          created_at: string
          end_seconds: number
          id: string
          job_id: string
          metadata: Json
          output_url: string | null
          reasoning: string | null
          start_seconds: number
          subtitle_track_url: string | null
          tenant_id: string
          thumbnail_url: string | null
          title: string | null
          transcript_excerpt: string | null
        }
        Insert: {
          clip_index: number
          created_at?: string
          end_seconds: number
          id?: string
          job_id: string
          metadata?: Json
          output_url?: string | null
          reasoning?: string | null
          start_seconds: number
          subtitle_track_url?: string | null
          tenant_id: string
          thumbnail_url?: string | null
          title?: string | null
          transcript_excerpt?: string | null
        }
        Update: {
          clip_index?: number
          created_at?: string
          end_seconds?: number
          id?: string
          job_id?: string
          metadata?: Json
          output_url?: string | null
          reasoning?: string | null
          start_seconds?: number
          subtitle_track_url?: string | null
          tenant_id?: string
          thumbnail_url?: string | null
          title?: string | null
          transcript_excerpt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vira_clips_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "vira_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vira_clips_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vira_jobs: {
        Row: {
          created_at: string
          duration_seconds: number | null
          error: string | null
          finished_at: string | null
          id: string
          language: string | null
          metadata: Json
          reasoning_summary: string | null
          settings_snapshot: Json
          source_type: string | null
          source_url: string
          started_at: string | null
          status: string
          tenant_id: string
          transcript: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          language?: string | null
          metadata?: Json
          reasoning_summary?: string | null
          settings_snapshot?: Json
          source_type?: string | null
          source_url: string
          started_at?: string | null
          status?: string
          tenant_id: string
          transcript?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          language?: string | null
          metadata?: Json
          reasoning_summary?: string | null
          settings_snapshot?: Json
          source_type?: string | null
          source_url?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vira_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vira_settings: {
        Row: {
          add_subtitles: boolean
          add_watermark: boolean
          auto_post_drafts: boolean
          clip_style: string
          clips_per_video: number
          created_at: string
          enabled: boolean
          max_clip_seconds: number
          max_input_minutes: number
          min_clip_seconds: number
          output_format: string
          subtitle_style: string
          tenant_id: string
          updated_at: string
          watermark_text: string | null
        }
        Insert: {
          add_subtitles?: boolean
          add_watermark?: boolean
          auto_post_drafts?: boolean
          clip_style?: string
          clips_per_video?: number
          created_at?: string
          enabled?: boolean
          max_clip_seconds?: number
          max_input_minutes?: number
          min_clip_seconds?: number
          output_format?: string
          subtitle_style?: string
          tenant_id: string
          updated_at?: string
          watermark_text?: string | null
        }
        Update: {
          add_subtitles?: boolean
          add_watermark?: boolean
          auto_post_drafts?: boolean
          clip_style?: string
          clips_per_video?: number
          created_at?: string
          enabled?: boolean
          max_clip_seconds?: number
          max_input_minutes?: number
          min_clip_seconds?: number
          output_format?: string
          subtitle_style?: string
          tenant_id?: string
          updated_at?: string
          watermark_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vira_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
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
      _t_probe2: { Args: never; Returns: number }
      aima_stats:
        | {
            Args: { p_tenant_id: string; p_window?: string }
            Returns: {
              cold_email_enabled: boolean
              demos_booked: number
              emails_opened: number
              emails_replied: number
              emails_sent: number
              in_sandra_queue: number
              last_scrape_at: string
              leads_sourced: number
              scraper_enabled: boolean
              window_start: string
            }[]
          }
        | {
            Args: { p_window?: string }
            Returns: {
              cold_email_enabled: boolean
              demos_booked: number
              emails_opened: number
              emails_replied: number
              emails_sent: number
              in_sandra_queue: number
              last_scrape_at: string
              leads_sourced: number
              scraper_enabled: boolean
              window_start: string
            }[]
          }
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
      ccavai_stats: {
        Args: { p_window?: string }
        Returns: {
          approved: number
          drafts_generated: number
          last_run_at: string
          pending_review: number
          posted: number
          rejected: number
          window_start: string
        }[]
      }
      credit_topup: {
        Args: {
          p_bonus_credits?: number
          p_metadata?: Json
          p_paid_cents: number
          p_stripe_pi_id?: string
          p_tenant_id: string
        }
        Returns: {
          credits_added: number
          new_balance: number
          was_idempotent: boolean
        }[]
      }
      debit_credits: {
        Args: {
          p_action_key: string
          p_metadata?: Json
          p_reference_id?: string
          p_tenant_id: string
          p_units?: number
        }
        Returns: {
          balance_after: number
          credits_debited: number
          ok: boolean
          reason: string
        }[]
      }
      debit_credits_as_user: {
        Args: {
          p_action_key: string
          p_actor_user_id: string
          p_metadata?: Json
          p_reference_id?: string
          p_tenant_id: string
          p_units?: number
        }
        Returns: {
          balance_after: number
          budget_remaining: number
          credits_debited: number
          ok: boolean
          reason: string
        }[]
      }
      grant_lifetime_access: {
        Args: {
          p_paid_cents?: number
          p_stripe_pi?: string
          p_tenant_id: string
        }
        Returns: {
          founding_number: number
          ok: boolean
          was_already: boolean
        }[]
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
      platform_action_breakdown: {
        Args: { p_window?: string }
        Returns: {
          action_key: string
          cost_micros: number
          margin_micros: number
          margin_pct: number
          revenue_credits: number
          unique_tenants: number
          units: number
        }[]
      }
      platform_daily_timeseries: {
        Args: { p_days?: number }
        Returns: {
          cost_micros: number
          day: string
          margin_micros: number
          revenue_cents: number
          usage_credits: number
        }[]
      }
      platform_pnl: {
        Args: { p_window?: string }
        Returns: {
          active_tenants: number
          cost_micros: number
          margin_micros: number
          margin_pct: number
          revenue_micros: number
          tenants_at_zero: number
          tenants_low_balance: number
          topup_cents: number
          total_tenants: number
          usage_credits: number
          window_start: string
        }[]
      }
      release_credits: {
        Args: {
          p_action_key: string
          p_reservation_id: string
          p_tenant_id: string
          p_units?: number
        }
        Returns: {
          balance_after: number
          credits_charged: number
          ok: boolean
          reason: string
        }[]
      }
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
      reserve_credits: {
        Args: {
          p_action_key: string
          p_reference_id?: string
          p_tenant_id: string
          p_units?: number
        }
        Returns: {
          balance_after: number
          ok: boolean
          reason: string
          reservation_id: string
          reserved_after: number
        }[]
      }
      reset_due_budgets: { Args: never; Returns: number }
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
      tenant_balance: {
        Args: { p_tenant_id: string }
        Returns: {
          available_credits: number
          balance_credits: number
          is_low: boolean
          is_zero: boolean
          lifetime_spent_credits: number
          lifetime_topped_up_cents: number
          low_balance_threshold: number
          out_of_credits_at: string
          reserved_credits: number
        }[]
      }
      tenant_pnl_summary: {
        Args: { p_window?: string }
        Returns: {
          balance_credits: number
          cost_micros: number
          last_activity_at: string
          margin_micros: number
          margin_pct: number
          name: string
          revenue_cents: number
          slug: string
          status: string
          tenant_id: string
          usage_credits: number
        }[]
      }
      vira_clip_duration_seconds: {
        Args: { c: Database["public"]["Tables"]["vira_clips"]["Row"] }
        Returns: number
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
