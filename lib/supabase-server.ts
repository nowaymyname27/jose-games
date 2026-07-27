import { createClient } from "@supabase/supabase-js";

import type { D20RoomState } from "@/lib/d20-types";
import type { TournamentRoomState } from "@/lib/tournament-types";

type SupabaseDatabase = {
  public: {
    Tables: {
      tournament_rooms: {
        Row: {
          code: string;
          state: TournamentRoomState;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          state: TournamentRoomState;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          state?: TournamentRoomState;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      d20_rooms: {
        Row: {
          code: string;
          state: D20RoomState;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          state: D20RoomState;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          state?: D20RoomState;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

let cachedClient: ReturnType<typeof createClient<SupabaseDatabase>> | null = null;

export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  if (!cachedClient) {
    cachedClient = createClient<SupabaseDatabase>(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedClient;
}

export function hasSupabaseServerConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
