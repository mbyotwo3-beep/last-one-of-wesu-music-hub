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
      albums: {
        Row: {
          artist_id: string
          cover_url: string | null
          created_at: string
          description: string | null
          featured: boolean
          genre: string | null
          id: string
          price: number | null
          release_date: string | null
          status: string
          title: string
        }
        Insert: {
          artist_id: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          featured?: boolean
          genre?: string | null
          id?: string
          price?: number | null
          release_date?: string | null
          status?: string
          title: string
        }
        Update: {
          artist_id?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          featured?: boolean
          genre?: string | null
          id?: string
          price?: number | null
          release_date?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "albums_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_followers: {
        Row: {
          artist_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_followers_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artists: {
        Row: {
          accepts_collabs: boolean
          available_for_features: boolean
          avatar_url: string | null
          bio: string | null
          cover_url: string | null
          created_at: string
          feature_rate: number | null
          follower_count: number
          genre: string | null
          id: string
          label_id: string | null
          monthly_listeners: number
          name: string
          social_links: Json
          status: string
          updated_at: string
          user_id: string
          verification_status: string
          verified: boolean
        }
        Insert: {
          accepts_collabs?: boolean
          available_for_features?: boolean
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          feature_rate?: number | null
          follower_count?: number
          genre?: string | null
          id?: string
          label_id?: string | null
          monthly_listeners?: number
          name: string
          social_links?: Json
          status?: string
          updated_at?: string
          user_id: string
          verification_status?: string
          verified?: boolean
        }
        Update: {
          accepts_collabs?: boolean
          available_for_features?: boolean
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          feature_rate?: number | null
          follower_count?: number
          genre?: string | null
          id?: string
          label_id?: string | null
          monthly_listeners?: number
          name?: string
          social_links?: Json
          status?: string
          updated_at?: string
          user_id?: string
          verification_status?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "artists_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          meta: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      featured_slots: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          position: number
          slot_type: string
          starts_at: string
          subtitle: string | null
          target_id: string
          target_type: string
          title: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          position?: number
          slot_type: string
          starts_at?: string
          subtitle?: string | null
          target_id: string
          target_type: string
          title?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          position?: number
          slot_type?: string
          starts_at?: string
          subtitle?: string | null
          target_id?: string
          target_type?: string
          title?: string | null
        }
        Relationships: []
      }
      home_carousel_items: {
        Row: {
          carousel_id: string
          created_at: string
          id: string
          image_url: string
          link_url: string
          position: number
          subtitle: string | null
          title: string
        }
        Insert: {
          carousel_id: string
          created_at?: string
          id?: string
          image_url: string
          link_url: string
          position?: number
          subtitle?: string | null
          title: string
        }
        Update: {
          carousel_id?: string
          created_at?: string
          id?: string
          image_url?: string
          link_url?: string
          position?: number
          subtitle?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_carousel_items_carousel_id_fkey"
            columns: ["carousel_id"]
            isOneToOne: false
            referencedRelation: "home_carousels"
            referencedColumns: ["id"]
          },
        ]
      }
      home_carousels: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          position: number
          show_all_link: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          show_all_link?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          show_all_link?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          created_at: string
          from_user_id: string | null
          id: string
          kind: string
          payload: Json
          responded_at: string | null
          status: string
          to_email: string | null
          to_user_id: string | null
        }
        Insert: {
          created_at?: string
          from_user_id?: string | null
          id?: string
          kind: string
          payload?: Json
          responded_at?: string | null
          status?: string
          to_email?: string | null
          to_user_id?: string | null
        }
        Update: {
          created_at?: string
          from_user_id?: string | null
          id?: string
          kind?: string
          payload?: Json
          responded_at?: string | null
          status?: string
          to_email?: string | null
          to_user_id?: string | null
        }
        Relationships: []
      }
      label_artists: {
        Row: {
          artist_id: string
          created_at: string
          id: string
          joined_at: string | null
          label_id: string
          royalty_pct: number
          status: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          id?: string
          joined_at?: string | null
          label_id: string
          royalty_pct?: number
          status?: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          id?: string
          joined_at?: string | null
          label_id?: string
          royalty_pct?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "label_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "label_artists_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          bio: string | null
          commission_pct: number
          contact_email: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          owner_user_id: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          bio?: string | null
          commission_pct?: number
          contact_email?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          owner_user_id: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          commission_pct?: number
          contact_email?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          owner_user_id?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          category: string
          code: string
          created_at: string
          id: string
          is_enabled: boolean
          label: string
          lenco_operator: string | null
          logo_url: string | null
          sort_order: number
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          label: string
          lenco_operator?: string | null
          logo_url?: string | null
          sort_order?: number
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          label?: string
          lenco_operator?: string | null
          logo_url?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          item_id: string | null
          item_type: string
          metadata: Json
          method_code: string
          provider: string
          provider_ref: string | null
          provider_token: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          item_id?: string | null
          item_type: string
          metadata?: Json
          method_code: string
          provider?: string
          provider_ref?: string | null
          provider_token?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          item_id?: string | null
          item_type?: string
          metadata?: Json
          method_code?: string
          provider?: string
          provider_ref?: string | null
          provider_token?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payouts: {
        Row: {
          amount: number
          artist_id: string
          destination: string
          gross_amount: number | null
          id: string
          label_fee: number | null
          label_id: string | null
          method_code: string
          net_amount: number | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          platform_fee: number | null
          processed_at: string | null
          processed_by: string | null
          requested_at: string
          status: string
        }
        Insert: {
          amount: number
          artist_id: string
          destination: string
          gross_amount?: number | null
          id?: string
          label_fee?: number | null
          label_id?: string | null
          method_code: string
          net_amount?: number | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          platform_fee?: number | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
        }
        Update: {
          amount?: number
          artist_id?: string
          destination?: string
          gross_amount?: number | null
          id?: string
          label_fee?: number | null
          label_id?: string | null
          method_code?: string
          net_amount?: number | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          platform_fee?: number | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      play_history: {
        Row: {
          id: string
          played_at: string
          progress_seconds: number
          song_id: string
          user_id: string
        }
        Insert: {
          id?: string
          played_at?: string
          progress_seconds?: number
          song_id: string
          user_id: string
        }
        Update: {
          id?: string
          played_at?: string
          progress_seconds?: number
          song_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "play_history_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_songs: {
        Row: {
          added_at: string
          id: string
          playlist_id: string
          position: number
          song_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          playlist_id: string
          position?: number
          song_id: string
        }
        Update: {
          added_at?: string
          id?: string
          playlist_id?: string
          position?: number
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_songs_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_songs_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          user_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          user_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          current_subscription_id: string | null
          full_name: string | null
          id: string
          location: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          current_subscription_id?: string | null
          full_name?: string | null
          id?: string
          location?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          current_subscription_id?: string | null
          full_name?: string | null
          id?: string
          location?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          album_id: string | null
          amount: number
          created_at: string
          id: string
          payment_method: string
          song_id: string | null
          status: string
          transaction_ref: string | null
          user_id: string
        }
        Insert: {
          album_id?: string | null
          amount: number
          created_at?: string
          id?: string
          payment_method?: string
          song_id?: string | null
          status?: string
          transaction_ref?: string | null
          user_id: string
        }
        Update: {
          album_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          payment_method?: string
          song_id?: string | null
          status?: string
          transaction_ref?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_splits: {
        Row: {
          amount: number
          artist_id: string | null
          created_at: string
          id: string
          label_id: string | null
          payee_role: string
          payee_user_id: string | null
          pct: number
          transaction_id: string
        }
        Insert: {
          amount: number
          artist_id?: string | null
          created_at?: string
          id?: string
          label_id?: string | null
          payee_role: string
          payee_user_id?: string | null
          pct: number
          transaction_id: string
        }
        Update: {
          amount?: number
          artist_id?: string | null
          created_at?: string
          id?: string
          label_id?: string | null
          payee_role?: string
          payee_user_id?: string | null
          pct?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_splits_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_splits_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_splits_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_albums: {
        Row: {
          album_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          album_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          album_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_albums_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_tracks: {
        Row: {
          created_at: string
          id: string
          song_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          song_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          song_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_tracks_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      song_collaborators: {
        Row: {
          accepted: boolean
          artist_id: string
          created_at: string
          id: string
          invited_by: string | null
          role: string
          song_id: string
          split_pct: number
        }
        Insert: {
          accepted?: boolean
          artist_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          song_id: string
          split_pct?: number
        }
        Update: {
          accepted?: boolean
          artist_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          song_id?: string
          split_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "song_collaborators_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_collaborators_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      song_likes: {
        Row: {
          created_at: string
          song_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          song_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          song_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_likes_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      songs: {
        Row: {
          album_id: string | null
          allow_collab_requests: boolean
          artist_id: string
          audio_url: string | null
          cover_url: string | null
          created_at: string
          duration: number | null
          explicit: boolean
          genre: string | null
          id: string
          is_trending: boolean
          label_id: string | null
          play_count: number
          price: number | null
          status: string
          title: string
        }
        Insert: {
          album_id?: string | null
          allow_collab_requests?: boolean
          artist_id: string
          audio_url?: string | null
          cover_url?: string | null
          created_at?: string
          duration?: number | null
          explicit?: boolean
          genre?: string | null
          id?: string
          is_trending?: boolean
          label_id?: string | null
          play_count?: number
          price?: number | null
          status?: string
          title: string
        }
        Update: {
          album_id?: string | null
          allow_collab_requests?: boolean
          artist_id?: string
          audio_url?: string | null
          cover_url?: string | null
          created_at?: string
          duration?: number | null
          explicit?: boolean
          genre?: string | null
          id?: string
          is_trending?: boolean
          label_id?: string | null
          play_count?: number
          price?: number | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "songs_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songs_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songs_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          code: string
          created_at: string
          description: string | null
          features: Json
          id: string
          interval: string
          is_active: boolean
          name: string
          price_zmw: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          name: string
          price_zmw?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          name?: string
          price_zmw?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          auto_renew: boolean
          created_at: string
          expires_at: string | null
          id: string
          payment_method: string | null
          plan: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_method?: string | null
          plan?: string
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_method?: string | null
          plan?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
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
    }
    Views: {
      public_song_collaborators: {
        Row: {
          accepted: boolean | null
          artist_id: string | null
          created_at: string | null
          id: string | null
          role: string | null
          song_id: string | null
        }
        Insert: {
          accepted?: boolean | null
          artist_id?: string | null
          created_at?: string | null
          id?: string | null
          role?: string | null
          song_id?: string | null
        }
        Update: {
          accepted?: boolean | null
          artist_id?: string | null
          created_at?: string | null
          id?: string | null
          role?: string | null
          song_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "song_collaborators_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_collaborators_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_artist_available_balance: {
        Args: { artist_uuid: string }
        Returns: number
      }
      get_label_available_balance: {
        Args: { label_uuid: string }
        Returns: number
      }
      increment_play_count: { Args: { _song_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "artist" | "user" | "superadmin" | "label"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "artist", "user", "superadmin", "label"],
    },
  },
} as const
