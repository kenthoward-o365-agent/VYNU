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
      ai_model_prices: {
        Row: {
          input_per_1k_usd: number
          model: string
          notes: string | null
          output_per_1k_usd: number
          updated_at: string
        }
        Insert: {
          input_per_1k_usd?: number
          model: string
          notes?: string | null
          output_per_1k_usd?: number
          updated_at?: string
        }
        Update: {
          input_per_1k_usd?: number
          model?: string
          notes?: string | null
          output_per_1k_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          completion_tokens: number
          cost_usd: number
          created_at: string
          feature: string
          id: string
          meta: Json | null
          model: string
          order_id: string | null
          prompt_tokens: number
          request_id: string | null
          session_id: string | null
          total_tokens: number | null
          venue_id: string
        }
        Insert: {
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          feature: string
          id?: string
          meta?: Json | null
          model: string
          order_id?: string | null
          prompt_tokens?: number
          request_id?: string | null
          session_id?: string | null
          total_tokens?: number | null
          venue_id: string
        }
        Update: {
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          feature?: string
          id?: string
          meta?: Json | null
          model?: string
          order_id?: string | null
          prompt_tokens?: number
          request_id?: string | null
          session_id?: string | null
          total_tokens?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      api_idempotency: {
        Row: {
          created_at: string
          key: string
          partner_id: string
          request_hash: string
          response_body: Json | null
          response_status: number
        }
        Insert: {
          created_at?: string
          key: string
          partner_id: string
          request_hash: string
          response_body?: Json | null
          response_status: number
        }
        Update: {
          created_at?: string
          key?: string
          partner_id?: string
          request_hash?: string
          response_body?: Json | null
          response_status?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_idempotency_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "api_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          label: string | null
          last_used_at: string | null
          partner_id: string
          revoked_at: string | null
          scopes: string[]
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          label?: string | null
          last_used_at?: string | null
          partner_id: string
          revoked_at?: string | null
          scopes?: string[]
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string | null
          last_used_at?: string | null
          partner_id?: string
          revoked_at?: string | null
          scopes?: string[]
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "api_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      api_partners: {
        Row: {
          contact_email: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          partner_type: Database["public"]["Enums"]["api_partner_type"]
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          partner_type: Database["public"]["Enums"]["api_partner_type"]
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          partner_type?: Database["public"]["Enums"]["api_partner_type"]
          updated_at?: string
        }
        Relationships: []
      }
      api_request_log: {
        Row: {
          api_key_id: string | null
          created_at: string
          id: string
          latency_ms: number | null
          method: string
          partner_id: string | null
          path: string
          request_id: string | null
          status_code: number
          venue_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          method: string
          partner_id?: string | null
          path: string
          request_id?: string | null
          status_code: number
          venue_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          method?: string
          partner_id?: string | null
          path?: string
          request_id?: string | null
          status_code?: number
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_request_log_api_key_id_fkey1"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_request_log_partner_id_fkey1"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "api_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_request_log_venue_id_fkey1"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_log_legacy: {
        Row: {
          api_key_id: string | null
          created_at: string
          id: string
          latency_ms: number | null
          method: string
          partner_id: string | null
          path: string
          request_id: string | null
          status_code: number
          venue_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          method: string
          partner_id?: string | null
          path: string
          request_id?: string | null
          status_code: number
          venue_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          method?: string
          partner_id?: string | null
          path?: string
          request_id?: string | null
          status_code?: number
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_request_log_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_request_log_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "api_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_request_log_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_log_y2026m05: {
        Row: {
          api_key_id: string | null
          created_at: string
          id: string
          latency_ms: number | null
          method: string
          partner_id: string | null
          path: string
          request_id: string | null
          status_code: number
          venue_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          method: string
          partner_id?: string | null
          path: string
          request_id?: string | null
          status_code: number
          venue_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          method?: string
          partner_id?: string | null
          path?: string
          request_id?: string | null
          status_code?: number
          venue_id?: string | null
        }
        Relationships: []
      }
      api_request_log_y2026m06: {
        Row: {
          api_key_id: string | null
          created_at: string
          id: string
          latency_ms: number | null
          method: string
          partner_id: string | null
          path: string
          request_id: string | null
          status_code: number
          venue_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          method: string
          partner_id?: string | null
          path: string
          request_id?: string | null
          status_code: number
          venue_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          method?: string
          partner_id?: string | null
          path?: string
          request_id?: string | null
          status_code?: number
          venue_id?: string | null
        }
        Relationships: []
      }
      api_request_log_y2026m07: {
        Row: {
          api_key_id: string | null
          created_at: string
          id: string
          latency_ms: number | null
          method: string
          partner_id: string | null
          path: string
          request_id: string | null
          status_code: number
          venue_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          method: string
          partner_id?: string | null
          path: string
          request_id?: string | null
          status_code: number
          venue_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          method?: string
          partner_id?: string | null
          path?: string
          request_id?: string | null
          status_code?: number
          venue_id?: string | null
        }
        Relationships: []
      }
      api_request_log_y2026m08: {
        Row: {
          api_key_id: string | null
          created_at: string
          id: string
          latency_ms: number | null
          method: string
          partner_id: string | null
          path: string
          request_id: string | null
          status_code: number
          venue_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          method: string
          partner_id?: string | null
          path: string
          request_id?: string | null
          status_code: number
          venue_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          method?: string
          partner_id?: string | null
          path?: string
          request_id?: string | null
          status_code?: number
          venue_id?: string | null
        }
        Relationships: []
      }
      api_webhook_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          delivered_at: string | null
          event_type: string
          id: string
          next_retry_at: string | null
          payload: Json
          response_body: string | null
          response_status: number | null
          webhook_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          event_type: string
          id?: string
          next_retry_at?: string | null
          payload: Json
          response_body?: string | null
          response_status?: number | null
          webhook_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          event_type?: string
          id?: string
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "api_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      api_webhooks: {
        Row: {
          created_at: string
          events: string[]
          id: string
          is_active: boolean
          last_delivery_at: string | null
          last_delivery_status: number | null
          partner_id: string
          secret: string
          updated_at: string
          url: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          last_delivery_status?: number | null
          partner_id: string
          secret: string
          updated_at?: string
          url: string
          venue_id: string
        }
        Update: {
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          last_delivery_status?: number | null
          partner_id?: string
          secret?: string
          updated_at?: string
          url?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_webhooks_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "api_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_webhooks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_dunning_schedules: {
        Row: {
          auto_suspend: boolean
          created_at: string
          escalate_email: boolean
          grace_period_days: number
          id: string
          in_app_alert: boolean
          is_default: boolean
          mark_uncollectible: boolean
          max_attempts: number
          name: string
          retry_days: number[]
          suspend_after_attempts: number | null
          uncollectible_after_attempts: number
          updated_at: string
        }
        Insert: {
          auto_suspend?: boolean
          created_at?: string
          escalate_email?: boolean
          grace_period_days?: number
          id?: string
          in_app_alert?: boolean
          is_default?: boolean
          mark_uncollectible?: boolean
          max_attempts?: number
          name: string
          retry_days?: number[]
          suspend_after_attempts?: number | null
          uncollectible_after_attempts?: number
          updated_at?: string
        }
        Update: {
          auto_suspend?: boolean
          created_at?: string
          escalate_email?: boolean
          grace_period_days?: number
          id?: string
          in_app_alert?: boolean
          is_default?: boolean
          mark_uncollectible?: boolean
          max_attempts?: number
          name?: string
          retry_days?: number[]
          suspend_after_attempts?: number | null
          uncollectible_after_attempts?: number
          updated_at?: string
        }
        Relationships: []
      }
      ar_onboarding_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          methods_allowed: string[]
          token_hash: string
          used_at: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          methods_allowed?: string[]
          token_hash: string
          used_at?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          methods_allowed?: string[]
          token_hash?: string
          used_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ar_onboarding_tokens_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages_log: {
        Row: {
          content: string
          created_at: string
          had_items_added: boolean
          id: string
          role: string
          session_id: string
          venue_id: string
        }
        Insert: {
          content: string
          created_at?: string
          had_items_added?: boolean
          id?: string
          role?: string
          session_id: string
          venue_id: string
        }
        Update: {
          content?: string
          created_at?: string
          had_items_added?: boolean
          id?: string
          role?: string
          session_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_log_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          converted_to_order: boolean
          diner_id: string | null
          ended_at: string | null
          id: string
          items_added: number
          message_count: number
          started_at: string
          table_id: string | null
          venue_id: string
        }
        Insert: {
          converted_to_order?: boolean
          diner_id?: string | null
          ended_at?: string | null
          id?: string
          items_added?: number
          message_count?: number
          started_at?: string
          table_id?: string | null
          venue_id: string
        }
        Update: {
          converted_to_order?: boolean
          diner_id?: string | null
          ended_at?: string | null
          id?: string
          items_added?: number
          message_count?: number
          started_at?: string
          table_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_diner_id_fkey"
            columns: ["diner_id"]
            isOneToOne: false
            referencedRelation: "diner_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      diner_profiles: {
        Row: {
          allergens: string[] | null
          birthday: string | null
          country_code: string | null
          created_at: string
          display_name: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          preferences: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allergens?: string[] | null
          birthday?: string | null
          country_code?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          preferences?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allergens?: string[] | null
          birthday?: string | null
          country_code?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          preferences?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      diner_stored_cards: {
        Row: {
          card_brand: string | null
          card_summary: string | null
          created_at: string
          diner_id: string
          expiry_month: string | null
          expiry_year: string | null
          id: string
          is_default: boolean
          provider: string
          shopper_reference: string
          token_reference: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          card_brand?: string | null
          card_summary?: string | null
          created_at?: string
          diner_id: string
          expiry_month?: string | null
          expiry_year?: string | null
          id?: string
          is_default?: boolean
          provider?: string
          shopper_reference: string
          token_reference: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          card_brand?: string | null
          card_summary?: string | null
          created_at?: string
          diner_id?: string
          expiry_month?: string | null
          expiry_year?: string | null
          id?: string
          is_default?: boolean
          provider?: string
          shopper_reference?: string
          token_reference?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diner_stored_cards_diner_id_fkey"
            columns: ["diner_id"]
            isOneToOne: false
            referencedRelation: "diner_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diner_stored_cards_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      diner_visits: {
        Row: {
          diner_id: string
          id: string
          order_id: string | null
          points_awarded: number | null
          spend_excl_tax: number | null
          venue_id: string
          visited_at: string
        }
        Insert: {
          diner_id: string
          id?: string
          order_id?: string | null
          points_awarded?: number | null
          spend_excl_tax?: number | null
          venue_id: string
          visited_at?: string
        }
        Update: {
          diner_id?: string
          id?: string
          order_id?: string | null
          points_awarded?: number | null
          spend_excl_tax?: number | null
          venue_id?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diner_visits_diner_id_fkey"
            columns: ["diner_id"]
            isOneToOne: false
            referencedRelation: "diner_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diner_visits_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diner_visits_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      diner_web_sessions: {
        Row: {
          cart_value_peak_cents: number
          diner_id: string | null
          end_reason: string | null
          ended_at: string | null
          first_add_to_cart_at: string | null
          id: string
          items_added_count: number
          last_activity_at: string
          order_id: string | null
          order_placed_at: string | null
          reached_checkout_at: string | null
          session_mode: string | null
          started_at: string
          table_id: string | null
          user_agent: string | null
          venue_id: string
        }
        Insert: {
          cart_value_peak_cents?: number
          diner_id?: string | null
          end_reason?: string | null
          ended_at?: string | null
          first_add_to_cart_at?: string | null
          id?: string
          items_added_count?: number
          last_activity_at?: string
          order_id?: string | null
          order_placed_at?: string | null
          reached_checkout_at?: string | null
          session_mode?: string | null
          started_at?: string
          table_id?: string | null
          user_agent?: string | null
          venue_id: string
        }
        Update: {
          cart_value_peak_cents?: number
          diner_id?: string | null
          end_reason?: string | null
          ended_at?: string | null
          first_add_to_cart_at?: string | null
          id?: string
          items_added_count?: number
          last_activity_at?: string
          order_id?: string | null
          order_placed_at?: string | null
          reached_checkout_at?: string | null
          session_mode?: string | null
          started_at?: string
          table_id?: string | null
          user_agent?: string | null
          venue_id?: string
        }
        Relationships: []
      }
      display_terminal_areas: {
        Row: {
          created_at: string
          display_area_id: string
          terminal_id: string
        }
        Insert: {
          created_at?: string
          display_area_id: string
          terminal_id: string
        }
        Update: {
          created_at?: string
          display_area_id?: string
          terminal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "display_terminal_areas_display_area_id_fkey"
            columns: ["display_area_id"]
            isOneToOne: false
            referencedRelation: "venue_display_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "display_terminal_areas_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "display_terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      display_terminals: {
        Row: {
          created_at: string
          device_token: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          name: string
          paired_at: string | null
          paired_by: string | null
          pairing_code: string | null
          pairing_code_expires_at: string | null
          updated_at: string
          user_agent: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          device_token?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          name: string
          paired_at?: string | null
          paired_by?: string | null
          pairing_code?: string | null
          pairing_code_expires_at?: string | null
          updated_at?: string
          user_agent?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          device_token?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          name?: string
          paired_at?: string | null
          paired_by?: string | null
          pairing_code?: string | null
          pairing_code_expires_at?: string | null
          updated_at?: string
          user_agent?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "display_terminals_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      job_run_log: {
        Row: {
          attempt: number | null
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          msg_id: number | null
          payload: Json | null
          queue: string
          status: string
        }
        Insert: {
          attempt?: number | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          msg_id?: number | null
          payload?: Json | null
          queue: string
          status: string
        }
        Update: {
          attempt?: number | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          msg_id?: number | null
          payload?: Json | null
          queue?: string
          status?: string
        }
        Relationships: []
      }
      loyalty_balances: {
        Row: {
          balance: number
          created_at: string
          diner_id: string
          id: string
          program_id: string
          tier: string | null
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          diner_id: string
          id?: string
          program_id: string
          tier?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          diner_id?: string
          id?: string
          program_id?: string
          tier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_balances_diner_id_fkey"
            columns: ["diner_id"]
            isOneToOne: false
            referencedRelation: "diner_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_balances_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_program_venue_optouts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          program_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          program_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          program_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_program_venue_optouts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_program_venue_optouts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_programs: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          is_active: boolean | null
          is_ordrup_builtin: boolean
          name: string
          program_type: Database["public"]["Enums"]["loyalty_program_type"]
          rules: Json | null
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          is_ordrup_builtin?: boolean
          name: string
          program_type?: Database["public"]["Enums"]["loyalty_program_type"]
          rules?: Json | null
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          is_ordrup_builtin?: boolean
          name?: string
          program_type?: Database["public"]["Enums"]["loyalty_program_type"]
          rules?: Json | null
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_programs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "venue_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_programs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rewards_issued: {
        Row: {
          created_at: string
          diner_id: string
          id: string
          idempotency_key: string | null
          issued_at: string
          program_id: string
          redeemed_at: string | null
          redeemed_order_id: string | null
          reward_kind: string
          reward_payload: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          diner_id: string
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          program_id: string
          redeemed_at?: string | null
          redeemed_order_id?: string | null
          reward_kind: string
          reward_payload?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          diner_id?: string
          id?: string
          idempotency_key?: string | null
          issued_at?: string
          program_id?: string
          redeemed_at?: string | null
          redeemed_order_id?: string | null
          reward_kind?: string
          reward_payload?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_issued_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          pos_id: string | null
          sort_order: number | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          pos_id?: string | null
          sort_order?: number | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          pos_id?: string | null
          sort_order?: number | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_category_display_areas: {
        Row: {
          category_id: string
          created_at: string
          display_area_id: string
          id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          display_area_id: string
          id?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          display_area_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_category_display_areas_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_category_display_areas_display_area_id_fkey"
            columns: ["display_area_id"]
            isOneToOne: false
            referencedRelation: "venue_display_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_display_areas: {
        Row: {
          created_at: string
          display_area_id: string
          id: string
          menu_item_id: string
        }
        Insert: {
          created_at?: string
          display_area_id: string
          id?: string
          menu_item_id: string
        }
        Update: {
          created_at?: string
          display_area_id?: string
          id?: string
          menu_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_display_areas_display_area_id_fkey"
            columns: ["display_area_id"]
            isOneToOne: false
            referencedRelation: "venue_display_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_display_areas_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_modifiers: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_required: boolean
          menu_item_id: string
          modifier_category_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_required?: boolean
          menu_item_id: string
          modifier_category_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_required?: boolean
          menu_item_id?: string
          modifier_category_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_modifiers_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifiers_modifier_category_id_fkey"
            columns: ["modifier_category_id"]
            isOneToOne: false
            referencedRelation: "modifier_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_time_frames: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          time_frame_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id: string
          time_frame_id: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          time_frame_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_time_frames_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_time_frames_time_frame_id_fkey"
            columns: ["time_frame_id"]
            isOneToOne: false
            referencedRelation: "menu_time_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          allergens: string[] | null
          category_id: string | null
          created_at: string
          description: string | null
          dietary_tags: string[] | null
          display_order: number | null
          food_cost: number | null
          id: string
          image_ai_status: string | null
          image_url: string | null
          is_available: boolean | null
          name: string
          plu: string | null
          pos_allergens: number[] | null
          pos_id: string | null
          pos_tags: string[] | null
          prep_time_minutes: number | null
          price: number
          snooze_until: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          allergens?: string[] | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          dietary_tags?: string[] | null
          display_order?: number | null
          food_cost?: number | null
          id?: string
          image_ai_status?: string | null
          image_url?: string | null
          is_available?: boolean | null
          name: string
          plu?: string | null
          pos_allergens?: number[] | null
          pos_id?: string | null
          pos_tags?: string[] | null
          prep_time_minutes?: number | null
          price: number
          snooze_until?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          allergens?: string[] | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          dietary_tags?: string[] | null
          display_order?: number | null
          food_cost?: number | null
          id?: string
          image_ai_status?: string | null
          image_url?: string | null
          is_available?: boolean | null
          name?: string
          plu?: string | null
          pos_allergens?: number[] | null
          pos_id?: string | null
          pos_tags?: string[] | null
          prep_time_minutes?: number | null
          price?: number
          snooze_until?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_time_frames: {
        Row: {
          created_at: string
          days_of_week: number[]
          display_order: number
          end_time: string
          id: string
          is_active: boolean
          name: string
          start_time: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[]
          display_order?: number
          end_time: string
          id?: string
          is_active?: boolean
          name: string
          start_time: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[]
          display_order?: number
          end_time?: string
          id?: string
          is_active?: boolean
          name?: string
          start_time?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_time_frames_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_categories: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean | null
          max_selection: number
          min_selection: number
          name: string
          pos_id: string | null
          selection_type: string
          show_on_receipt_when_free: boolean
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          max_selection?: number
          min_selection?: number
          name: string
          pos_id?: string | null
          selection_type?: string
          show_on_receipt_when_free?: boolean
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          max_selection?: number
          min_selection?: number
          name?: string
          pos_id?: string | null
          selection_type?: string
          show_on_receipt_when_free?: boolean
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_categories_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      modifiers: {
        Row: {
          category_id: string
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          plu: string | null
          pos_id: string | null
          price: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          plu?: string | null
          pos_id?: string | null
          price?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          plu?: string | null
          pos_id?: string | null
          price?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifiers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "modifier_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifiers_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          diner_id: string | null
          id: string
          kind: string
          payload: Json | null
          read_at: string | null
          title: string
          user_id: string | null
          venue_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          diner_id?: string | null
          id?: string
          kind: string
          payload?: Json | null
          read_at?: string | null
          title: string
          user_id?: string | null
          venue_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          diner_id?: string | null
          id?: string
          kind?: string
          payload?: Json | null
          read_at?: string | null
          title?: string
          user_id?: string | null
          venue_id?: string | null
        }
        Relationships: []
      }
      onboarding_chat_messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          role: string
          user_id: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parts: Json
          role: string
          user_id?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          user_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_chat_messages_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_test_runs: {
        Row: {
          id: string
          passed: boolean
          ran_at: string
          steps: Json
          venue_id: string
        }
        Insert: {
          id?: string
          passed?: boolean
          ran_at?: string
          steps: Json
          venue_id: string
        }
        Update: {
          id?: string
          passed?: boolean
          ran_at?: string
          steps?: Json
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_test_runs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          ai_session_id: string | null
          ai_source: string | null
          created_at: string
          id: string
          menu_item_id: string
          modifiers: Json | null
          notes: string | null
          order_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          ai_session_id?: string | null
          ai_source?: string | null
          created_at?: string
          id?: string
          menu_item_id: string
          modifiers?: Json | null
          notes?: string | null
          order_id: string
          quantity?: number
          unit_price: number
        }
        Update: {
          ai_session_id?: string | null
          ai_source?: string | null
          created_at?: string
          id?: string
          menu_item_id?: string
          modifiers?: Json | null
          notes?: string | null
          order_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_refunds: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          order_id: string
          psp_reference: string | null
          reason: string | null
          requested_by: string | null
          status: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          order_id: string
          psp_reference?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          order_id?: string
          psp_reference?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refunds_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_throttle_log: {
        Row: {
          created_at: string
          display_area_id: string
          event: string
          id: string
          order_id: string
          queue_size_at_event: number
          venue_id: string
          wait_added_minutes: number
        }
        Insert: {
          created_at?: string
          display_area_id: string
          event: string
          id?: string
          order_id: string
          queue_size_at_event?: number
          venue_id: string
          wait_added_minutes?: number
        }
        Update: {
          created_at?: string
          display_area_id?: string
          event?: string
          id?: string
          order_id?: string
          queue_size_at_event?: number
          venue_id?: string
          wait_added_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_throttle_log_display_area_id_fkey"
            columns: ["display_area_id"]
            isOneToOne: false
            referencedRelation: "venue_display_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_throttle_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_throttle_log_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          audit_date: string | null
          created_at: string
          customer_id: string | null
          customer_notes: string | null
          extra_wait_minutes: number
          fired_at: string | null
          gratuity_amount: number
          id: string
          payment_is_mock: boolean
          payment_psp_reference: string | null
          pos_order_id: string | null
          pos_push_error: string | null
          pos_push_status: string | null
          pos_pushed_at: string | null
          session_id: string | null
          session_mode: string | null
          status: Database["public"]["Enums"]["order_status"]
          table_id: string | null
          throttled_until: string | null
          total: number | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          audit_date?: string | null
          created_at?: string
          customer_id?: string | null
          customer_notes?: string | null
          extra_wait_minutes?: number
          fired_at?: string | null
          gratuity_amount?: number
          id?: string
          payment_is_mock?: boolean
          payment_psp_reference?: string | null
          pos_order_id?: string | null
          pos_push_error?: string | null
          pos_push_status?: string | null
          pos_pushed_at?: string | null
          session_id?: string | null
          session_mode?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          throttled_until?: string | null
          total?: number | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          audit_date?: string | null
          created_at?: string
          customer_id?: string | null
          customer_notes?: string | null
          extra_wait_minutes?: number
          fired_at?: string | null
          gratuity_amount?: number
          id?: string
          payment_is_mock?: boolean
          payment_psp_reference?: string | null
          pos_order_id?: string | null
          pos_push_error?: string | null
          pos_push_status?: string | null
          pos_pushed_at?: string | null
          session_id?: string | null
          session_mode?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          throttled_until?: string | null
          total?: number | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_config_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          field: string
          id: string
          ip: string | null
          new_value: string | null
          old_value: string | null
          user_agent: string | null
          venue_id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          field: string
          id?: string
          ip?: string | null
          new_value?: string | null
          old_value?: string | null
          user_agent?: string | null
          venue_id: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          field?: string
          id?: string
          ip?: string | null
          new_value?: string | null
          old_value?: string | null
          user_agent?: string | null
          venue_id?: string
        }
        Relationships: []
      }
      pci_script_baseline: {
        Row: {
          alert_sent_at: string | null
          first_seen_at: string
          id: string
          integrity_hash: string
          is_authorised: boolean
          justification: string | null
          last_seen_at: string
          script_src: string
          url: string
        }
        Insert: {
          alert_sent_at?: string | null
          first_seen_at?: string
          id?: string
          integrity_hash: string
          is_authorised?: boolean
          justification?: string | null
          last_seen_at?: string
          script_src: string
          url: string
        }
        Update: {
          alert_sent_at?: string | null
          first_seen_at?: string
          id?: string
          integrity_hash?: string
          is_authorised?: boolean
          justification?: string | null
          last_seen_at?: string
          script_src?: string
          url?: string
        }
        Relationships: []
      }
      pos_menu_change_queue: {
        Row: {
          change_kind: string
          created_at: string
          error: string | null
          id: string
          menu_item_id: string | null
          payload: Json
          pos_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sent_at: string | null
          status: string
          venue_id: string
        }
        Insert: {
          change_kind: string
          created_at?: string
          error?: string | null
          id?: string
          menu_item_id?: string | null
          payload?: Json
          pos_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_at?: string | null
          status?: string
          venue_id: string
        }
        Update: {
          change_kind?: string
          created_at?: string
          error?: string | null
          id?: string
          menu_item_id?: string | null
          payload?: Json
          pos_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_at?: string | null
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_menu_change_queue_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_providers: {
        Row: {
          auth_type: string
          capabilities: Json
          config_schema: Json
          created_at: string
          docs_url: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          status: string
          updated_at: string
          webhook_url_template: string | null
        }
        Insert: {
          auth_type: string
          capabilities?: Json
          config_schema?: Json
          created_at?: string
          docs_url?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          status?: string
          updated_at?: string
          webhook_url_template?: string | null
        }
        Update: {
          auth_type?: string
          capabilities?: Json
          config_schema?: Json
          created_at?: string
          docs_url?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          status?: string
          updated_at?: string
          webhook_url_template?: string | null
        }
        Relationships: []
      }
      pos_sync_log: {
        Row: {
          created_at: string
          direction: string
          error_message: string | null
          event_type: string
          id: string
          items_synced: number | null
          payload_hash: string | null
          result: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          direction?: string
          error_message?: string | null
          event_type: string
          id?: string
          items_synced?: number | null
          payload_hash?: string | null
          result?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          error_message?: string | null
          event_type?: string
          id?: string
          items_synced?: number | null
          payload_hash?: string | null
          result?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sync_log_venue_id_fkey1"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sync_log_legacy: {
        Row: {
          created_at: string
          direction: string
          error_message: string | null
          event_type: string
          id: string
          items_synced: number | null
          payload_hash: string | null
          result: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          direction?: string
          error_message?: string | null
          event_type: string
          id?: string
          items_synced?: number | null
          payload_hash?: string | null
          result?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          error_message?: string | null
          event_type?: string
          id?: string
          items_synced?: number | null
          payload_hash?: string | null
          result?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sync_log_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sync_log_y2026m05: {
        Row: {
          created_at: string
          direction: string
          error_message: string | null
          event_type: string
          id: string
          items_synced: number | null
          payload_hash: string | null
          result: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          direction?: string
          error_message?: string | null
          event_type: string
          id?: string
          items_synced?: number | null
          payload_hash?: string | null
          result?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          error_message?: string | null
          event_type?: string
          id?: string
          items_synced?: number | null
          payload_hash?: string | null
          result?: string
          venue_id?: string
        }
        Relationships: []
      }
      pos_sync_log_y2026m06: {
        Row: {
          created_at: string
          direction: string
          error_message: string | null
          event_type: string
          id: string
          items_synced: number | null
          payload_hash: string | null
          result: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          direction?: string
          error_message?: string | null
          event_type: string
          id?: string
          items_synced?: number | null
          payload_hash?: string | null
          result?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          error_message?: string | null
          event_type?: string
          id?: string
          items_synced?: number | null
          payload_hash?: string | null
          result?: string
          venue_id?: string
        }
        Relationships: []
      }
      pos_sync_log_y2026m07: {
        Row: {
          created_at: string
          direction: string
          error_message: string | null
          event_type: string
          id: string
          items_synced: number | null
          payload_hash: string | null
          result: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          direction?: string
          error_message?: string | null
          event_type: string
          id?: string
          items_synced?: number | null
          payload_hash?: string | null
          result?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          error_message?: string | null
          event_type?: string
          id?: string
          items_synced?: number | null
          payload_hash?: string | null
          result?: string
          venue_id?: string
        }
        Relationships: []
      }
      pos_sync_log_y2026m08: {
        Row: {
          created_at: string
          direction: string
          error_message: string | null
          event_type: string
          id: string
          items_synced: number | null
          payload_hash: string | null
          result: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          direction?: string
          error_message?: string | null
          event_type: string
          id?: string
          items_synced?: number | null
          payload_hash?: string | null
          result?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          error_message?: string | null
          event_type?: string
          id?: string
          items_synced?: number | null
          payload_hash?: string | null
          result?: string
          venue_id?: string
        }
        Relationships: []
      }
      pos_webhook_events: {
        Row: {
          event_id: string
          id: string
          process_error: string | null
          processed_at: string | null
          provider_slug: string
          raw: Json
          received_at: string
          signature_valid: boolean
          topic: string | null
          venue_id: string
        }
        Insert: {
          event_id: string
          id?: string
          process_error?: string | null
          processed_at?: string | null
          provider_slug: string
          raw?: Json
          received_at?: string
          signature_valid: boolean
          topic?: string | null
          venue_id: string
        }
        Update: {
          event_id?: string
          id?: string
          process_error?: string | null
          processed_at?: string | null
          provider_slug?: string
          raw?: Json
          received_at?: string
          signature_valid?: boolean
          topic?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_webhook_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rule_items: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          pricing_rule_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id: string
          pricing_rule_id: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          pricing_rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rule_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rule_items_pricing_rule_id_fkey"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rule_types: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          label: string
          name: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label: string
          name: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string
          name?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rule_types_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          created_at: string
          days_of_week: number[] | null
          end_date: string | null
          end_time: string | null
          id: string
          is_active: boolean | null
          modifier_percent: number
          modifier_type: string
          modifier_value: number
          name: string
          rule_type: string
          start_date: string | null
          start_time: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[] | null
          end_date?: string | null
          end_time?: string | null
          id?: string
          is_active?: boolean | null
          modifier_percent?: number
          modifier_type?: string
          modifier_value?: number
          name: string
          rule_type: string
          start_date?: string | null
          start_time?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[] | null
          end_date?: string | null
          end_time?: string | null
          id?: string
          is_active?: boolean | null
          modifier_percent?: number
          modifier_type?: string
          modifier_value?: number
          name?: string
          rule_type?: string
          start_date?: string | null
          start_time?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_stripe_events: {
        Row: {
          event_type: string
          id: string
          processed_at: string
          stripe_event_id: string
        }
        Insert: {
          event_type: string
          id?: string
          processed_at?: string
          stripe_event_id: string
        }
        Update: {
          event_type?: string
          id?: string
          processed_at?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
      staff_alerts: {
        Row: {
          alert_type: Database["public"]["Enums"]["alert_type"]
          created_at: string
          diner_id: string | null
          id: string
          message: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["alert_status"]
          table_id: string | null
          venue_id: string
        }
        Insert: {
          alert_type?: Database["public"]["Enums"]["alert_type"]
          created_at?: string
          diner_id?: string | null
          id?: string
          message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["alert_status"]
          table_id?: string | null
          venue_id: string
        }
        Update: {
          alert_type?: Database["public"]["Enums"]["alert_type"]
          created_at?: string
          diner_id?: string | null
          id?: string
          message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["alert_status"]
          table_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_alerts_diner_id_fkey"
            columns: ["diner_id"]
            isOneToOne: false
            referencedRelation: "diner_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_alerts_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_alerts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sessions: {
        Row: {
          auto_close_at: string
          closed_at: string | null
          created_at: string
          diner_count: number
          display_name: string | null
          fire_strategy: string
          fired_at: string | null
          fired_by: string | null
          host_diner_id: string | null
          id: string
          is_discoverable: boolean
          opened_at: string
          status: string
          table_id: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          auto_close_at?: string
          closed_at?: string | null
          created_at?: string
          diner_count?: number
          display_name?: string | null
          fire_strategy?: string
          fired_at?: string | null
          fired_by?: string | null
          host_diner_id?: string | null
          id?: string
          is_discoverable?: boolean
          opened_at?: string
          status?: string
          table_id: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          auto_close_at?: string
          closed_at?: string | null
          created_at?: string
          diner_count?: number
          display_name?: string | null
          fire_strategy?: string
          fired_at?: string | null
          fired_by?: string | null
          host_diner_id?: string | null
          id?: string
          is_discoverable?: boolean
          opened_at?: string
          status?: string
          table_id?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_sessions_host_diner_id_fkey"
            columns: ["host_diner_id"]
            isOneToOne: false
            referencedRelation: "diner_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          capacity: number | null
          created_at: string
          id: string
          pos_table_id: string | null
          qr_code: string | null
          status: string | null
          table_number: string
          updated_at: string
          venue_id: string
          zone: string | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          id?: string
          pos_table_id?: string | null
          qr_code?: string | null
          status?: string | null
          table_number: string
          updated_at?: string
          venue_id: string
          zone?: string | null
        }
        Update: {
          capacity?: number | null
          created_at?: string
          id?: string
          pos_table_id?: string | null
          qr_code?: string | null
          status?: string | null
          table_number?: string
          updated_at?: string
          venue_id?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tables_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venue_ai_config: {
        Row: {
          agent_icon_url: string | null
          agent_name: string
          chat_mode: string
          created_at: string
          id: string
          opening_message: string | null
          personality_extras: Json | null
          tone: string
          updated_at: string
          venue_context: string | null
          venue_id: string
        }
        Insert: {
          agent_icon_url?: string | null
          agent_name?: string
          chat_mode?: string
          created_at?: string
          id?: string
          opening_message?: string | null
          personality_extras?: Json | null
          tone?: string
          updated_at?: string
          venue_context?: string | null
          venue_id: string
        }
        Update: {
          agent_icon_url?: string | null
          agent_name?: string
          chat_mode?: string
          created_at?: string
          id?: string
          opening_message?: string | null
          personality_extras?: Json | null
          tone?: string
          updated_at?: string
          venue_context?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_ai_config_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_audit_dates: {
        Row: {
          advanced_at: string | null
          advanced_by: string | null
          audit_date: string
          created_at: string
          id: string
          venue_id: string
        }
        Insert: {
          advanced_at?: string | null
          advanced_by?: string | null
          audit_date?: string
          created_at?: string
          id?: string
          venue_id: string
        }
        Update: {
          advanced_at?: string | null
          advanced_by?: string | null
          audit_date?: string
          created_at?: string
          id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_audit_dates_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_billing_accounts: {
        Row: {
          billing_address: Json | null
          billing_email: string | null
          billing_name: string | null
          created_at: string
          default_payment_method_id: string | null
          id: string
          is_active: boolean
          notes: string | null
          payment_method_type: string
          stripe_customer_id: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          billing_address?: Json | null
          billing_email?: string | null
          billing_name?: string | null
          created_at?: string
          default_payment_method_id?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          payment_method_type?: string
          stripe_customer_id?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          billing_address?: Json | null
          billing_email?: string | null
          billing_name?: string | null
          created_at?: string
          default_payment_method_id?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          payment_method_type?: string
          stripe_customer_id?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_billing_accounts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_billing_config: {
        Row: {
          auto_renew: boolean
          billing_currency: string
          billing_day_of_month: number
          commission_percent: number
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          estimated_annual_gmv: number
          id: string
          inherit_from_group: boolean
          min_monthly_fee: number
          notes: string | null
          notice_period_days: number
          qr_gmv_percent: number
          renewal_term_months: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          auto_renew?: boolean
          billing_currency?: string
          billing_day_of_month?: number
          commission_percent?: number
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          estimated_annual_gmv?: number
          id?: string
          inherit_from_group?: boolean
          min_monthly_fee?: number
          notes?: string | null
          notice_period_days?: number
          qr_gmv_percent?: number
          renewal_term_months?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          auto_renew?: boolean
          billing_currency?: string
          billing_day_of_month?: number
          commission_percent?: number
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          estimated_annual_gmv?: number
          id?: string
          inherit_from_group?: boolean
          min_monthly_fee?: number
          notes?: string | null
          notice_period_days?: number
          qr_gmv_percent?: number
          renewal_term_months?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_billing_config_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_billing_events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          event_type: string
          id: string
          invoice_id: string | null
          metadata: Json | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_type: string
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_type?: string
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_billing_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "venue_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_billing_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_credit_notes: {
        Row: {
          amount: number
          applied_to_ids: string[] | null
          created_at: string
          created_by: string | null
          credit_number: string
          currency: string
          id: string
          invoice_id: string | null
          notes: string | null
          reason: string
          status: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          amount?: number
          applied_to_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          credit_number: string
          currency?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          reason: string
          status?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          amount?: number
          applied_to_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          credit_number?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          reason?: string
          status?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "venue_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_credit_notes_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_dayend_log: {
        Row: {
          audit_date: string
          closed_at: string
          closed_by: string | null
          id: string
          venue_id: string
        }
        Insert: {
          audit_date: string
          closed_at?: string
          closed_by?: string | null
          id?: string
          venue_id: string
        }
        Update: {
          audit_date?: string
          closed_at?: string
          closed_by?: string | null
          id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_dayend_log_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_display_areas: {
        Row: {
          base_prep_time_minutes: number
          color: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          throttle_block_timeout_minutes: number
          throttle_block_until: string | null
          throttle_enabled: boolean
          throttle_max_orders: number
          throttle_mode: string
          throttle_show_wait_to_diner: boolean
          throttle_window_minutes: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          base_prep_time_minutes?: number
          color?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          throttle_block_timeout_minutes?: number
          throttle_block_until?: string | null
          throttle_enabled?: boolean
          throttle_max_orders?: number
          throttle_mode?: string
          throttle_show_wait_to_diner?: boolean
          throttle_window_minutes?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          base_prep_time_minutes?: number
          color?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          throttle_block_timeout_minutes?: number
          throttle_block_until?: string | null
          throttle_enabled?: boolean
          throttle_max_orders?: number
          throttle_mode?: string
          throttle_show_wait_to_diner?: boolean
          throttle_window_minutes?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_display_areas_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_group_staff: {
        Row: {
          created_at: string
          group_id: string
          id: string
          role: Database["public"]["Enums"]["group_staff_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          role?: Database["public"]["Enums"]["group_staff_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          role?: Database["public"]["Enums"]["group_staff_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_group_staff_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "venue_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_groups: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          logo_url: string | null
          name: string
          settings: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          logo_url?: string | null
          name: string
          settings?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          settings?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      venue_invoice_lines: {
        Row: {
          amount: number
          created_at: string
          currency: string
          description: string
          display_order: number
          id: string
          invoice_id: string
          line_type: string
          metadata: Json | null
          quantity: number
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          description: string
          display_order?: number
          id?: string
          invoice_id: string
          line_type: string
          metadata?: Json | null
          quantity?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          description?: string
          display_order?: number
          id?: string
          invoice_id?: string
          line_type?: string
          metadata?: Json | null
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "venue_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_invoice_payments: {
        Row: {
          amount: number
          attempted_at: string
          created_at: string
          failure_code: string | null
          failure_message: string | null
          id: string
          invoice_id: string
          metadata: Json | null
          method_type: string | null
          settled_at: string | null
          status: string
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount?: number
          attempted_at?: string
          created_at?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          invoice_id: string
          metadata?: Json | null
          method_type?: string | null
          settled_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount?: number
          attempted_at?: string
          created_at?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          invoice_id?: string
          metadata?: Json | null
          method_type?: string | null
          settled_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "venue_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_invoices: {
        Row: {
          adjustments: number
          attempt_count: number
          commission_amount: number
          created_at: string
          currency: string
          due_date: string
          id: string
          invoice_number: string
          min_fee_amount: number
          next_retry_at: string | null
          notes: string | null
          paid_at: string | null
          pdf_url: string | null
          period_end: string
          period_start: string
          status: string
          stripe_payment_intent_id: string | null
          subtotal: number
          tax: number
          total: number
          updated_at: string
          venue_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          adjustments?: number
          attempt_count?: number
          commission_amount?: number
          created_at?: string
          currency?: string
          due_date: string
          id?: string
          invoice_number: string
          min_fee_amount?: number
          next_retry_at?: string | null
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          period_end: string
          period_start: string
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          venue_id: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          adjustments?: number
          attempt_count?: number
          commission_amount?: number
          created_at?: string
          currency?: string
          due_date?: string
          id?: string
          invoice_number?: string
          min_fee_amount?: number
          next_retry_at?: string | null
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          venue_id?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_invoices_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_onboarding_state: {
        Row: {
          completed_at: string | null
          created_at: string
          dismissed_at: string | null
          first_dayend_at: string | null
          pos_choice: string | null
          pos_vendor: string | null
          readiness_snapshot: Json | null
          status: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          first_dayend_at?: string | null
          pos_choice?: string | null
          pos_vendor?: string | null
          readiness_snapshot?: Json | null
          status?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          first_dayend_at?: string | null
          pos_choice?: string | null
          pos_vendor?: string | null
          readiness_snapshot?: Json | null
          status?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_onboarding_state_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_order_statuses: {
        Row: {
          color: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          is_active_display: boolean
          is_default: boolean
          is_terminal: boolean
          label: string
          maps_to_system_status: string | null
          name: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_active_display?: boolean
          is_default?: boolean
          is_terminal?: boolean
          label: string
          maps_to_system_status?: string | null
          name: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_active_display?: boolean
          is_default?: boolean
          is_terminal?: boolean
          label?: string
          maps_to_system_status?: string | null
          name?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_order_statuses_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_payment_config: {
        Row: {
          api_key_live: string | null
          api_key_test: string | null
          apple_pay_merchant_id: string | null
          capture_mode: string
          client_key_live: string | null
          client_key_test: string | null
          country_code: string
          created_at: string
          default_currency: string
          environment: string
          google_pay_merchant_id: string | null
          hmac_key: string | null
          id: string
          is_active: boolean
          merchant_account: string | null
          merchant_id_ordrpay: string | null
          merchant_status: string
          provider: string
          statement_descriptor: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          api_key_live?: string | null
          api_key_test?: string | null
          apple_pay_merchant_id?: string | null
          capture_mode?: string
          client_key_live?: string | null
          client_key_test?: string | null
          country_code?: string
          created_at?: string
          default_currency?: string
          environment?: string
          google_pay_merchant_id?: string | null
          hmac_key?: string | null
          id?: string
          is_active?: boolean
          merchant_account?: string | null
          merchant_id_ordrpay?: string | null
          merchant_status?: string
          provider?: string
          statement_descriptor?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          api_key_live?: string | null
          api_key_test?: string | null
          apple_pay_merchant_id?: string | null
          capture_mode?: string
          client_key_live?: string | null
          client_key_test?: string | null
          country_code?: string
          created_at?: string
          default_currency?: string
          environment?: string
          google_pay_merchant_id?: string | null
          hmac_key?: string | null
          id?: string
          is_active?: boolean
          merchant_account?: string | null
          merchant_id_ordrpay?: string | null
          merchant_status?: string
          provider?: string
          statement_descriptor?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_payment_config_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_payment_methods: {
        Row: {
          bank_name: string | null
          billing_details: Json | null
          brand: string | null
          bsb_last4: string | null
          created_at: string
          exp_month: number | null
          exp_year: number | null
          fingerprint: string | null
          id: string
          is_active: boolean
          is_default: boolean
          last4: string | null
          mandate_accepted_at: string | null
          mandate_id: string | null
          mandate_ip: string | null
          mandate_status: string | null
          routing_last4: string | null
          stripe_payment_method_id: string
          type: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          bank_name?: string | null
          billing_details?: Json | null
          brand?: string | null
          bsb_last4?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          fingerprint?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          last4?: string | null
          mandate_accepted_at?: string | null
          mandate_id?: string | null
          mandate_ip?: string | null
          mandate_status?: string | null
          routing_last4?: string | null
          stripe_payment_method_id: string
          type: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          bank_name?: string | null
          billing_details?: Json | null
          brand?: string | null
          bsb_last4?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          fingerprint?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          last4?: string | null
          mandate_accepted_at?: string | null
          mandate_id?: string | null
          mandate_ip?: string | null
          mandate_status?: string | null
          routing_last4?: string | null
          stripe_payment_method_id?: string
          type?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_payment_methods_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_pos_integrations: {
        Row: {
          account_id: string | null
          api_key_ref: string | null
          auto_push_orders: boolean
          breaker_failures: number
          breaker_opened_at: string | null
          breaker_state: string
          client_id: string | null
          client_secret_ref: string | null
          config: Json | null
          connection_status: string
          created_at: string
          endpoint_url: string | null
          id: string
          last_error: string | null
          last_menu_pull_at: string | null
          last_sync_at: string | null
          last_webhook_at: string | null
          location_id: string | null
          pos_provider: string
          provider_id: string | null
          secrets_map: Json
          sync_pos_to_us: boolean
          sync_status: string
          sync_us_to_pos: boolean
          token_cache: Json | null
          updated_at: string
          venue_id: string
          webhook_secret: string | null
        }
        Insert: {
          account_id?: string | null
          api_key_ref?: string | null
          auto_push_orders?: boolean
          breaker_failures?: number
          breaker_opened_at?: string | null
          breaker_state?: string
          client_id?: string | null
          client_secret_ref?: string | null
          config?: Json | null
          connection_status?: string
          created_at?: string
          endpoint_url?: string | null
          id?: string
          last_error?: string | null
          last_menu_pull_at?: string | null
          last_sync_at?: string | null
          last_webhook_at?: string | null
          location_id?: string | null
          pos_provider: string
          provider_id?: string | null
          secrets_map?: Json
          sync_pos_to_us?: boolean
          sync_status?: string
          sync_us_to_pos?: boolean
          token_cache?: Json | null
          updated_at?: string
          venue_id: string
          webhook_secret?: string | null
        }
        Update: {
          account_id?: string | null
          api_key_ref?: string | null
          auto_push_orders?: boolean
          breaker_failures?: number
          breaker_opened_at?: string | null
          breaker_state?: string
          client_id?: string | null
          client_secret_ref?: string | null
          config?: Json | null
          connection_status?: string
          created_at?: string
          endpoint_url?: string | null
          id?: string
          last_error?: string | null
          last_menu_pull_at?: string | null
          last_sync_at?: string | null
          last_webhook_at?: string | null
          location_id?: string | null
          pos_provider?: string
          provider_id?: string | null
          secrets_map?: Json
          sync_pos_to_us?: boolean
          sync_status?: string
          sync_us_to_pos?: boolean
          token_cache?: Json | null
          updated_at?: string
          venue_id?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_pos_integrations_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "pos_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_pos_integrations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_role_permissions: {
        Row: {
          can_manage_roles: boolean
          can_manage_settings: boolean
          can_reopen_and_refund_orders: boolean
          can_update_order_status: boolean
          created_at: string
          nav_keys: string[]
          role_id: string
          updated_at: string
        }
        Insert: {
          can_manage_roles?: boolean
          can_manage_settings?: boolean
          can_reopen_and_refund_orders?: boolean
          can_update_order_status?: boolean
          created_at?: string
          nav_keys?: string[]
          role_id: string
          updated_at?: string
        }
        Update: {
          can_manage_roles?: boolean
          can_manage_settings?: boolean
          can_reopen_and_refund_orders?: boolean
          can_update_order_status?: boolean
          created_at?: string
          nav_keys?: string[]
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: true
            referencedRelation: "venue_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_roles: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_system: boolean
          name: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_roles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_staff: {
        Row: {
          can_process_refunds: boolean
          can_reopen_closed_orders: boolean
          can_update_order_status: boolean
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean | null
          is_primary: boolean
          role: Database["public"]["Enums"]["venue_staff_role"]
          role_id: string | null
          updated_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          can_process_refunds?: boolean
          can_reopen_closed_orders?: boolean
          can_update_order_status?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean
          role?: Database["public"]["Enums"]["venue_staff_role"]
          role_id?: string | null
          updated_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          can_process_refunds?: boolean
          can_reopen_closed_orders?: boolean
          can_update_order_status?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean
          role?: Database["public"]["Enums"]["venue_staff_role"]
          role_id?: string | null
          updated_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_staff_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "venue_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_staff_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_taxes: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          is_inclusive: boolean
          name: string
          rate: number
          tax_type: Database["public"]["Enums"]["tax_type"]
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_inclusive?: boolean
          name: string
          rate?: number
          tax_type?: Database["public"]["Enums"]["tax_type"]
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_inclusive?: boolean
          name?: string
          rate?: number
          tax_type?: Database["public"]["Enums"]["tax_type"]
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_taxes_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          group_id: string | null
          id: string
          is_active: boolean | null
          is_live: boolean
          landing_page_html: string | null
          logo_url: string | null
          menu_source: string
          name: string
          operating_hours: Json | null
          phone: string | null
          postcode: string | null
          settings: Json | null
          site_id: string
          state: string | null
          subscription_notes: string | null
          subscription_plan: string | null
          subscription_status: string | null
          timezone: string | null
          updated_at: string
          venue_type: string
          went_live_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          is_live?: boolean
          landing_page_html?: string | null
          logo_url?: string | null
          menu_source?: string
          name: string
          operating_hours?: Json | null
          phone?: string | null
          postcode?: string | null
          settings?: Json | null
          site_id?: string
          state?: string | null
          subscription_notes?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          timezone?: string | null
          updated_at?: string
          venue_type?: string
          went_live_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          is_live?: boolean
          landing_page_html?: string | null
          logo_url?: string | null
          menu_source?: string
          name?: string
          operating_hours?: Json | null
          phone?: string | null
          postcode?: string | null
          settings?: Json | null
          site_id?: string
          state?: string | null
          subscription_notes?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          timezone?: string | null
          updated_at?: string
          venue_type?: string
          went_live_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "venue_groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      diner_session_metrics_daily: {
        Row: {
          cart_abandon_rate: number | null
          cart_abandoned: number | null
          checkout_abandon_rate: number | null
          checkout_abandoned: number | null
          conversion_rate: number | null
          day: string | null
          sessions: number | null
          sessions_converted: number | null
          sessions_with_cart: number | null
          sessions_with_checkout: number | null
          venue_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      ack_job: { Args: { _msg_id: number; _queue: string }; Returns: boolean }
      advance_audit_date: { Args: { _venue_id: string }; Returns: string }
      apply_throttle_on_order_insert_for: {
        Args: { _order_id: string; _venue_id: string }
        Returns: undefined
      }
      can_manage_loyalty_program_balance: {
        Args: { _program_id: string; _user_id: string }
        Returns: boolean
      }
      close_idle_web_sessions: { Args: never; Returns: number }
      close_table_session: { Args: { _session_id: string }; Returns: boolean }
      create_venue_with_owner: {
        Args: {
          _address?: string
          _city?: string
          _display_name?: string
          _email?: string
          _name: string
          _phone?: string
          _postcode?: string
          _state?: string
          _venue_type?: string
        }
        Returns: string
      }
      dequeue_jobs: {
        Args: { _qty?: number; _queue: string; _vt_seconds?: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      enqueue_job: { Args: { _payload: Json; _queue: string }; Returns: number }
      enqueue_pos_job: { Args: { _payload: Json }; Returns: number }
      ensure_monthly_partition: {
        Args: { _month: string; _parent: unknown }
        Returns: undefined
      }
      ensure_stripe_customer_for_venue: {
        Args: { _stripe_customer_id?: string; _venue_id: string }
        Returns: string
      }
      find_or_create_table_session: {
        Args: {
          _display_name?: string
          _fire_strategy?: string
          _host_diner_id?: string
          _join_existing_id?: string
          _table_id: string
          _venue_id: string
        }
        Returns: string
      }
      fire_table_session: { Args: { _session_id: string }; Returns: boolean }
      generate_invoice_number: { Args: never; Returns: string }
      generate_site_id: { Args: never; Returns: string }
      get_active_loyalty_program: {
        Args: { p_venue_id: string }
        Returns: {
          group_id: string
          id: string
          is_ordrup_builtin: boolean
          name: string
          program_type: Database["public"]["Enums"]["loyalty_program_type"]
          rules: Json
          venue_id: string
        }[]
      }
      get_admin_dashboard: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      get_ar_dashboard: { Args: { _from: string; _to: string }; Returns: Json }
      get_diner_order_status: {
        Args: { _order_id: string }
        Returns: {
          created_at: string
          extra_wait_minutes: number
          id: string
          status: string
          throttled_until: string
          total: number
        }[]
      }
      get_menu_snapshot: {
        Args: { _table_id?: string; _venue_id: string }
        Returns: Json
      }
      get_platform_financials: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      get_platform_performance: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      get_terminal_by_token: {
        Args: { _token: string }
        Returns: {
          area_ids: string[]
          is_active: boolean
          terminal_id: string
          terminal_name: string
          venue_id: string
        }[]
      }
      get_user_diner_profile_id: { Args: never; Returns: string }
      get_venue_audit_date: { Args: { _venue_id: string }; Returns: string }
      get_venue_payment_active: {
        Args: { _venue_id: string }
        Returns: {
          is_active: boolean
          provider: string
        }[]
      }
      get_venue_performance: {
        Args: { _from: string; _to: string; _venue_id: string }
        Returns: Json
      }
      get_venue_public_info: {
        Args: { _venue_id: string }
        Returns: {
          city: string
          country: string
          id: string
          is_active: boolean
          landing_page_html: string
          logo_url: string
          name: string
          operating_hours: Json
          settings: Json
          state: string
          venue_type: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat_display_terminal: { Args: { _token: string }; Returns: boolean }
      initialize_venue_audit_date: {
        Args: { _venue_id: string }
        Returns: string
      }
      is_group_admin: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_venue_manager: {
        Args: { _user_id: string; _venue_id: string }
        Returns: boolean
      }
      is_venue_staff: {
        Args: { _user_id: string; _venue_id: string }
        Returns: boolean
      }
      list_ar_invoices: {
        Args: {
          _from?: string
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string[]
          _to?: string
          _venue_id?: string
        }
        Returns: {
          attempt_count: number
          created_at: string
          currency: string
          due_date: string
          id: string
          invoice_number: string
          paid_at: string
          period_end: string
          period_start: string
          status: string
          total: number
          total_count: number
          venue_id: string
          venue_name: string
        }[]
      }
      list_open_sessions_at_table: {
        Args: { _table_id: string; _venue_id: string }
        Returns: {
          diner_count: number
          display_name: string
          fire_strategy: string
          host_first_name: string
          id: string
          opened_at: string
        }[]
      }
      loadtest_top_queries: {
        Args: never
        Returns: {
          calls: number
          mean_ms: number
          p95_ms: number
          query: string
        }[]
      }
      lookup_venue_by_site_id: {
        Args: { _site_id: string }
        Returns: {
          venue_id: string
          venue_name: string
        }[]
      }
      maintain_log_partitions: { Args: never; Returns: undefined }
      migrate_loyalty_balances_to_program: {
        Args: {
          _deactivate_source?: boolean
          _from_program: string
          _to_program: string
        }
        Returns: Json
      }
      pair_display_terminal: {
        Args: { _code: string; _user_agent: string }
        Returns: {
          area_ids: string[]
          device_token: string
          terminal_id: string
          terminal_name: string
        }[]
      }
      purge_api_idempotency: { Args: never; Returns: number }
      read_pos_credential: {
        Args: { _field: string; _venue_id: string }
        Returns: string
      }
      search_admin_venues: {
        Args: {
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
          _venue_type?: string
        }
        Returns: Json
      }
      set_pos_credential: {
        Args: { _field: string; _value: string; _venue_id: string }
        Returns: string
      }
      set_primary_venue: { Args: { _venue_id: string }; Returns: undefined }
      unpair_display_terminal: {
        Args: { _terminal_id: string }
        Returns: boolean
      }
      verify_api_key: {
        Args: { _full_key: string; _prefix: string }
        Returns: {
          key_id: string
          partner_id: string
          partner_type: Database["public"]["Enums"]["api_partner_type"]
          scopes: string[]
          venue_id: string
        }[]
      }
    }
    Enums: {
      alert_status: "pending" | "acknowledged" | "resolved"
      alert_type: "manager_request" | "assistance" | "complaint"
      api_partner_type: "pos" | "crm"
      app_role: "tabless_admin"
      group_staff_role: "group_admin" | "group_viewer"
      loyalty_program_type: "points" | "stamps" | "tier"
      order_status:
        | "received"
        | "preparing"
        | "ready"
        | "served"
        | "paid"
        | "cancelled"
        | "refunded"
      tax_type: "percent" | "fixed" | "compound_percent"
      venue_staff_role: "owner" | "manager" | "staff"
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
    Enums: {
      alert_status: ["pending", "acknowledged", "resolved"],
      alert_type: ["manager_request", "assistance", "complaint"],
      api_partner_type: ["pos", "crm"],
      app_role: ["tabless_admin"],
      group_staff_role: ["group_admin", "group_viewer"],
      loyalty_program_type: ["points", "stamps", "tier"],
      order_status: [
        "received",
        "preparing",
        "ready",
        "served",
        "paid",
        "cancelled",
        "refunded",
      ],
      tax_type: ["percent", "fixed", "compound_percent"],
      venue_staff_role: ["owner", "manager", "staff"],
    },
  },
} as const
