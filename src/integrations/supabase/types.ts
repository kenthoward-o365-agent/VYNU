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
      order_items: {
        Row: {
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
            foreignKeyName: "pos_sync_log_venue_id_fkey"
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
      venue_billing_config: {
        Row: {
          billing_currency: string
          commission_percent: number
          created_at: string
          id: string
          inherit_from_group: boolean
          min_monthly_fee: number
          notes: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          billing_currency?: string
          commission_percent?: number
          created_at?: string
          id?: string
          inherit_from_group?: boolean
          min_monthly_fee?: number
          notes?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          billing_currency?: string
          commission_percent?: number
          created_at?: string
          id?: string
          inherit_from_group?: boolean
          min_monthly_fee?: number
          notes?: string | null
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
      venue_pos_integrations: {
        Row: {
          account_id: string | null
          api_key_ref: string | null
          client_id: string | null
          client_secret_ref: string | null
          config: Json | null
          created_at: string
          endpoint_url: string | null
          id: string
          last_sync_at: string | null
          location_id: string | null
          pos_provider: string
          sync_status: string
          token_cache: Json | null
          updated_at: string
          venue_id: string
          webhook_secret: string | null
        }
        Insert: {
          account_id?: string | null
          api_key_ref?: string | null
          client_id?: string | null
          client_secret_ref?: string | null
          config?: Json | null
          created_at?: string
          endpoint_url?: string | null
          id?: string
          last_sync_at?: string | null
          location_id?: string | null
          pos_provider: string
          sync_status?: string
          token_cache?: Json | null
          updated_at?: string
          venue_id: string
          webhook_secret?: string | null
        }
        Update: {
          account_id?: string | null
          api_key_ref?: string | null
          client_id?: string | null
          client_secret_ref?: string | null
          config?: Json | null
          created_at?: string
          endpoint_url?: string | null
          id?: string
          last_sync_at?: string | null
          location_id?: string | null
          pos_provider?: string
          sync_status?: string
          token_cache?: Json | null
          updated_at?: string
          venue_id?: string
          webhook_secret?: string | null
        }
        Relationships: [
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
      unpair_display_terminal: {
        Args: { _terminal_id: string }
        Returns: boolean
      }
    }
    Enums: {
      alert_status: "pending" | "acknowledged" | "resolved"
      alert_type: "manager_request" | "assistance" | "complaint"
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
